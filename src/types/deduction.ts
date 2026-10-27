/**
 * @Author: wj
 * @FilePath: src/types/deduction.ts
 * @Description: 专项附加扣除与其他扣除的类型定义
 */

export type DeductionKey =
  | 'infantCare'
  | 'childrenEducation'
  | 'continuingEducationDegree'
  | 'continuingEducationCert'
  | 'housingLoan'
  | 'housingRent'
  | 'elderlySupport'
  | 'seriousIllness'
  | 'personalPension'
  | 'commercialHealth'
  | 'donation'

export const DEDUCTION_KEYS: DeductionKey[] = [
  'infantCare',
  'childrenEducation',
  'continuingEducationDegree',
  'continuingEducationCert',
  'housingLoan',
  'housingRent',
  'elderlySupport',
  'seriousIllness',
  'personalPension',
  'commercialHealth',
  'donation',
]

/** 扣除项目录元数据，标准金额与限额全部可配置 */
export interface DeductionMeta {
  key: DeductionKey
  label: string
  /** period 为 monthly 时是月标准额，annual 时是年额度，单位元 */
  defaultAmount: number
  /** monthly 按月计入累计预扣；annual 在指定月份一次性计入 */
  period: 'monthly' | 'annual'
  /** 是否允许按分摊比例扣减（如非独生子女赡养老人、夫妻分摊子女教育） */
  splittable: boolean
  /** 年度扣除上限，用于超限提示，0 表示无限制 */
  limit: number
  /**
   * 分摊情形下的扣除上限（如赡养老人非独生子女每人不超过 1500）
   * 缺省时仍按 limit 限制
   */
  sharedLimit?: number
  /** 起扣线：仅超过该金额的部分可计入扣除，如大病医疗的 15000 元自付门槛 */
  threshold?: number
  /**
   * 按应纳税所得额比例计算的扣除上限，如公益捐赠 30%
   * 与 limit 同时存在时取两者中较小值
   */
  ratioLimit?: number
  /** 是否只能在年度汇算时扣除（如大病医疗不参与月度预扣） */
  settlementOnly: boolean
  /** 互斥组，同一组内只能启用一项 */
  exclusiveGroup?: string
  /** 规则说明，直接透出到 UI 提示 */
  hint: string
}

export interface DeductionState {
  enabled: boolean
  /** 申报金额（元），超过 limit 时给出提示但仍按用户输入计算 */
  amount: number
  /** 分摊比例 0-1，仅 splittable 为 true 时生效 */
  share: number
  /** period 为 annual 时的扣除月份，取值 1-12 */
  month: number
  /** 是否由本人全额扣除；赡养老人区分独生子女（3000）与非独生子女分摊（≤1500） */
  soleProvider?: boolean
}

export type DeductionStateMap = Record<DeductionKey, DeductionState>
