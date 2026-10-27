/**
 * @Author: wj
 * @FilePath: src/config/presets.ts
 * @Description: 列展示预设与默认收入项模板
 */
import type { ColumnPreset, IncomeItem } from '@/types'

/** 内置列预设：面向不同使用角色给出开箱可用的列组合 */
export const COLUMN_PRESETS: ColumnPreset[] = [
  {
    id: 'minimal',
    name: '极简（只看结果）',
    builtin: true,
    visibleKeys: ['month', 'gross', 'insurancePersonal', 'taxTotal', 'net'],
    includeIncomeColumns: false,
  },
  {
    id: 'personal',
    name: '个人常用',
    builtin: true,
    visibleKeys: [
      'month',
      'stage',
      'gross',
      'insuranceBase',
      'insurancePersonal',
      'ins_housingFund',
      'deductionTotal',
      'taxTotal',
      'net',
      'netRate',
    ],
    includeIncomeColumns: true,
  },
  {
    id: 'finance',
    name: '财务口径（含单位成本）',
    builtin: true,
    visibleKeys: [
      'month',
      'gross',
      'insurancePersonal',
      'insuranceCompany',
      'companyCost',
      'taxTotal',
      'net',
    ],
    includeIncomeColumns: true,
  },
  {
    id: 'hr',
    name: 'HR 全量明细',
    builtin: true,
    visibleKeys: [
      'month',
      'stage',
      'gross',
      'comprehensiveIncome',
      'taxFreeIncome',
      'nonCashIncome',
      'otherIncome',
      'insuranceBase',
      'ins_pension',
      'ins_medical',
      'ins_unemployment',
      'ins_injury',
      'ins_maternity',
      'ins_housingFund',
      'inscomp_pension',
      'inscomp_medical',
      'inscomp_unemployment',
      'inscomp_injury',
      'inscomp_maternity',
      'inscomp_housingFund',
      'insurancePersonal',
      'insuranceCompany',
      'basicDeduction',
      'deductionTotal',
      'cumulativeTaxable',
      'cumulativeTaxPaid',
      'tax',
      'bonusTax',
      'otherTax',
      'taxTotal',
      'companyCost',
      'net',
      'netRate',
    ],
    includeIncomeColumns: true,
  },
]

export const DEFAULT_PRESET_ID = 'personal'

/** 默认收入项：覆盖最常见的薪酬结构，用户可自由增删 */
export function createDefaultIncomes(): IncomeItem[] {
  return [
    {
      id: 'base_salary',
      name: '基本工资',
      amount: 15000,
      cycle: 'monthly',
      month: 1,
      intoInsuranceBase: true,
      taxable: true,
      kind: 'salary',
      enabled: true,
      // 默认开启阶段差异，直观演示实习期/试用期工资低于转正后的场景
      staged: true,
      stageAmounts: { intern: 8000, probation: 12000, regular: 15000 },
      stageEnabled: { intern: true, probation: true, regular: true },
      nonCash: false,
      variableByMonth: false,
    },
    {
      id: 'performance',
      name: '绩效工资',
      amount: 3000,
      cycle: 'monthly',
      month: 1,
      intoInsuranceBase: true,
      taxable: true,
      kind: 'salary',
      enabled: true,
      // 绩效属激励性薪酬，默认仅转正后发放
      staged: true,
      stageAmounts: { intern: 3000, probation: 1500, regular: 3000 },
      stageEnabled: { intern: false, probation: false, regular: true },
      nonCash: false,
      variableByMonth: false,
    },
    {
      id: 'allowance',
      // 饭票只能在食堂消费：计入应发与应税，但员工拿不到现金，故不计入到手
      name: '餐补（饭票）',
      amount: 800,
      cycle: 'monthly',
      month: 1,
      intoInsuranceBase: false,
      taxable: true,
      kind: 'salary',
      enabled: true,
      nonCash: true,
      // 饭票按当月出勤/消费浮动，各月金额不同
      variableByMonth: true,
      monthlyAmounts: [680, 720, 760, 740, 800, 820, 780, 860, 740, 800, 760, 840],
      // 实习期通常不含福利补贴；阶段停发优先于逐月金额
      staged: true,
      stageAmounts: { intern: 800, probation: 400, regular: 800 },
      stageEnabled: { intern: false, probation: true, regular: true },
    },
    {
      id: 'year_end_bonus',
      name: '年终奖',
      amount: 30000,
      cycle: 'once',
      month: 1,
      intoInsuranceBase: false,
      taxable: true,
      kind: 'bonus',
      enabled: true,
      staged: false,
      stageAmounts: {},
      stageEnabled: {},
      nonCash: false,
      variableByMonth: false,
    },
  ]
}
