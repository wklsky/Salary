/**
 * @Author: wj
 * @FilePath: src/types/salary.ts
 * @Description: 计算内核入参与出参的顶层类型定义
 */
import type { DeductionStateMap } from './deduction'
import type { IncomeItem } from './income'
import type { InsuranceConfig, InsuranceType } from './insurance'
import type { StageRange } from './stage'
import type { AnnualSummary, InsuranceMonthDetail, MonthlyResult } from './tax'

/**
 * 年终奖计税方式：
 * - separate 全年一次性奖金单独计税
 * - merged 并入当年综合所得
 * - auto 两种口径都算，取税负更低者
 */
export type BonusMode = 'separate' | 'merged' | 'auto'

/** 纳税人身份：居民个人按年累计预扣，非居民个人按月单独计税 */
export type TaxpayerType = 'resident' | 'nonResident'

/**
 * 单月数据覆盖
 * 用于「某月实际发放与规则不同」的场景，如 3 月多了一笔补贴、某月社保基数被单独核定
 * 覆盖值优先级高于收入项自身的阶段/逐月口径
 */
export interface MonthOverride {
  /** 各数据项在该月的金额，key 为 IncomeItem.id 或自定义列 key */
  amounts?: Record<string, number>
  /** 该月社保缴费基数单独核定值 */
  insuranceBase?: number
  /** 该月备注 */
  note?: string
}

/**
 * 用户自定义的表格列（金额型）
 * 与收入项的区别：不带阶段、税率类别等复杂配置，仅表达「表格里要多一列并参与计算」
 */
export interface CustomColumnItem {
  key: string
  label: string
  /** 逐月数值，长度 12，下标 0-11 对应 1-12 月 */
  values: number[]
  /** 是否计入应发；关闭时该列仅作展示，不影响工资计算 */
  intoGross: boolean
  /** 计入应发时是否并入综合所得计税 */
  taxable: boolean
  /** 计入应发时是否计入社保缴费基数 */
  intoBase: boolean
}

export interface SalaryInput {
  /** 计算年度 */
  year: number
  /** 当年入职月份，取值 1-12；影响累计减除费用的月份数 */
  startMonth: number
  /** 当年离职月份，取值 1-12；离职后不再产生收入与社保缴纳 */
  endMonth: number
  incomes: IncomeItem[]
  insurance: InsuranceConfig
  deductions: DeductionStateMap
  bonusMode: BonusMode
  /** 当年雇佣阶段划分，决定各月工资发放口径与是否缴纳社保 */
  stages: StageRange[]
  /** 居民个人走累计预扣，非居民个人按月单独计税且不享受专项附加扣除 */
  taxpayerType: TaxpayerType
  /** 每月减免税额（元），如残疾、孤老、烈属等减征政策 */
  taxReductionMonthly: number
  /** 单月数据覆盖，key 为月份 1-12；缺省月份按收入项自身口径计算 */
  monthOverrides?: Record<number, MonthOverride>
  /** 用户自定义表格列，会转换为虚拟收入项参与计算 */
  customColumns?: CustomColumnItem[]
}

/** 年终奖两种口径的税负对比 */
export interface BonusComparison {
  /** 单独计税时的全年个税总额 */
  separateTax: number
  /** 并入综合所得时的全年个税总额 */
  mergedTax: number
  /** 单独计税额 */
  bonusTax: number
  /** 更优口径；split 表示部分单独计税更省税 */
  better: 'separate' | 'merged' | 'split'
  /** 两种口径的税额差 */
  diff: number
  /** 最优方案下建议单独计税的金额，仅 better 为 split 时有值 */
  splitAmount?: number
  /** 最优方案下的全年个税总额，仅 better 为 split 时有值 */
  splitTax?: number
  /** 奖金是否落在「多发反而少拿」的无效区间 */
  invalidRange?: { from: number; to: number }
}

/** 险种年度合计，用于占比分析 */
export interface InsuranceAnnualItem {
  type: InsuranceType
  personal: number
  company: number
}

export interface SalaryResult {
  monthly: MonthlyResult[]
  insuranceMonthly: InsuranceMonthDetail[]
  insuranceAnnual: InsuranceAnnualItem[]
  annual: AnnualSummary
  /** 存在 bonus 类型收入时输出税负对比 */
  bonusComparison?: BonusComparison
  /** 当前实际采用的计税方式；split 表示部分奖金单独计税、其余并入综合所得 */
  appliedBonusMode: Exclude<BonusMode, 'auto'> | 'split'
}
