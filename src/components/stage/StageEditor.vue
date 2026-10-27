<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/stage/StageEditor.vue
 * @Description: 雇佣阶段编辑器：阶段月份区间、社保缴纳开关，以及各阶段的工资福利填写
 */
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { INSURANCE_LABELS } from '@/config/columns'
import { MAX_MONTH, MIN_MONTH, STAGE_HINTS, STAGE_LABELS, validateStages } from '@/config/stages'
import { amountOfStage, dec, isItemEnabledInStage, round2 } from '@/core'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import MoneyInput from '@/components/common/MoneyInput.vue'
import { formatMoney } from '@/utils/format'
import { INSURANCE_TYPES, STAGE_TYPES } from '@/types'
import type { IncomeItem, InsuranceType, StageRange, StageType } from '@/types'

const store = useSalaryStore()
const { result } = useSalaryCalculator()

const INSURANCE_OPTIONS = INSURANCE_TYPES.map((type) => ({
  value: type,
  label: INSURANCE_LABELS[type],
}))

const MONTH_OPTIONS = Array.from({ length: MAX_MONTH - MIN_MONTH + 1 }, (_, index) => ({
  value: index + MIN_MONTH,
  label: `${index + MIN_MONTH} 月`,
}))

const STAGE_OPTIONS = STAGE_TYPES.map((type) => ({ value: type, label: STAGE_LABELS[type] }))

const issues = computed(() => validateStages(store.stages))
const errorIssues = computed(() => issues.value.filter((issue) => issue.level === 'error'))
const warningIssues = computed(() => issues.value.filter((issue) => issue.level === 'warning'))

/** 该阶段起始月的应发额，用于快速核对阶段工资是否已按预期差异化 */
function grossOfStage(stage: StageRange): number {
  return result.value.monthly.find((month) => month.month === stage.fromMonth)?.gross ?? 0
}

/** 该阶段是否命中校验错误，用于行内高亮 */
function hasError(stageId: string): boolean {
  return errorIssues.value.some((issue) => issue.stageId === stageId)
}

/** 把离散月份压缩成可读区间，如 [1,2,3,6] → 1-3、6 */
function compressMonths(months: number[]): string {
  if (months.length === 0) return '未配置区间'
  const sorted = [...months].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0] as number
  let prev = start
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index] as number
    if (current === prev + 1) {
      prev = current
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = current
    prev = current
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`)
  return `第 ${parts.join('、')} 月`
}

interface StagePlanRow {
  item: IncomeItem
  enabled: boolean
  amount: number
  /** 该收入项按逐月金额取值，阶段金额不生效 */
  variable: boolean
}

interface StagePlan {
  type: StageType
  monthsText: string
  rows: StagePlanRow[]
  monthlyTotal: number
}

/** 按阶段聚合工资福利，让用户在同一处完成整套方案的分阶段填写 */
const stagePlans = computed<StagePlan[]>(() =>
  STAGE_TYPES.map((type) => {
    const months = store.stages
      .filter((stage) => stage.type === type)
      .flatMap((stage) =>
        Array.from(
          { length: Math.max(0, stage.toMonth - stage.fromMonth + 1) },
          (_, index) => stage.fromMonth + index,
        ),
      )

    const rows: StagePlanRow[] = store.incomes.map((item) => {
      const variable = item.variableByMonth === true
      // 逐月浮动的收入项在该阶段没有统一金额，展示阶段内各月的平均值便于核对
      const amount = variable
        ? months.length > 0
          ? round2(
              dec(
                months.reduce((acc, month) => acc + (item.monthlyAmounts?.[month - 1] ?? 0), 0),
              ).div(months.length),
            )
          : 0
        : amountOfStage(item, type)
      return {
        item,
        enabled: isItemEnabledInStage(item, type),
        amount,
        variable,
      }
    })

    // 一次性收入不计入月度应发，单独在其发放月体现
    const monthlyTotal = round2(
      rows
        .filter((row) => row.enabled && row.item.enabled && row.item.cycle === 'monthly')
        .reduce((acc, row) => acc + row.amount, 0),
    )

    return { type, monthsText: compressMonths(months), rows, monthlyTotal }
  }),
)

/**
 * 试用期工资合规校验
 * 劳动合同法第二十条：试用期工资不得低于本单位相同岗位最低档工资或劳动合同约定工资的 80%
 */
const probationWarnings = computed<string[]>(() => {
  const probation = stagePlans.value.find((plan) => plan.type === 'probation')
  const regular = stagePlans.value.find((plan) => plan.type === 'regular')
  if (!probation || !regular) return []
  if (probation.monthsText === '未配置区间' || regular.monthsText === '未配置区间') return []
  if (probation.monthlyTotal <= 0 || regular.monthlyTotal <= 0) return []

  const ratio = round2(dec(probation.monthlyTotal).div(regular.monthlyTotal))
  if (ratio >= 0.8) return []
  return [
    `试用期月应发 ¥${formatMoney(probation.monthlyTotal)} 仅为转正后 ¥${formatMoney(regular.monthlyTotal)} 的 ${(ratio * 100).toFixed(0)}%，低于法定 80% 下限`,
  ]
})

/** 该阶段停缴险种的可读描述，为空表示全部缴纳 */
function skipTextOf(stage: StageRange): string {
  if (stage.skipInsurance) return '五险一金（全部不缴）'
  const types = stage.skipInsuranceTypes ?? []
  if (types.length === 0) return ''
  return types.map((type) => INSURANCE_LABELS[type]).join('、')
}

function onTypeChange(stage: StageRange, type: StageType) {
  store.updateStage(stage.id, {
    type,
    // 实习期默认不缴社保，切换到其它阶段时恢复缴纳，减少手动操作
    skipInsurance: type === 'intern' ? stage.skipInsurance : false,
  })
}
</script>

<template>
  <section class="stage-editor">
    <header class="stage-editor__tip">
      先划分阶段区间，再在下方按阶段填写该阶段实际发放的工资与福利
    </header>

    <ul class="stage-list">
      <li
        v-for="stage in store.stages"
        :key="stage.id"
        class="stage-item"
        :class="{ 'stage-item--error': hasError(stage.id) }"
      >
        <div class="stage-item__head">
          <el-select
            :model-value="stage.type"
            size="small"
            class="stage-item__type"
            @update:model-value="(value: StageType) => onTypeChange(stage, value)"
          >
            <el-option
              v-for="option in STAGE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <span class="stage-item__hint">{{ STAGE_HINTS[stage.type] }}</span>
          <el-button
            :icon="Delete"
            size="small"
            text
            type="danger"
            @click="store.removeStage(stage.id)"
          />
        </div>

        <div class="stage-item__body">
          <el-select
            :model-value="stage.fromMonth"
            size="small"
            class="stage-item__month"
            @update:model-value="(value: number) => store.updateStage(stage.id, { fromMonth: value })"
          >
            <el-option
              v-for="option in MONTH_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <span class="stage-item__sep">至</span>
          <el-select
            :model-value="stage.toMonth"
            size="small"
            class="stage-item__month"
            @update:model-value="(value: number) => store.updateStage(stage.id, { toMonth: value })"
          >
            <el-option
              v-for="option in MONTH_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-select
            :model-value="stage.skipInsuranceTypes ?? []"
            multiple
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            :disabled="stage.skipInsurance"
            size="small"
            class="stage-item__skip"
            placeholder="该阶段单独停缴的险种"
            @update:model-value="
              (value: InsuranceType[]) => store.updateStage(stage.id, { skipInsuranceTypes: value })
            "
          >
            <el-option
              v-for="option in INSURANCE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-checkbox
            :model-value="stage.skipInsurance"
            size="small"
            @update:model-value="
              (value: boolean) => store.updateStage(stage.id, { skipInsurance: value })
            "
          >
            不缴五险一金
          </el-checkbox>
        </div>

        <div class="stage-item__foot">
          阶段月应发 ¥{{ formatMoney(grossOfStage(stage)) }}
          <span v-if="skipTextOf(stage)" class="stage-item__skip-text">
            不缴：{{ skipTextOf(stage) }}
          </span>
        </div>
      </li>
    </ul>

    <footer class="stage-editor__actions">
      <el-button
        v-for="option in STAGE_OPTIONS"
        :key="option.value"
        :icon="Plus"
        size="small"
        plain
        @click="store.addStage(option.value)"
      >
        添加{{ option.label }}
      </el-button>
    </footer>

    <el-alert
      v-for="issue in errorIssues"
      :key="`error-${issue.message}`"
      :closable="false"
      type="error"
      class="stage-editor__issue"
      :title="issue.message"
    />
    <el-alert
      v-for="issue in warningIssues"
      :key="`warn-${issue.message}`"
      :closable="false"
      type="warning"
      class="stage-editor__issue"
      :title="issue.message"
    />
    <el-alert
      v-for="message in probationWarnings"
      :key="message"
      :closable="false"
      type="warning"
      class="stage-editor__issue"
      :title="message"
    />

    <div class="stage-plan">
      <div class="stage-plan__title">各阶段工资福利</div>
      <el-collapse>
        <el-collapse-item v-for="plan in stagePlans" :key="plan.type" :name="plan.type">
          <template #title>
            <span class="plan-title">
              <strong>{{ STAGE_LABELS[plan.type] }}</strong>
              <span class="plan-title__months">{{ plan.monthsText }}</span>
              <span class="plan-title__total">月应发 ¥{{ formatMoney(plan.monthlyTotal) }}</span>
            </span>
          </template>

          <ul class="plan-list">
            <li v-for="row in plan.rows" :key="row.item.id" class="plan-row">
              <el-switch
                :model-value="row.enabled"
                size="small"
                @update:model-value="
                  (value: boolean) => store.toggleStageEnabled(row.item.id, plan.type, value)
                "
              />
              <span class="plan-row__name" :class="{ 'plan-row__name--off': !row.enabled }">
                {{ row.item.name }}
                <em v-if="row.item.cycle === 'once'">（{{ row.item.month }} 月一次性）</em>
              </span>
              <MoneyInput
                v-if="row.enabled && !row.variable"
                :model-value="row.amount"
                size="small"
                class="plan-row__amount"
                @update:model-value="
                  (value: number) => store.updateStageAmount(row.item.id, plan.type, value)
                "
              />
              <span v-else-if="!row.enabled" class="plan-row__off">该阶段不发放</span>
              <span v-else class="plan-row__off">逐月浮动，均值 ¥{{ formatMoney(row.amount) }}</span>
            </li>
          </ul>
        </el-collapse-item>
      </el-collapse>
    </div>
  </section>
</template>

<style scoped>
.stage-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stage-editor__tip {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stage-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.stage-item--error {
  border-color: var(--el-color-danger);
}

.stage-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-item__type {
  width: 96px;
}

.stage-item__hint {
  flex: 1;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.stage-item__body {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stage-item__month {
  width: 86px;
}

.stage-item__sep {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stage-item__skip {
  width: 220px;
}

.stage-item__foot {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.stage-item__skip-text {
  color: var(--el-color-warning);
}

.stage-editor__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stage-editor__issue {
  padding: 6px 8px;
}

.stage-plan {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stage-plan__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.plan-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.plan-title__months {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.plan-title__total {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-color-primary);
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plan-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plan-row__name {
  flex: 1;
  font-size: 13px;
}

.plan-row__name em {
  font-style: normal;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.plan-row__name--off {
  color: var(--el-text-color-placeholder);
  text-decoration: line-through;
}

.plan-row__amount {
  width: 140px;
}

.plan-row__off {
  width: 140px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
