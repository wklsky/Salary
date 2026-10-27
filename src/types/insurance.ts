/**
 * @Author: wj
 * @FilePath: src/types/insurance.ts
 * @Description: 五险一金险种、城市政策与缴费口径的类型定义
 */

/** 险种：养老 / 医疗 / 失业 / 工伤 / 生育 / 住房公积金 */
export type InsuranceType =
  | 'pension'
  | 'medical'
  | 'unemployment'
  | 'injury'
  | 'maternity'
  | 'housingFund'

export const INSURANCE_TYPES: InsuranceType[] = [
  'pension',
  'medical',
  'unemployment',
  'injury',
  'maternity',
  'housingFund',
]

/** 费率对：个人缴费比例 / 单位缴费比例，取值 0-1 */
export interface RatePair {
  personal: number
  company: number
}

export interface BaseRange {
  lower: number
  upper: number
}

export interface CityPolicy {
  code: string
  name: string
  /** 社保缴费基数上下限（月，单位元） */
  base: BaseRange
  /** 公积金缴费基数上下限，缺省时沿用社保基数上下限 */
  housingFundBase?: BaseRange
  /** 各险种费率；null 表示该市已将此险种并入医疗，不单独征收 */
  rates: Record<InsuranceType, RatePair | null>
  /** 大病医疗等按月固定征收额（元/月），计入个人医疗 */
  medicalFixed?: number
  /** 基数上下限的参考年份，用于提示用户按年核对 */
  referenceYear: number
}

/**
 * 缴费基数口径：
 * - gross 按当月计入基数收入
 * - lastYearAvg 按上年度月均（手动输入）
 * - manual 手动指定固定基数
 * - lowerLimit 直接按下限托底
 */
export type InsuranceBaseMode = 'gross' | 'lastYearAvg' | 'manual' | 'lowerLimit'

export interface InsuranceItemConfig {
  enabled: boolean
  /** 覆盖城市默认费率，未设置时使用城市费率 */
  rate?: RatePair
}

/**
 * 公积金缴费基数口径：
 * - same 与社保缴费基数保持一致（多数企业做法）
 * - 其余取值含义同 InsuranceBaseMode，用于公积金基数与社保基数不一致的场景
 */
export type HousingFundBaseMode = 'same' | InsuranceBaseMode

export interface InsuranceConfig {
  cityCode: string
  baseMode: InsuranceBaseMode
  /** lastYearAvg / manual 口径下的月缴费基数 */
  manualBase: number
  /** 是否启用上下限封顶托底；关闭后按实际基数缴纳 */
  clampEnabled: boolean
  /** 公积金缴费基数口径，独立于社保基数 */
  housingFundBaseMode: HousingFundBaseMode
  /** 公积金 lastYearAvg / manual 口径下的月缴费基数 */
  housingFundManualBase: number
  /** 公积金是否单独启用上下限封顶托底 */
  housingFundClampEnabled: boolean
  /**
   * 大病医疗等按月固定征收额（元/月），叠加在个人医疗部分
   * 各地口径差异大，默认 0 不计入，需要时由用户按当地标准填写
   */
  medicalFixed: number
  items: Record<InsuranceType, InsuranceItemConfig>
}
