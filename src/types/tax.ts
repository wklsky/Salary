/**
 * @Author: wj
 * @FilePath: src/types/tax.ts
 * @Description: 税率表与逐月/年度计算结果的类型定义
 */
import type { InsuranceType } from './insurance'
import type { StageType } from './stage'

/** 综合所得税率级距 */
export interface TaxBracket {
  level: number
  /** 该级下限（不含） */
  lower: number
  /** 该级上限（含），Infinity 表示最高级 */
  upper: number
  /** 税率，0-1 */
  rate: number
  /** 速算扣除数 */
  quickDeduction: number
}

/** 单个险种的月度缴纳明细 */
export type InsuranceAmountMap = Record<InsuranceType, number>

export interface InsuranceMonthDetail {
  month: number
  /** 当月实际缴费基数 */
  base: number
  /** 公积金基数，与社保基数可能不同 */
  housingFundBase: number
  personal: InsuranceAmountMap
  company: InsuranceAmountMap
  personalTotal: number
  companyTotal: number
}

export interface MonthlyResult {
  month: number
  /** 当月所处雇佣阶段，实习期/试用期工资与社保口径可能不同 */
  stage: StageType
  /** 当月应发合计（含年终奖） */
  gross: number
  /** 计入综合所得的收入 */
  comprehensiveIncome: number
  /** 免税收入（不并入综合所得） */
  taxFreeIncome: number
  /** 当月缴费基数 */
  insuranceBase: number
  insurancePersonal: number
  insuranceCompany: number
  /** 当月新增基本减除费用（5000 元/月） */
  basicDeduction: number
  /** 当月专项附加扣除与其他扣除合计 */
  deductionTotal: number
  /** 当月各收入项金额，key 为 IncomeItem.id，用于动态列渲染 */
  incomeBreakdown: Record<string, number>
  /** 累计应纳税所得额 */
  cumulativeTaxable: number
  /** 累计已预扣税额 */
  cumulativeTaxPaid: number
  /** 当月工资薪金预扣税额 */
  tax: number
  /** 当月年终奖单独计税额 */
  bonusTax: number
  /** 当月个税合计 */
  taxTotal: number
  /** 当月到手 */
  net: number
}

export interface AnnualSummary {
  gross: number
  comprehensiveIncome: number
  taxFreeIncome: number
  insurancePersonal: number
  insuranceCompany: number
  /** 单位用工总成本 = 应发 + 单位缴纳五险一金 */
  companyCost: number
  /** 全年应纳税所得额（预扣口径） */
  taxableIncome: number
  tax: number
  net: number
  /** 到手 / 应发 */
  netRate: number
  /** 个税 / 应发 */
  taxRate: number
  /** 仅能在年度汇算时扣除的金额（不参与月度预扣） */
  settlementOnlyDeduction: number
  /** 汇算口径下的全年应纳税额 */
  settlementTax: number
  /** 正数表示应补税，负数表示应退税 */
  settlementDiff: number
  /** 汇算口径下实际可扣除的公益捐赠额（受应纳税所得额比例限额约束） */
  donationApplied: number
}
