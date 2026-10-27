/**
 * @Author: wj
 * @FilePath: src/core/tax.ts
 * @Description: 工资薪金个人所得税引擎：居民个人累计预扣预缴 / 非居民个人按月单独计税，并输出年度汇算口径
 */
import { BASIC_DEDUCTION_MONTHLY } from '@/config/policy'
import { DEDUCTION_KEYS } from '@/types'
import type { DeductionKey, DeductionStateMap } from '@/types'
import type { IncomeItem } from '@/types'
import type { InsuranceMonthDetail, MonthlyResult } from '@/types'
import type { StageRange, TaxpayerType } from '@/types'
import { ANNUAL_TAX_BRACKETS, MONTHLY_TAX_BRACKETS } from '@/config/taxBrackets'
import { DEDUCTION_CATALOG } from '@/config/specialDeductions'
import { amountOfStage, stageTypeOfMonth } from './stage'
import { bonusTaxSeparate, taxByBrackets } from './bonus'
import { dec, nonNegative, round2, sumMoney } from './money'

/** 公益捐赠需要结合当年应纳税所得额动态限额，故单独从常规扣除中剥离 */
const DONATION_KEY: DeductionKey = 'donation'

export interface EngineContext {
  incomes: IncomeItem[]
  insuranceMonthly: InsuranceMonthDetail[]
  deductions: DeductionStateMap
  /** 当年入职月份，入职前不产生收入与扣除 */
  startMonth: number
  /** 当年离职月份，离职后不产生收入与扣除 */
  endMonth: number
  /**
   * 各奖金项走「单独计税」的金额，key 为 IncomeItem.id
   * 一个纳税年度内只允许一笔奖金享受单独计税，其余部分并入综合所得
   */
  bonusSeparateAmounts: Record<string, number>
  /** 雇佣阶段划分，决定逐月发放金额口径 */
  stages: StageRange[]
  /** 居民个人累计预扣；非居民个人按月单独计税且不享受专项附加扣除 */
  taxpayerType: TaxpayerType
  /** 每月减免税额（元），如残疾、孤老、烈属等减征政策 */
  taxReductionMonthly: number
}

export interface EngineResult extends AnnualSnapshot {
  monthly: MonthlyResult[]
  /** 综合所得口径累计已预扣税额，不含年终奖单独计税部分 */
  comprehensiveWithheld: number
  /** 全年专项附加扣除合计（不含仅汇算扣除项、不含公益捐赠） */
  deductionAnnual: number
  /** 全年专项附加扣除合计（含仅汇算扣除项） */
  deductionAnnualAll: number
  /** 全年申报的公益捐赠额（已过上限，未考虑比例限额） */
  donationDeclaredAnnual: number
  /** 全年实际可扣除的公益捐赠额，受应纳税所得额比例限额约束 */
  donationAppliedAnnual: number
}

interface MonthIncome {
  gross: number
  comprehensive: number
  taxFree: number
  /** 各收入项当月金额，key 为 IncomeItem.id */
  breakdown: Record<string, number>
}

/** 汇总当月收入：区分应发总额、并入综合所得部分与免税部分 */
function incomeOfMonth(
  incomes: IncomeItem[],
  month: number,
  startMonth: number,
  endMonth: number,
  bonusSeparateAmounts: Record<string, number>,
  stages: StageRange[],
): MonthIncome {
  const enabled = incomes.filter((item) => item.enabled)
  const breakdown: Record<string, number> = {}
  enabled.forEach((item) => {
    breakdown[item.id] = 0
  })

  const zero: MonthIncome = { gross: 0, comprehensive: 0, taxFree: 0, breakdown }
  // 入职前与离职后均无收入
  if (month < startMonth || month > endMonth) return zero

  const stage = stageTypeOfMonth(stages, month)

  let gross = 0
  let comprehensive = 0
  enabled.forEach((item) => {
    const monthlyAmount = amountOfStage(item, stage)
    const paid = item.cycle === 'monthly' ? monthlyAmount : item.month === month ? monthlyAmount : 0
    if (paid <= 0) return
    gross = round2(dec(gross).plus(paid))
    breakdown[item.id] = round2(dec(breakdown[item.id]).plus(paid))
    if (!item.taxable) return

    // 单独计税的部分不并入综合所得，其余并入
    const separateAmount =
      item.kind === 'bonus' ? Math.min(bonusSeparateAmounts[item.id] ?? 0, paid) : 0
    comprehensive = round2(dec(comprehensive).plus(dec(paid).minus(separateAmount)))
  })

  return {
    gross,
    comprehensive,
    taxFree: round2(dec(gross).minus(comprehensive)),
    breakdown,
  }
}

/**
 * 当月扣除额合计
 * filter 用于把公益捐赠从常规扣除中剥离，捐赠限额依赖应纳税所得额需单独计算
 */
function deductionSum(
  deductions: DeductionStateMap,
  month: number,
  startMonth: number,
  endMonth: number,
  includeSettlementOnly: boolean,
  filter: (key: DeductionKey) => boolean,
): number {
  if (month < startMonth || month > endMonth) return 0
  return sumMoney(
    DEDUCTION_KEYS.filter(filter).map((key: DeductionKey) => {
      const state = deductions[key]
      if (!state?.enabled) return 0
      const meta = DEDUCTION_CATALOG[key]
      if (meta.settlementOnly && !includeSettlementOnly) return 0

      const raw = meta.splittable ? round2(dec(state.amount).mul(dec(state.share))) : state.amount
      // 起扣线：仅超过部分可扣除，如大病医疗的 15000 元自付门槛
      const afterThreshold = Math.max(0, round2(dec(raw).minus(dec(meta.threshold ?? 0))))
      // 分摊口径与全额口径的上限不同，如赡养老人非独生子女每人不超过 1500
      const cap = meta.sharedLimit && state.soleProvider === false ? meta.sharedLimit : meta.limit
      const effective = cap > 0 ? Math.min(afterThreshold, cap) : afterThreshold

      if (meta.period === 'monthly') return effective
      // 年度一次性扣除落在入职月之前时顺延至入职月，避免当年扣除被静默吞掉
      const hitMonth = Math.max(state.month, startMonth)
      return month === hitMonth ? effective : 0
    }),
  )
}

/** 常规扣除（不含公益捐赠） */
function deductionOfMonth(
  deductions: DeductionStateMap,
  month: number,
  startMonth: number,
  endMonth: number,
  includeSettlementOnly: boolean,
): number {
  return deductionSum(deductions, month, startMonth, endMonth, includeSettlementOnly, (key) => key !== DONATION_KEY)
}

/** 当月申报的公益捐赠额 */
function donationOfMonth(
  deductions: DeductionStateMap,
  month: number,
  startMonth: number,
  endMonth: number,
): number {
  return deductionSum(deductions, month, startMonth, endMonth, false, (key) => key === DONATION_KEY)
}

/** 公益捐赠扣除比例上限，取自政策目录便于统一维护 */
const DONATION_RATIO_LIMIT = DEDUCTION_CATALOG.donation.ratioLimit ?? 0.3

/**
 * 按应纳税所得额比例计算捐赠可扣除额
 * 扣除额不得超过「未扣除捐赠前的应纳税所得额」的比例上限
 */
function applyDonationLimit(tentativeTaxable: number, donationDeclared: number): number {
  if (donationDeclared <= 0) return 0
  const cap = round2(dec(nonNegative(tentativeTaxable)).mul(DONATION_RATIO_LIMIT))
  return Math.min(donationDeclared, cap)
}

/** 当月年终奖单独计税额，只对纳入单独计税方案的金额计税 */
function bonusTaxOfMonth(
  incomes: IncomeItem[],
  month: number,
  startMonth: number,
  endMonth: number,
  bonusSeparateAmounts: Record<string, number>,
  stages: StageRange[],
): number {
  if (month < startMonth || month > endMonth) return 0
  const stage = stageTypeOfMonth(stages, month)
  const amount = sumMoney(
    incomes
      .filter((item) => item.enabled && item.kind === 'bonus' && item.cycle === 'once')
      .filter((item) => item.month === month)
      .map((item) => Math.min(bonusSeparateAmounts[item.id] ?? 0, amountOfStage(item, stage))),
  )
  return bonusTaxSeparate(amount)
}

/**
 * 逐月计税主循环
 * 居民个人：本期应预扣 = 累计应纳税所得额查年度税率表 - 累计已预扣 - 累计减免，负数不退税留待汇算
 * 非居民个人：按月收入单独计税，不累计、不享受专项附加扣除
 */
export function runMonthlyEngine(ctx: EngineContext): EngineResult {
  const monthly: MonthlyResult[] = []
  const isResident = ctx.taxpayerType !== 'nonResident'

  let cumIncome = 0
  let cumTaxFree = 0
  let cumInsurance = 0
  let cumDeduction = 0
  let cumDonation = 0
  let cumTaxPaid = 0
  let cumReduction = 0

  let grossAnnual = 0
  let comprehensiveAnnual = 0
  let taxFreeAnnual = 0
  let insurancePersonalAnnual = 0
  let insuranceCompanyAnnual = 0
  let taxAnnual = 0
  let bonusTaxAnnual = 0
  let netAnnual = 0
  let deductionMonthlyAnnual = 0
  let deductionAllAnnual = 0
  let taxableIncome = 0
  let donationAppliedAnnual = 0

  const workedMonthsTotal = Math.max(0, ctx.endMonth - ctx.startMonth + 1)

  for (let month = 1; month <= 12; month += 1) {
    const employed = month >= ctx.startMonth && month <= ctx.endMonth
    const insurance = ctx.insuranceMonthly[month - 1]
    const income = incomeOfMonth(
      ctx.incomes,
      month,
      ctx.startMonth,
      ctx.endMonth,
      ctx.bonusSeparateAmounts,
      ctx.stages,
    )
    const deductionTotal = isResident
      ? deductionOfMonth(ctx.deductions, month, ctx.startMonth, ctx.endMonth, false)
      : 0
    const deductionAll = isResident
      ? deductionOfMonth(ctx.deductions, month, ctx.startMonth, ctx.endMonth, true)
      : 0
    const donationDeclared = isResident
      ? donationOfMonth(ctx.deductions, month, ctx.startMonth, ctx.endMonth)
      : 0
    const basicDeduction = employed ? BASIC_DEDUCTION_MONTHLY : 0

    cumIncome = round2(dec(cumIncome).plus(income.comprehensive))
    cumTaxFree = round2(dec(cumTaxFree).plus(income.taxFree))
    cumInsurance = round2(dec(cumInsurance).plus(insurance.personalTotal))
    cumDeduction = round2(dec(cumDeduction).plus(deductionTotal))
    cumDonation = round2(dec(cumDonation).plus(donationDeclared))

    const monthsCount = !employed
      ? month < ctx.startMonth
        ? 0
        : workedMonthsTotal
      : month - ctx.startMonth + 1

    let currentTax = 0
    let donationApplied = 0

    if (isResident) {
      const tentative = nonNegative(
        round2(
          dec(cumIncome)
            .minus(cumInsurance)
            .minus(cumDeduction)
            .minus(dec(BASIC_DEDUCTION_MONTHLY).mul(monthsCount)),
        ),
      )
      donationApplied = applyDonationLimit(tentative, cumDonation)
      taxableIncome = nonNegative(round2(dec(tentative).minus(donationApplied)))

      const totalTax = taxByBrackets(ANNUAL_TAX_BRACKETS, taxableIncome)
      cumReduction = round2(dec(cumReduction).plus(employed ? ctx.taxReductionMonthly : 0))
      const currentTaxRaw = round2(dec(totalTax).minus(cumTaxPaid).minus(cumReduction))
      // 累计预扣出现负数时本期不办理退税，待年度汇算统一处理，故不回冲累计已预扣额
      currentTax = currentTaxRaw > 0 ? currentTaxRaw : 0
      if (currentTax > 0) cumTaxPaid = round2(dec(cumTaxPaid).plus(currentTax))
    } else {
      // 非居民个人以每月收入额减除费用后的余额为应纳税所得额，适用按月换算税率表
      const monthlyTaxable = nonNegative(
        round2(dec(income.comprehensive).minus(insurance.personalTotal).minus(basicDeduction)),
      )
      taxableIncome = monthlyTaxable
      const raw = round2(
        dec(taxByBrackets(MONTHLY_TAX_BRACKETS, monthlyTaxable)).minus(
          employed ? ctx.taxReductionMonthly : 0,
        ),
      )
      currentTax = raw > 0 ? raw : 0
      cumTaxPaid = round2(dec(cumTaxPaid).plus(currentTax))
    }

    const bonusTax = isResident
      ? bonusTaxOfMonth(
          ctx.incomes,
          month,
          ctx.startMonth,
          ctx.endMonth,
          ctx.bonusSeparateAmounts,
          ctx.stages,
        )
      : 0
    const taxTotal = round2(dec(currentTax).plus(bonusTax))
    const net = round2(
      dec(income.gross).minus(insurance.personalTotal).minus(currentTax).minus(bonusTax),
    )

    grossAnnual = round2(dec(grossAnnual).plus(income.gross))
    comprehensiveAnnual = round2(dec(comprehensiveAnnual).plus(income.comprehensive))
    taxFreeAnnual = round2(dec(taxFreeAnnual).plus(income.taxFree))
    insurancePersonalAnnual = round2(dec(insurancePersonalAnnual).plus(insurance.personalTotal))
    insuranceCompanyAnnual = round2(dec(insuranceCompanyAnnual).plus(insurance.companyTotal))
    taxAnnual = round2(dec(taxAnnual).plus(currentTax))
    bonusTaxAnnual = round2(dec(bonusTaxAnnual).plus(bonusTax))
    netAnnual = round2(dec(netAnnual).plus(net))
    deductionMonthlyAnnual = round2(dec(deductionMonthlyAnnual).plus(deductionTotal))
    deductionAllAnnual = round2(dec(deductionAllAnnual).plus(deductionAll))
    donationAppliedAnnual = donationApplied

    monthly.push({
      month,
      stage: stageTypeOfMonth(ctx.stages, month),
      gross: income.gross,
      comprehensiveIncome: income.comprehensive,
      taxFreeIncome: income.taxFree,
      insuranceBase: insurance.base,
      insurancePersonal: insurance.personalTotal,
      insuranceCompany: insurance.companyTotal,
      basicDeduction,
      deductionTotal,
      incomeBreakdown: income.breakdown,
      cumulativeTaxable: taxableIncome,
      cumulativeTaxPaid: cumTaxPaid,
      tax: currentTax,
      bonusTax,
      taxTotal,
      net,
    })
  }

  return {
    monthly,
    comprehensiveWithheld: cumTaxPaid,
    deductionAnnual: deductionMonthlyAnnual,
    deductionAnnualAll: deductionAllAnnual,
    donationDeclaredAnnual: cumDonation,
    donationAppliedAnnual,
    // 年度汇总所需的中期结果一并回传，避免上层重复遍历
    ...buildAnnualSnapshot({
      grossAnnual,
      comprehensiveAnnual,
      taxFreeAnnual,
      insurancePersonalAnnual,
      insuranceCompanyAnnual,
      taxAnnual,
      bonusTaxAnnual,
      netAnnual,
      taxableIncome,
    }),
  }
}

interface AnnualSnapshotInput {
  grossAnnual: number
  comprehensiveAnnual: number
  taxFreeAnnual: number
  insurancePersonalAnnual: number
  insuranceCompanyAnnual: number
  taxAnnual: number
  bonusTaxAnnual: number
  netAnnual: number
  taxableIncome: number
}

interface AnnualSnapshot {
  gross: number
  comprehensiveIncome: number
  taxFreeIncome: number
  insurancePersonal: number
  insuranceCompany: number
  companyCost: number
  taxableIncome: number
  tax: number
  net: number
  netRate: number
  taxRate: number
}

function buildAnnualSnapshot(input: AnnualSnapshotInput): AnnualSnapshot {
  // 税负率与全年个税保持同一口径，均含年终奖单独计税部分
  const taxTotal = round2(dec(input.taxAnnual).plus(input.bonusTaxAnnual))
  return {
    gross: input.grossAnnual,
    comprehensiveIncome: input.comprehensiveAnnual,
    taxFreeIncome: input.taxFreeAnnual,
    insurancePersonal: input.insurancePersonalAnnual,
    insuranceCompany: input.insuranceCompanyAnnual,
    companyCost: round2(dec(input.grossAnnual).plus(input.insuranceCompanyAnnual)),
    taxableIncome: input.taxableIncome,
    tax: taxTotal,
    net: input.netAnnual,
    netRate: input.grossAnnual > 0 ? round2(dec(input.netAnnual).div(input.grossAnnual)) : 0,
    taxRate: input.grossAnnual > 0 ? round2(dec(taxTotal).div(input.grossAnnual)) : 0,
  }
}

/**
 * 年度汇算口径：把仅能在汇算时扣除的项目并入后重算全年应纳税额
 * 公益捐赠仍受应纳税所得额比例限额约束
 * 返回正数表示应补税，负数表示应退税
 */
export function computeSettlement(params: {
  comprehensiveIncome: number
  insurancePersonal: number
  /** 汇算口径扣除合计，不含公益捐赠 */
  deductionAll: number
  /** 全年申报的公益捐赠额 */
  donation: number
  monthsWorked: number
  comprehensiveWithheld: number
}): { settlementTax: number; settlementDiff: number; donationApplied: number } {
  const tentative = nonNegative(
    round2(
      dec(params.comprehensiveIncome)
        .minus(params.insurancePersonal)
        .minus(params.deductionAll)
        .minus(dec(BASIC_DEDUCTION_MONTHLY).mul(params.monthsWorked)),
    ),
  )
  const donationApplied = applyDonationLimit(tentative, params.donation)
  const taxable = nonNegative(round2(dec(tentative).minus(donationApplied)))
  const settlementTax = taxByBrackets(ANNUAL_TAX_BRACKETS, taxable)
  return {
    settlementTax,
    settlementDiff: round2(dec(settlementTax).minus(params.comprehensiveWithheld)),
    donationApplied,
  }
}
