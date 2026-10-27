<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/MonthlyTable.vue
 * @Description: 月度明细表，列组成项由用户自定义，末行输出年度合计
 */
import { computed, ref } from 'vue'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import { formatColumnValue, resolveColumnValue } from '@/utils/columnValue'
import { formatMoney } from '@/utils/format'
import type { ColumnSchema, InsuranceMonthDetail, MonthlyResult } from '@/types'

/** 合计行使用哨兵月份，渲染时替换为「合计」文本 */
const TOTAL_MONTH_FLAG = 13

type Row = MonthlyResult & { isTotal?: boolean }

const { result } = useSalaryCalculator()
const schemaStore = useTableSchemaStore()

/**
 * 对外事件
 * @event row-click 点击数据行，回传该月月度结果
 */
const emit = defineEmits<{
  'row-click': [row: MonthlyResult]
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
    customValues: {},
    cumulativeTaxable: annual.taxableIncome,
    cumulativeTaxPaid: annual.tax,
    tax: annual.tax,
    bonusTax: 0,
    taxTotal: annual.tax,
    net: annual.net,
    isTotal: true,
  }
  return [...result.value.monthly, total]
})

function insuranceOf(month: number): InsuranceMonthDetail | undefined {
  return result.value.insuranceMonthly.find((item) => item.month === month)
}

/** 累计类指标在合计行没有汇总意义，统一展示为占位符 */
const TOTAL_PLACEHOLDER_KEYS = new Set([
  'stage',
  'insuranceBase',
  'basicDeduction',
  'cumulativeTaxable',
  'cumulativeTaxPaid',
])

function cellText(row: Row, column: ColumnSchema): string {
  if (!row.isTotal) {
    return formatColumnValue(column, row, insuranceOf(row.month))
  }

  if (column.key === 'month') return '合计'
  if (column.key === 'netRate') return `${(result.value.annual.netRate * 100).toFixed(1)}%`
  if (column.key === 'companyCost') return formatMoney(result.value.annual.companyCost)
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
</script>

<template>
  <div class="monthly-table">
    <div class="monthly-table__toolbar">
      <span class="monthly-table__count">
        已展示 {{ columns.length }} 列，点击任意月份可单独调整该月数据
      </span>
      <el-checkbox v-model="stripe" size="small">斑马纹</el-checkbox>
    </div>

    <el-table
      :data="rows"
      :border="true"
      :stripe="stripe"
      size="small"
      height="480"
      :row-class-name="rowClassName"
      show-overflow-tooltip
      @row-click="onRowClick"
    >
      <el-table-column
        v-for="column in columns"
        :key="column.key"
        :label="column.customLabel || column.label"
        :width="column.width"
        :align="column.formatter === 'text' || column.formatter === 'month' ? 'center' : 'right'"
      >
        <template #default="{ row }">
          {{ cellText(row as Row, column) }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.monthly-table__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
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
</style>
