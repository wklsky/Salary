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
          <el-input v-model="item.name" size="small" class="income-item__name" placeholder="项目名称" />
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

        <div class="income-item__body">
          <MoneyInput
            :model-value="item.amount"
            size="small"
            @update:model-value="(value) => store.updateIncome(item.id, { amount: value })"
          />
          <el-select
            v-model="item.cycle"
            size="small"
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
            v-if="item.cycle === 'once'"
            v-model="item.month"
            size="small"
            class="income-item__month"
          >
            <el-option
              v-for="option in MONTH_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>

        <div class="income-item__foot">
          <el-select v-model="item.kind" size="small" class="income-item__kind">
            <el-option
              v-for="option in KIND_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-checkbox v-model="item.intoInsuranceBase" size="small">计入缴费基数</el-checkbox>
          <el-checkbox v-model="item.taxable" size="small">并入综合所得</el-checkbox>
          <el-checkbox v-model="item.nonCash" size="small">非现金福利（不计入到手）</el-checkbox>
        </div>

        <p v-if="item.nonCash" class="income-item__tip">
          饭票、购物卡等：计入应发与应纳税所得额，但员工拿不到现金，故从到手中剔除
        </p>

        <p v-if="OTHER_INCOME_HINTS[item.kind]" class="income-item__tip">
          {{ OTHER_INCOME_HINTS[item.kind] }}
        </p>

        <div class="income-item__stage">
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

        <div v-if="item.staged" class="income-item__stage-amounts">
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
              size="small"
              @update:model-value="
                (value: number) => store.updateStageAmount(item.id, type, value)
              "
            />
            <span v-else-if="!isStageOn(item, type)" class="stage-cell__off">该阶段不发放</span>
            <span v-else class="stage-cell__off">按逐月金额</span>
          </div>
        </div>

        <div v-if="item.variableByMonth" class="income-item__months">
          <div v-for="month in 12" :key="month" class="month-cell">
            <span class="month-cell__label">{{ month }} 月</span>
            <MoneyInput
              :model-value="monthlyAmountOf(item, month)"
              size="small"
              @update:model-value="
                (value: number) => store.updateMonthlyAmount(item.id, month, value)
              "
            />
          </div>
          <p class="income-item__tip">
            全年合计 ¥{{ formatMoney(monthlyAmountsSum(item)) }}，逐月金额优先于阶段金额
          </p>
        </div>
      </li>
    </ul>

    <footer class="income-editor__actions">
      <el-button :icon="Plus" size="small" @click="store.addIncome('salary')">新增收入项</el-button>
      <el-button :icon="Plus" size="small" type="warning" plain @click="store.addIncome('bonus')">
        新增年终奖
      </el-button>
      <el-button :icon="Plus" size="small" plain @click="store.addIncome('labor')">
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
  grid-template-columns: repeat(3, 1fr);
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
  gap: 6px;
}

.income-item__name {
  flex: 1;
}

.income-item__body {
  display: flex;
  align-items: center;
  gap: 8px;
}

.income-item__cycle {
  width: 120px;
}

.income-item__month {
  width: 88px;
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

.income-item__stage-amounts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stage-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stage-cell__switch {
  margin-right: 0;
  height: 20px;
}

.stage-cell__off {
  height: 24px;
  font-size: 12px;
  line-height: 24px;
  color: var(--el-text-color-placeholder);
}

.income-item__months {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
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

.income-item__tip {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.income-editor__actions {
  display: flex;
  gap: 8px;
}
</style>
