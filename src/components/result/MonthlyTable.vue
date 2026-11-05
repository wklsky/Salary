<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/MonthlyTable.vue
 * @Description: 月度明细表，列组成项由用户自定义，末行输出年度合计
 */
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useWindowSize } from '@vueuse/core'
import { editableKindOf, itemIdOf, useTableEditing } from '@/composables/useTableEditing'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import { formatColumnValue, resolveColumnValue } from '@/utils/columnValue'
import { formatMoney } from '@/utils/format'
import type { ColumnSchema, InsuranceMonthDetail, MonthlyResult } from '@/types'
import type { EditableKind } from '@/composables/useTableEditing'

/** 合计行使用哨兵月份，渲染时替换为「合计」文本 */
const TOTAL_MONTH_FLAG = 13

type Row = MonthlyResult & { isTotal?: boolean }

const { result } = useSalaryCalculator()
const schemaStore = useTableSchemaStore()
const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()
const { applyCellValue, findAdjustIncome } = useTableEditing()
const { height: windowHeight } = useWindowSize()

/** 默认只展示计算区间内的月份，避免 1-7 月全 0 的行占满表格 */
const showAllMonths = ref(false)

/** 反推调整项，展示在工具栏便于用户知道反推会改哪一项 */
const adjustIncomeName = computed(() => findAdjustIncome()?.name ?? '未配置')

/** 表格高度随视口伸缩，短屏时缩小、长屏时最多 640px */
const tableMaxHeight = computed(() => Math.max(300, Math.min(640, windowHeight.value - 520)))

function fixedOf(column: ColumnSchema): 'left' | 'right' | undefined {
  if (column.key === 'month') return 'left'
  if (column.key === 'net') return 'right'
  return undefined
}

/** 该月是否存在单月调整，用于在月份列加标记 */
function hasAdjustment(month: number): boolean {
  const override = salaryStore.monthOverrides[month]
  if (!override) return false
  return (
    Object.keys(override.amounts ?? {}).length > 0 ||
    typeof override.insuranceBase === 'number' ||
    typeof override.housingFundBase === 'number' ||
    Boolean(override.note)
  )
}

/**
 * 对外事件
 * @event row-click 点击数据行，回传该月月度结果
 */
const emit = defineEmits<{
  'row-click': [row: MonthlyResult]
  'config-columns': []
}>()

const stripe = ref(true)

const columns = computed<ColumnSchema[]>(() => schemaStore.visibleColumns)

const rows = computed<Row[]>(() => {
  const annual = result.value.annual
  const total: Row = {
    month: TOTAL_MONTH_FLAG,
    // 合计行不归属任何阶段，渲染时会替换为占位符
    stage: 'regular',
    gross: annual.gross,
    comprehensiveIncome: annual.comprehensiveIncome,
    taxFreeIncome: annual.taxFreeIncome,
    nonCashIncome: annual.nonCashIncome,
    otherIncome: annual.otherIncome,
    otherTax: annual.otherTax,
    insuranceBase: 0,
    insurancePersonal: annual.insurancePersonal,
    insuranceCompany: annual.insuranceCompany,
    basicDeduction: 0,
    deductionTotal: 0,
    incomeBreakdown: {},
    incomeScores: {},
    customValues: {},
    cumulativeTaxable: annual.taxableIncome,
    cumulativeTaxPaid: annual.tax,
    tax: annual.tax,
    bonusTax: 0,
    taxTotal: annual.tax,
    postTaxDeduction: annual.postTaxDeduction,
    postTaxDeductionBreakdown: {},
    totalDeduction: annual.totalDeduction,
    note: '',
    net: annual.net,
    isTotal: true,
  }
  const monthly = showAllMonths.value
    ? result.value.monthly
    : result.value.monthly.filter(
        (item) =>
          item.month >= settingsStore.startMonth && item.month <= settingsStore.endMonth,
      )
  return [...monthly, total]
})

/** 当前实际展示的月份数，用于工具栏说明 */
const visibleMonthCount = computed(() => rows.value.length - 1)

function insuranceOf(month: number): InsuranceMonthDetail | undefined {
  return result.value.insuranceMonthly.find((item) => item.month === month)
}

/** 累计类指标在合计行没有汇总意义，统一展示为占位符 */
const TOTAL_PLACEHOLDER_KEYS = new Set([
  'stage',
  'note',
  'insuranceBase',
  'basicDeduction',
  'cumulativeTaxable',
  'cumulativeTaxPaid',
])

function cellText(row: Row, column: ColumnSchema): string {
  if (!row.isTotal) {
    const text = formatColumnValue(column, row, insuranceOf(row.month))
    // 月份列带「·」表示该月存在单独调整，点击行可查看或还原
    if (column.key === 'month' && hasAdjustment(row.month)) return `${text} ·`
    return text
  }

  if (column.key === 'month') return '合计'
  if (column.key === 'netRate') return `${(result.value.annual.netRate * 100).toFixed(1)}%`
  if (column.key === 'companyCost') return formatMoney(result.value.annual.companyCost)
  if (column.key === 'postTaxDeduction') {
    return formatMoney(result.value.annual.postTaxDeduction)
  }
  if (column.key === 'totalDeduction') return formatMoney(result.value.annual.totalDeduction)
  if (TOTAL_PLACEHOLDER_KEYS.has(column.key)) return '—'

  // 其余列对 12 个月求和，动态收入列据此得到该收入项的年度合计
  const total = result.value.monthly.reduce((acc, month) => {
    const value = resolveColumnValue(column, month, insuranceOf(month.month))
    return acc + (typeof value === 'number' ? value : 0)
  }, 0)
  return total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function rowClassName({ row }: { row: Row }): string {
  return row.isTotal ? 'total-row' : 'data-row'
}

function onRowClick(row: Row) {
  if (row.isTotal) return
  emit('row-click', row)
}

/** 当前列的编辑类型；动态收入列由列定义本身标识 */
function kindOf(column: ColumnSchema): EditableKind | null {
  if (column.dynamic) return 'income'
  return editableKindOf(column.key)
}

function isEditableColumn(column: ColumnSchema): boolean {
  return kindOf(column) !== null
}

/** 反推列用主题色提示：输入任一值即可联动其他关联金额 */
function isReverseColumn(column: ColumnSchema): boolean {
  const kind = kindOf(column)
  return (
    kind === 'gross' ||
    kind === 'cashGross' ||
    kind === 'net' ||
    kind === 'tax' ||
    kind === 'insuranceTotal' ||
    kind === 'insuranceType'
  )
}

function numericValueOf(row: MonthlyResult, column: ColumnSchema): number {
  const kind = kindOf(column)
  switch (kind) {
    case 'income':
      return row.incomeBreakdown[column.key] ?? 0
    case 'score':
      return row.incomeScores?.[itemIdOf(column.key, kind)] ?? 0
    case 'postTax':
      return row.postTaxDeductionBreakdown?.[itemIdOf(column.key, kind)] ?? 0
    case 'gross':
      return row.gross
    case 'cashGross':
      return (row.gross ?? 0) - (row.nonCashIncome ?? 0)
    case 'net':
      return row.net
    case 'tax':
      return row.taxTotal
    case 'insuranceBase':
      return row.insuranceBase
    case 'insuranceTotal':
      return row.insurancePersonal
    case 'insuranceType': {
      const type = itemIdOf(column.key, kind)
      return insuranceOf(row.month)?.personal[type as keyof InsuranceMonthDetail['personal']] ?? 0
    }
    default:
      return 0
  }
}

function trimNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '0'
}

/** 输入框展示值：金额保留到分，分数去掉多余小数 */
function inputText(month: number, column: ColumnSchema): string {
  const row = result.value.monthly.find((item) => item.month === month)
  if (!row) return ''
  const kind = kindOf(column)
  if (kind === 'note') return row.note ?? ''
  const value = numericValueOf(row, column)
  return column.formatter === 'number' ? trimNumber(value) : value.toFixed(2)
}

function cellTitle(column: ColumnSchema): string {
  switch (kindOf(column)) {
    case 'income': {
      const item = salaryStore.incomes.find((entry) => entry.id === column.key)
      return item?.scoreBased
        ? '可编辑金额，系统按每分金额自动反算绩效分数'
        : '可直接编辑该收入项本月金额'
    }
    case 'score':
      return '可编辑分数，绩效金额按每分金额自动联动'
    case 'postTax':
      return '可直接编辑本月税后扣款金额'
    case 'note':
      return '可直接编辑本月备注'
    case 'gross':
      return '可编辑应发合计（含餐补等非现金收入），系统自动反推调整项'
    case 'cashGross':
      return '可编辑实际应发工资（不含非现金收入），系统自动反推调整项'
    case 'net':
      return '可编辑实发工资，系统自动反推应发工资'
    case 'tax':
      return '可编辑个税，系统自动反推应发工资'
    case 'insuranceBase':
      return '可编辑缴费基数，五险一金自动联动'
    case 'insuranceTotal':
    case 'insuranceType':
      return '可编辑缴纳额，系统自动反推缴费基数'
    default:
      return ''
  }
}

/** Esc 取消时跳过 blur 触发的 change，避免把取消前的值写入 */
const skipNextChange = new WeakSet<HTMLInputElement>()

function onInputFocus(event: Event) {
  ;(event.target as HTMLInputElement).select()
}

function onInputKeydown(event: KeyboardEvent, row: Row, column: ColumnSchema) {
  const input = event.target as HTMLInputElement
  if (event.key === 'Enter') {
    input.blur()
    return
  }
  if (event.key === 'Escape') {
    skipNextChange.add(input)
    // 直接回写当前计算结果，避免依赖焦点时缓存的旧值
    input.value = inputText(row.month, column)
    input.blur()
  }
}

async function onCellEdit(row: Row, column: ColumnSchema, event: Event) {
  const input = event.target as HTMLInputElement
  if (skipNextChange.has(input)) {
    skipNextChange.delete(input)
    return
  }
  const kind = kindOf(column)
  if (!kind) return

  if (kind === 'note') {
    applyCellValue(row.month, column.key, 'note', input.value)
  } else {
    const value = Number(input.value)
    if (!Number.isFinite(value) || value < 0) {
      ElMessage.warning('请输入不小于 0 的有效数值')
    } else {
      applyCellValue(row.month, column.key, kind, value)
    }
  }

  // 反推/取整后实际值可能与输入不同，失焦后回写为计算结果
  await nextTick()
  input.value = inputText(row.month, column)
}
</script>

<template>
  <div class="monthly-table">
    <div class="monthly-table__toolbar">
      <div class="monthly-table__meta">
        <span class="monthly-table__count">
          已展示 {{ columns.length }} 列 / {{ visibleMonthCount }} 个月；金额、分数、备注可直接编辑，带 ⇄ 的列会自动反推
        </span>
        <span class="monthly-table__reverse">
          反推调整项：<b>{{ adjustIncomeName }}</b>
          <el-button size="small" text type="primary" @click="emit('config-columns')">
            配置
          </el-button>
        </span>
      </div>
      <div class="monthly-table__ops">
        <el-checkbox v-model="showAllMonths" size="small">显示全部 12 个月</el-checkbox>
        <el-checkbox v-model="stripe" size="small">斑马纹</el-checkbox>
      </div>
    </div>

    <el-table
      :data="rows"
      :border="true"
      :stripe="stripe"
      size="small"
      :max-height="tableMaxHeight"
      :row-class-name="rowClassName"
      show-overflow-tooltip
      @row-click="onRowClick"
    >
      <el-table-column
        v-for="column in columns"
        :key="column.key"
        :label="
          isReverseColumn(column)
            ? `${column.customLabel || column.label} ⇄`
            : column.customLabel || column.label
        "
        :width="column.width"
        :fixed="fixedOf(column)"
        :align="column.formatter === 'text' || column.formatter === 'month' ? 'center' : 'right'"
      >
        <template #default="{ row }">
          <input
            v-if="!row.isTotal && isEditableColumn(column)"
            class="cell-input"
            :class="{
              'cell-input--reverse': isReverseColumn(column),
              'cell-input--text': kindOf(column) === 'note',
            }"
            :value="inputText(row.month, column)"
            :title="cellTitle(column)"
            :inputmode="kindOf(column) === 'note' ? undefined : 'decimal'"
            autocomplete="off"
            @click.stop
            @dblclick.stop
            @mousedown.stop
            @focus="onInputFocus"
            @keydown="(event) => onInputKeydown(event, row as Row, column)"
            @change="(event) => onCellEdit(row as Row, column, event)"
          />
          <span v-else>{{ cellText(row as Row, column) }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.monthly-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
  margin-bottom: 8px;
}

.monthly-table__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  min-width: 0;
}

.monthly-table__reverse {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.monthly-table__reverse b {
  color: var(--app-jade-700);
  font-weight: 600;
}

.monthly-table__ops {
  display: flex;
  align-items: center;
  gap: 4px 10px;
}

.monthly-table__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.monthly-table :deep(.total-row) {
  font-weight: 600;
  background: var(--el-color-primary-light-9);
}

.monthly-table :deep(.total-row td) {
  background: var(--el-color-primary-light-9) !important;
}

.monthly-table :deep(.data-row) {
  cursor: pointer;
}

/* 单元格内编辑：平时透明，悬停/聚焦时显示输入框边界 */
.cell-input {
  width: 100%;
  height: 24px;
  padding: 0 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
  outline: none;
  cursor: text;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.cell-input:hover {
  border-color: var(--el-border-color);
  background: var(--el-bg-color);
}

.cell-input:focus {
  border-color: var(--el-color-primary);
  background: var(--el-bg-color);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-8);
}

.cell-input--reverse {
  color: var(--app-jade-700);
  font-weight: 600;
}

.cell-input--text {
  text-align: left;
}
</style>
