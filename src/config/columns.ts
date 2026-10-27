/**
 * @Author: wj
 * @FilePath: src/config/columns.ts
 * @Description: 月度明细表的静态列注册表，列配置抽屉的数据来源
 */
import type { ColumnSchema, InsuranceType } from '@/types'
import { INSURANCE_TYPES } from '@/types'

export const INSURANCE_LABELS: Record<InsuranceType, string> = {
  pension: '养老保险',
  medical: '医疗保险',
  unemployment: '失业保险',
  injury: '工伤保险',
  maternity: '生育保险',
  housingFund: '住房公积金',
}

export const COLUMN_GROUP_LABELS: Record<ColumnSchema['group'], string> = {
  basic: '基础',
  income: '收入项',
  insurance: '五险一金',
  deduction: '扣除项',
  tax: '个税',
  result: '到手结果',
}

/** 保险列（个人缴纳）的 key 前缀，与收入项动态列区分 */
export const INSURANCE_COLUMN_PREFIX = 'ins_'

/** 保险列（单位缴纳）的 key 前缀 */
export const INSURANCE_COMPANY_COLUMN_PREFIX = 'inscomp_'

export function insuranceColumnKey(type: InsuranceType): string {
  return `${INSURANCE_COLUMN_PREFIX}${type}`
}

export function insuranceCompanyColumnKey(type: InsuranceType): string {
  return `${INSURANCE_COMPANY_COLUMN_PREFIX}${type}`
}

/**
 * 静态列定义：order 为默认排序，visible 为默认是否展示
 * 动态收入列由 useTableSchema 依据 IncomeItem 实时生成
 */
export function createStaticColumns(): ColumnSchema[] {
  // 各险种分别提供个人与单位两列，便于核对双方实际负担
  const insuranceColumns: ColumnSchema[] = INSURANCE_TYPES.map((type, index) => ({
    key: insuranceColumnKey(type),
    label: `${INSURANCE_LABELS[type]}(个人)`,
    group: 'insurance',
    visible: false,
    order: 220 + index * 2,
    width: 120,
    formatter: 'money',
    dynamic: false,
  }))

  const insuranceCompanyColumns: ColumnSchema[] = INSURANCE_TYPES.map((type, index) => ({
    key: insuranceCompanyColumnKey(type),
    label: `${INSURANCE_LABELS[type]}(单位)`,
    group: 'insurance',
    visible: false,
    order: 221 + index * 2,
    width: 120,
    formatter: 'money',
    dynamic: false,
  }))

  const fixed: ColumnSchema[] = [
    {
      key: 'month',
      label: '月份',
      group: 'basic',
      visible: true,
      order: 0,
      width: 72,
      formatter: 'month',
      dynamic: false,
      pinned: true,
    },
    {
      key: 'stage',
      label: '阶段',
      group: 'basic',
      visible: true,
      order: 8,
      width: 80,
      formatter: 'text',
      dynamic: false,
    },
    {
      key: 'gross',
      label: '应发合计',
      group: 'income',
      visible: true,
      order: 100,
      width: 120,
      formatter: 'money',
      dynamic: false,
      pinned: true,
    },
    {
      key: 'comprehensiveIncome',
      label: '计入综合所得',
      group: 'income',
      visible: false,
      order: 101,
      width: 130,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'taxFreeIncome',
      label: '免税收入',
      group: 'income',
      visible: false,
      order: 102,
      width: 110,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'insuranceBase',
      label: '缴费基数',
      group: 'insurance',
      visible: true,
      order: 199,
      width: 110,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'insurancePersonal',
      label: '五险一金(个人)',
      group: 'insurance',
      visible: true,
      order: 210,
      width: 140,
      formatter: 'money',
      dynamic: false,
      pinned: true,
    },
    {
      key: 'insuranceCompany',
      label: '五险一金(单位)',
      group: 'insurance',
      visible: false,
      order: 211,
      width: 140,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'basicDeduction',
      label: '基本减除费用',
      group: 'deduction',
      visible: false,
      order: 300,
      width: 120,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'deductionTotal',
      label: '专项附加扣除',
      group: 'deduction',
      visible: true,
      order: 301,
      width: 130,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'cumulativeTaxable',
      label: '累计应纳税所得额',
      group: 'tax',
      visible: false,
      order: 400,
      width: 150,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'cumulativeTaxPaid',
      label: '累计已预扣税额',
      group: 'tax',
      visible: false,
      order: 401,
      width: 140,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'tax',
      label: '工资薪金个税',
      group: 'tax',
      visible: false,
      order: 402,
      width: 130,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'bonusTax',
      label: '年终奖个税',
      group: 'tax',
      visible: false,
      order: 403,
      width: 120,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'taxTotal',
      label: '当月个税',
      group: 'tax',
      visible: true,
      order: 404,
      width: 120,
      formatter: 'money',
      dynamic: false,
      pinned: true,
    },
    {
      key: 'companyCost',
      label: '单位用工成本',
      group: 'result',
      visible: false,
      order: 500,
      width: 130,
      formatter: 'money',
      dynamic: false,
    },
    {
      key: 'net',
      label: '到手工资',
      group: 'result',
      visible: true,
      order: 501,
      width: 130,
      formatter: 'money',
      dynamic: false,
      pinned: true,
    },
    {
      key: 'netRate',
      label: '到手占比',
      group: 'result',
      visible: true,
      order: 502,
      width: 100,
      formatter: 'percent',
      dynamic: false,
    },
  ]

  return [...fixed, ...insuranceColumns, ...insuranceCompanyColumns].sort(
    (a, b) => a.order - b.order,
  )
}
