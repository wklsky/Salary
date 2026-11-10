<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/income/IncomeEditor.vue
 * @Description: 收入项编辑器，支持自由增删薪酬组成与计税/计基口径开关
 */
import { computed } from 'vue'
import { Delete, ArrowDown, ArrowUp, Plus } from '@element-plus/icons-vue'
import { STAGE_LABELS } from '@/config/stages'
import {
  amountOfMonth,
  amountOfStage,
  isItemEnabledInStage,
  OTHER_INCOME_HINTS,
  round2,
  stageTypeOfMonth,
} from '@/core'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import MoneyInput from '@/components/common/MoneyInput.vue'
import { formatMoney } from '@/utils/format'
import { STAGE_TYPES } from '@/types'
import type { IncomeCycle, IncomeKind, IncomeItem, StageType } from '@/types'

const store = useSalaryStore()
const { result } = useSalaryCalculator()

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 月`,
}))

const CYCLE_OPTIONS: { value: IncomeCycle; label: string }[] = [
  { value: 'monthly', label: '逐月发放' },
  { value: 'once', label: '一次性发放' },
]

const KIND_OPTIONS: { value: IncomeKind; label: string }[] = [
  { value: 'salary', label: '工资薪金' },
  { value: 'bonus', label: '全年一次性奖金' },
  { value: 'labor', label: '劳务报酬' },
  { value: 'authorship', label: '稿酬' },
  { value: 'royalty', label: '特许权使用费' },
]

/** 读取收入项在某阶段的金额，未单独设置时回落到通用金额 */
function stageAmountOf(item: IncomeItem, stage: StageType): number {
  return amountOfStage(item, stage)
}

/** 收入项在某阶段是否发放，用于表达「转正后才有的福利」 */
function isStageOn(item: IncomeItem, stage: StageType): boolean {
  return isItemEnabledInStage(item, stage)
}

/** 逐月金额模式下的某月金额，未单独设置时回落到当前解析值 */
function monthlyAmountOf(item: IncomeItem, month: number): number {
  return amountOfMonth(item, month, stageTypeOfMonth(store.stages, month))
}

/** 逐月金额合计，用于核对录入 */
function monthlyAmountsSum(item: IncomeItem): number {
  return (item.monthlyAmounts ?? []).reduce((acc, value) => acc + value, 0)
}

/** 计分制收入项某月分数 */
function scoreOf(item: IncomeItem, month: number): number {
  return item.monthlyScores?.[month - 1] ?? 0
}

/** 计分制收入项某月折算金额 = 分数 × 每分金额 */
function scoreAmountOf(item: IncomeItem, month: number): number {
  return round2(scoreOf(item, month) * (item.perPointAmount ?? 0))
}

/** 计分制全年分数与金额，用于核对录入 */
function scoreAnnual(item: IncomeItem): { score: number; amount: number } {
  const score = (item.monthlyScores ?? []).reduce((acc, value) => acc + (value || 0), 0)
  return {
    score: round2(score),
    amount: round2(score * (item.perPointAmount ?? 0)),
  }
}

/**
 * 月度收入合计，按 12 月（通常已转正）口径展示，用于快速核对录入是否完整
 * 逐月浮动的收入项取 12 月金额，年度合计请看下方的「年度应发」
 */
const monthlyTotal = computed(() =>
  store.incomes
    .filter((item) => item.enabled && item.cycle === 'monthly')
    .reduce((acc, item) => acc + amountOfMonth(item, 12, stageTypeOfMonth(store.stages, 12)), 0),
)

/** 一次性收入按其实际发放月份所处阶段取值，实习期发放的奖金可能不同 */
function actualAmountOf(item: IncomeItem): number {
  return amountOfStage(item, stageTypeOfMonth(store.stages, item.month))
}

/** 一次性收入合计 */
const onceTotal = computed(() =>
  store.incomes
    .filter((item) => item.enabled && item.cycle === 'once')
    .reduce((acc, item) => acc + actualAmountOf(item), 0),
)

/** 年度应发含各阶段差异，直接取计算内核结果避免口径不一致 */
const annualTotal = computed(() => result.value.annual.gross)
</script>

<template>
  <section class="income-editor">
    <header class="income-editor__summary">
      <div class="summary-cell">
        <span class="summary-cell__label">月度应发</span>
        <strong class="summary-cell__value">¥{{ formatMoney(monthlyTotal) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-cell__label">一次性收入</span>
        <strong class="summary-cell__value">¥{{ formatMoney(onceTotal) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-cell__label">年度应发</span>
        <strong class="summary-cell__value accent">¥{{ formatMoney(annualTotal) }}</strong>
      </div>
    </header>

    <el-empty v-if="store.incomes.length === 0" description="暂无收入项，点击下方按钮新增" />

    <ul class="income-list">
      <li
        v-for="(item, index) in store.incomes"
        :key="item.id"
        class="income-item"
        :class="{ 'income-item--disabled': !item.enabled }"
      >
        <div class="income-item__head">
          <el-switch v-model="item.enabled" size="small" />
          <el-input v-model="item.name" class="income-item__name" placeholder="项目名称" />
          <template v-if="item.scoreBased">
            <MoneyInput
              :model-value="item.perPointAmount ?? 0"
              class="income-item__amount"
              @update:model-value="
                (value: number) => store.updateIncome(item.id, { perPointAmount: value })
              "
            />
            <span class="income-item__unit">元/分</span>
          </template>
          <MoneyInput
            v-else-if="!item.staged"
            :model-value="item.amount"
            class="income-item__amount"
            @update:model-value="(value) => store.updateIncome(item.id, { amount: value })"
          />
          <span
            v-else
            class="income-item__amount income-item__amount--staged"
            title="已按阶段区分发放，实际发放额以各阶段金额为准"
          >
            按阶段金额
          </span>
          <el-select
            v-if="!item.scoreBased"
            v-model="item.cycle"
            class="income-item__cycle"
          >
            <el-option
              v-for="option in CYCLE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-select
            v-if="!item.scoreBased && item.cycle === 'once'"
            v-model="item.month"
            class="income-item__month"
          >
            <el-option
              v-for="option in MONTH_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <div class="income-item__ops">
            <el-button
              :icon="ArrowUp"
              size="small"
              text
              :disabled="index === 0"
              @click="store.moveIncome(item.id, -1)"
            />
            <el-button
              :icon="ArrowDown"
              size="small"
              text
              :disabled="index === store.incomes.length - 1"
              @click="store.moveIncome(item.id, 1)"
            />
            <el-button
              :icon="Delete"
              size="small"
              text
              type="danger"
              @click="store.removeIncome(item.id)"
            />
          </div>
        </div>

        <p v-if="item.staged && !item.scoreBased" class="income-item__tip">
          已按阶段区分发放：通用金额输入框由下方各阶段金额替代，改动阶段金额立即生效
        </p>

        <div class="income-item__foot">
          <el-select v-model="item.kind" class="income-item__kind">
            <el-option
              v-for="option in KIND_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-checkbox
            v-if="item.cycle === 'monthly'"
            :model-value="item.scoreBased ?? false"
            size="small"
            @update:model-value="(value: boolean) => store.toggleScoreBased(item.id, value)"
          >
            按绩效分数计价
          </el-checkbox>
          <el-checkbox v-model="item.intoInsuranceBase" size="small">计入缴费基数</el-checkbox>
          <el-checkbox v-model="item.taxable" size="small">并入综合所得</el-checkbox>
          <el-checkbox v-model="item.nonCash" size="small">
            计入税前收入，不实际发放（餐补/饭票）
          </el-checkbox>
        </div>

        <p v-if="item.nonCash" class="income-item__tip">
          餐补、饭票、购物卡等：计入应发合计与应纳税所得额（参与计税），但不作为实际发放工资，不计入到手与实发工资
        </p>

        <p v-if="OTHER_INCOME_HINTS[item.kind]" class="income-item__tip">
          {{ OTHER_INCOME_HINTS[item.kind] }}
        </p>

        <div v-if="!item.scoreBased" class="income-item__stage">
          <el-checkbox
            :model-value="item.staged"
            size="small"
            @update:model-value="(value: boolean) => store.toggleStagedIncome(item.id, value)"
          >
            按阶段区分发放
          </el-checkbox>
          <el-checkbox
            v-if="item.cycle === 'monthly'"
            :model-value="item.variableByMonth"
            size="small"
            @update:model-value="(value: boolean) => store.toggleVariableByMonth(item.id, value)"
          >
            每月金额不同
          </el-checkbox>
        </div>

        <div v-if="item.staged && !item.scoreBased" class="income-item__stage-amounts">
          <div v-for="type in STAGE_TYPES" :key="type" class="stage-cell">
            <el-checkbox
              :model-value="isStageOn(item, type)"
              class="stage-cell__switch"
              size="small"
              @update:model-value="
                (value: boolean) => store.toggleStageEnabled(item.id, type, value)
              "
            >
              {{ STAGE_LABELS[type] }}
            </el-checkbox>
            <MoneyInput
              v-if="isStageOn(item, type) && !item.variableByMonth"
              :model-value="stageAmountOf(item, type)"
              @update:model-value="
                (value: number) => store.updateStageAmount(item.id, type, value)
              "
            />
            <span v-else-if="!isStageOn(item, type)" class="stage-cell__off">该阶段不发放</span>
            <span v-else class="stage-cell__off">按逐月金额</span>
          </div>
        </div>

        <div v-if="item.variableByMonth && !item.scoreBased" class="income-item__months">
          <div v-for="month in 12" :key="month" class="month-cell">
            <span class="month-cell__label">{{ month }} 月</span>
            <MoneyInput
              :model-value="monthlyAmountOf(item, month)"
              @update:model-value="
                (value: number) => store.updateMonthlyAmount(item.id, month, value)
              "
            />
          </div>
          <p class="income-item__tip">
            全年合计 ¥{{ formatMoney(monthlyAmountsSum(item)) }}，逐月金额优先于阶段金额
          </p>
        </div>

        <div v-if="item.scoreBased" class="income-item__months">
          <div v-for="month in 12" :key="month" class="month-cell">
            <span class="month-cell__label">{{ month }} 月分数</span>
            <el-input-number
              :model-value="scoreOf(item, month)"
              :min="0"
              :max="999"
              :step="1"
              :precision="2"
              controls-position="right"
              class="month-cell__score"
              @update:model-value="
                (value: number | undefined) =>
                  store.updateMonthlyScore(item.id, month, Number(value) || 0)
              "
            />
            <span class="month-cell__amount">≈ ¥{{ formatMoney(scoreAmountOf(item, month)) }}</span>
          </div>
          <p class="income-item__tip">
            每分金额 ¥{{ formatMoney(item.perPointAmount ?? 0) }}，全年
            {{ scoreAnnual(item).score }} 分 ≈ ¥{{ formatMoney(scoreAnnual(item).amount) }}；
            金额 = 每月分数 × 每分金额
          </p>
        </div>
      </li>
    </ul>

    <footer class="income-editor__actions">
      <el-button :icon="Plus" @click="store.addIncome('salary')">新增收入项</el-button>
      <el-button :icon="Plus" type="warning" plain @click="store.addIncome('bonus')">
        新增年终奖
      </el-button>
      <el-button :icon="Plus" plain @click="store.addIncome('labor')">
        新增劳务报酬
      </el-button>
    </footer>
  </section>
</template>

<style scoped>
.income-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.income-editor__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 240px));
  gap: 8px;
}

.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.summary-cell__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-cell__value {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.summary-cell__value.accent {
  color: var(--el-color-primary);
}

.income-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.income-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  transition: border-color 0.2s;
}

.income-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.income-item--disabled {
  opacity: 0.55;
}

.income-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 宽屏固定列：开关/名称/金额/周期/月份/操作各占一列，多条收入项纵向对齐 */
@media (min-width: 900px) {
  .income-item__head {
    display: grid;
    grid-template-columns: auto minmax(120px, 1fr) 160px auto 88px auto;
  }

  .income-item__name {
    grid-column: 2;
  }

  .income-item__amount {
    grid-column: 3;
  }

  .income-item__unit {
    grid-column: 4;
  }

  .income-item__cycle {
    grid-column: 4;
  }

  .income-item__month {
    grid-column: 5;
  }

  .income-item__ops {
    grid-column: 6;
  }
}

.income-item__name {
  flex: 1 1 140px;
  min-width: 120px;
}

/* 金额/周期固定宽度，窄屏时靠 flex-wrap 换行而不是被压扁 */
.income-item__amount {
  width: 160px;
}

/* 阶段差异化时不再显示通用金额输入，改用以占位提示，避免出现「改了不生效」的幽灵输入框 */
.income-item__amount--staged {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  cursor: help;
}

.income-item__cycle {
  width: 118px;
}

.income-item__unit {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.income-item__month {
  width: 88px;
}

.income-item__ops {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.income-item__ops .el-button + .el-button {
  margin-left: 0;
}

.income-item__foot {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.income-item__kind {
  width: 130px;
}

/* 阶段格子按内容宽度和左对齐排列，避免三列均分全宽时勾选框与金额框错位 */
.income-item__stage-amounts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}

.stage-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 190px;
}

.stage-cell__switch {
  margin-right: 0;
  height: 20px;
}

.stage-cell__off {
  height: 32px;
  font-size: 12px;
  line-height: 32px;
  color: var(--el-text-color-placeholder);
}

.income-item__months {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
}

.month-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.month-cell__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.month-cell__score {
  width: 100%;
}

.month-cell__amount {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}

.income-item__tip {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 逐月网格中的汇总提示独占整行，避免被挤在最后一个月份格子里 */
.income-item__months > .income-item__tip {
  grid-column: 1 / -1;
}

.income-editor__actions {
  display: flex;
  gap: 8px;
}
</style>
