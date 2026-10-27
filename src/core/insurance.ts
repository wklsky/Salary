/**
 * @Author: wj
 * @FilePath: src/core/insurance.ts
 * @Description: 五险一金计算：缴费基数口径解析、上下限封顶托底与逐月缴纳明细
 */
import { CITIES, DEFAULT_CITY } from '@/config/cities'
import { FALLBACK_STAGE } from '@/config/stages'
import type {
  CityPolicy,
  IncomeItem,
  InsuranceAmountMap,
  InsuranceConfig,
  InsuranceMonthDetail,
  InsuranceType,
  StageRange,
  StageType,
} from '@/types'
import { INSURANCE_TYPES } from '@/types'
import { amountOfMonth, skippedInsuranceTypesOfMonth, stageTypeOfMonth } from './stage'
import { clampNumber, dec, round0, round2, sumMoney } from './money'

/** 城市政策查找：未命中时使用兜底政策，保证计算不中断 */
export function resolveCity(code: string): CityPolicy {
  return CITIES.find((city) => city.code === code) ?? DEFAULT_CITY
}

export function emptyAmountMap(): InsuranceAmountMap {
  return {
    pension: 0,
    medical: 0,
    unemployment: 0,
    injury: 0,
    maternity: 0,
    housingFund: 0,
  }
}

/**
 * 解析指定阶段下计入缴费基数的收入
 * 一次性收入（如年终奖）按 12 个月摊薄计入基数，避免单月基数被顶到上限而失真
 */
export function resolveBaseIncome(
  incomes: IncomeItem[],
  stage: StageType = FALLBACK_STAGE,
  month = 1,
): { monthly: number; onceMonthly: number } {
  const enabled = incomes.filter((item) => item.enabled)
  // 逐月项按当月金额取值，一次性项按其发放月份取值后摊薄
  const amountOf = (item: IncomeItem) =>
    amountOfMonth(item, item.cycle === 'monthly' ? month : item.month, stage)
  const monthly = sumMoney(
    enabled
      .filter((item) => item.cycle === 'monthly' && item.intoInsuranceBase)
      .map(amountOf),
  )
  const once = sumMoney(
    enabled.filter((item) => item.cycle === 'once' && item.intoInsuranceBase).map(amountOf),
  )
  return { monthly, onceMonthly: round2(dec(once).div(12)) }
}

/**
 * 解析公积金缴费基数原始值
 * same 口径直接沿用社保基数；其余口径按公积金自己的基数配置解析
 */
function resolveHousingFundRawBase(
  config: InsuranceConfig,
  city: CityPolicy,
  baseIncome: { monthly: number; onceMonthly: number },
  socialRawBase: number,
): number {
  if (config.housingFundBaseMode === 'same') return socialRawBase
  return resolveRawBase(
    { ...config, baseMode: config.housingFundBaseMode, manualBase: config.housingFundManualBase },
    city,
    baseIncome,
  )
}

/** 按口径解析月缴费基数原始值（未做上下限收敛） */
export function resolveRawBase(
  config: InsuranceConfig,
  city: CityPolicy,
  baseIncome: { monthly: number; onceMonthly: number },
): number {
  switch (config.baseMode) {
    case 'gross':
      return round2(dec(baseIncome.monthly).plus(baseIncome.onceMonthly))
    case 'lastYearAvg':
    case 'manual':
      return round2(config.manualBase)
    case 'lowerLimit':
      return city.base.lower
    default:
      return round2(baseIncome.monthly)
  }
}

/** 公积金基数上下限缺省时沿用社保基数上下限 */
function resolveHousingFundRange(city: CityPolicy): { lower: number; upper: number } {
  return city.housingFundBase ?? city.base
}

/** 无社保缴纳的月份明细；实习期与入职前都走这个分支 */
function buildEmptyDetail(month: number): InsuranceMonthDetail {
  return {
    month,
    base: 0,
    housingFundBase: 0,
    personal: emptyAmountMap(),
    company: emptyAmountMap(),
    personalTotal: 0,
    companyTotal: 0,
  }
}

export interface ComputeInsuranceParams {
  incomes: IncomeItem[]
  insurance: InsuranceConfig
  /** 当年入职月份，入职前的月份不产生缴纳记录 */
  startMonth: number
  /** 当年离职月份，离职后的月份不产生缴纳记录 */
  endMonth: number
  /** 雇佣阶段划分；实习期等阶段可不缴纳社保 */
  stages: StageRange[]
}

export function computeInsuranceMonthly(params: ComputeInsuranceParams): InsuranceMonthDetail[] {
  const city = resolveCity(params.insurance.cityCode)
  const socialRange = city.base
  const housingRange = resolveHousingFundRange(city)

  const result: InsuranceMonthDetail[] = []
  for (let month = 1; month <= 12; month += 1) {
    // 入职前与离职后均无劳动关系，不产生社保缴纳
    if (month < params.startMonth || month > params.endMonth) {
      result.push(buildEmptyDetail(month))
      continue
    }

    // 实习期等阶段未建立社保关系，同样不产生缴纳
    const skippedTypes = skippedInsuranceTypesOfMonth(params.stages, month)
    if (skippedTypes.length >= INSURANCE_TYPES.length) {
      result.push(buildEmptyDetail(month))
      continue
    }

    // 基数按当月所处阶段与当月金额解析，使试用期与转正后可以采用不同的缴费基数
    const stage = stageTypeOfMonth(params.stages, month)
    const baseIncome = resolveBaseIncome(params.incomes, stage, month)
    const rawBase = resolveRawBase(params.insurance, city, baseIncome)
    const housingRawBase = resolveHousingFundRawBase(
      params.insurance,
      city,
      baseIncome,
      rawBase,
    )

    const base = params.insurance.clampEnabled
      ? clampNumber(rawBase, socialRange.lower, socialRange.upper)
      : rawBase
    const housingFundBase = params.insurance.housingFundClampEnabled
      ? clampNumber(housingRawBase, housingRange.lower, housingRange.upper)
      : housingRawBase

    const personal = emptyAmountMap()
    const company = emptyAmountMap()

    INSURANCE_TYPES.forEach((type: InsuranceType) => {
      // 该阶段停缴此险种，如试用期不缴公积金
      if (skippedTypes.includes(type)) return
      const itemConfig = params.insurance.items[type]
      if (!itemConfig?.enabled) return
      const rate = itemConfig.rate ?? city.rates[type]
      // 该险种在本市已并入医疗，不再单独征收
      if (!rate) return

      const applyBase = type === 'housingFund' ? housingFundBase : base
      // 公积金按月以整元扣缴，其余险种保留到分
      const round = type === 'housingFund' ? round0 : round2
      personal[type] = round(dec(applyBase).mul(rate.personal))
      company[type] = round(dec(applyBase).mul(rate.company))

      // 大病医疗固定额由个人承担，叠加在医疗个人部分；未填写则不计入
      const medicalFixed = params.insurance.medicalFixed ?? 0
      if (type === 'medical' && medicalFixed > 0) {
        personal[type] = round2(dec(personal[type]).plus(medicalFixed))
      }
    })

    result.push({
      month,
      base,
      housingFundBase,
      personal,
      company,
      personalTotal: sumMoney(INSURANCE_TYPES.map((type) => personal[type])),
      companyTotal: sumMoney(INSURANCE_TYPES.map((type) => company[type])),
    })
  }

  return result
}
