/**
 * @Author: wj
 * @FilePath: src/utils/columnValue.ts
 * @Description: 表格列取值解析：把列 key 映射到月度明细行的数据
 */
import { INSURANCE_COLUMN_PREFIX, INSURANCE_COMPANY_COLUMN_PREFIX } from '@/config/columns'
import { STAGE_LABELS } from '@/config/stages'
import type { ColumnSchema, InsuranceMonthDetail, InsuranceType, MonthlyResult } from '@/types'
import { safeDivide } from '@/core'

/** 险种列区分个人与单位口径，分别对应 ins_ 与 inscomp_ 两套 key */
export function resolveColumnValue(
  column: ColumnSchema,
  row: MonthlyResult,
  insurance?: InsuranceMonthDetail,
): number | string {
  const { key } = column

  if (key === 'month') return row.month
  if (key === 'stage') return STAGE_LABELS[row.stage] ?? ''

  // 动态收入列直接取该收入项当月发放额
  if (column.dynamic) return row.incomeBreakdown[key] ?? 0

  // 单位缴纳列：前缀更长，需先于个人列判断，避免被 ins_ 前缀误匹配
  if (key.startsWith(INSURANCE_COMPANY_COLUMN_PREFIX)) {
    const type = key.slice(INSURANCE_COMPANY_COLUMN_PREFIX.length) as InsuranceType
    return insurance?.company[type] ?? 0
  }

  if (key.startsWith(INSURANCE_COLUMN_PREFIX)) {
    const type = key.slice(INSURANCE_COLUMN_PREFIX.length) as InsuranceType
    return insurance?.personal[type] ?? 0
  }

  switch (key) {
    case 'gross':
      return row.gross
    case 'comprehensiveIncome':
      return row.comprehensiveIncome
    case 'taxFreeIncome':
      return row.taxFreeIncome
    case 'insuranceBase':
      return row.insuranceBase
    case 'insurancePersonal':
      return row.insurancePersonal
    case 'insuranceCompany':
      return row.insuranceCompany
    case 'basicDeduction':
      return row.basicDeduction
    case 'deductionTotal':
      return row.deductionTotal
    case 'cumulativeTaxable':
      return row.cumulativeTaxable
    case 'cumulativeTaxPaid':
      return row.cumulativeTaxPaid
    case 'tax':
      return row.tax
    case 'bonusTax':
      return row.bonusTax
    case 'taxTotal':
      return row.taxTotal
    case 'companyCost':
      return row.gross + row.insuranceCompany
    case 'net':
      return row.net
    case 'netRate':
      return safeDivide(row.net, row.gross)
    default:
      return 0
  }
}

/** 按列的格式化类型输出展示文本 */
export function formatColumnValue(
  column: ColumnSchema,
  row: MonthlyResult,
  insurance?: InsuranceMonthDetail,
): string {
  const value = resolveColumnValue(column, row, insurance)
  if (typeof value === 'string') return value

  switch (column.formatter) {
    case 'month':
      return `${value} 月`
    case 'percent':
      return `${(value * 100).toFixed(1)}%`
    case 'money':
      return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    default:
      return String(value)
  }
}
