/**
 * @Author: wj
 * @FilePath: src/core/index.ts
 * @Description: 计算内核统一出口：编排社保、累计预扣与年终奖双口径对比
 */
import { INSURANCE_TYPES } from '@/types'
import type {
  AnnualSummary,
  BonusComparison,
  CustomColumnItem,
  IncomeItem,
  InsuranceAnnualItem,
  InsuranceType,
  MonthOverride,
  SalaryInput,
  SalaryResult,
} from '@/types'
import { BONUS_SEPARATE_POLICY_END_YEAR } from '@/config/policy'
import { ANNUAL_TAX_BRACKETS, MONTHLY_TAX_BRACKETS } from '@/config/taxBrackets'
import { bonusTaxSeparate, findInvalidRange } from './bonus'
import { computeInsuranceMonthly } from './insurance'
import { dec, round2, sumMoney } from './money'
import { amountOfMonth, stageTypeOfMonth } from './stage'
import { computeSettlement, runMonthlyEngine } from './tax'

/** 汇总各险种全年缴纳额，供占比分析使用 */
function aggregateInsuranceAnnual(
  monthly: ReturnType<typeof computeInsuranceMonthly>,
): InsuranceAnnualItem[] {
  return INSURANCE_TYPES.map((type: InsuranceType) => ({
    type,
    personal: sumMoney(monthly.map((item) => item.personal[type])),
    company: sumMoney(monthly.map((item) => item.company[type])),
  }))
}

interface BonusItem {
  id: string
  amount: number
}

/**
 * 把用户自定义列转换为虚拟收入项
 * 复用「逐月金额」机制承载 12 个月的列值，计税与计基逻辑无需为自定义列单独分支
 */
function buildCustomIncomeItems(
  columns: CustomColumnItem[],
  monthOverrides: Record<number, MonthOverride>,
): IncomeItem[] {
  return columns
    // 未计入应发的自定义列仅作展示，不参与工资计算
    .filter((column) => column.intoGross)
    .map((column) => ({
      id: column.key,
      name: column.label,
      amount: 0,
      cycle: 'monthly' as const,
      month: 1,
      intoInsuranceBase: column.intoBase,
      taxable: column.taxable,
      kind: 'salary' as const,
      enabled: true,
      staged: false,
      stageAmounts: {},
      stageEnabled: {},
      nonCash: false,
      variableByMonth: true,
      monthlyAmounts: Array.from({ length: 12 }, (_, index) => {
        const override = monthOverrides[index + 1]?.amounts?.[column.key]
        return typeof override === 'number' ? override : (column.values[index] ?? 0)
      }),
    }))
}

/** 一次性收入在归属月的实际金额：单月覆盖优先，其次按归属月所处阶段取值 */
export function paidAmountOfItem(
  item: IncomeItem,
  stages: SalaryInput['stages'],
  monthOverrides: Record<number, MonthOverride>,
): number {
  // 明细按工资所属月展示，一次性收入计入其归属月，不随发放时间顺延
  const override = monthOverrides[item.month]?.amounts?.[item.id]
  if (typeof override === 'number') return override
  return amountOfMonth(item, item.month, stageTypeOfMonth(stages, item.month))
}

/** 收集当年一次性奖金，金额按归属当月所处阶段取值，按金额从大到小排序 */
function collectBonusItems(
  incomes: IncomeItem[],
  stages: SalaryInput['stages'],
  monthOverrides: Record<number, MonthOverride>,
): BonusItem[] {
  return incomes
    .filter((item) => item.enabled && item.kind === 'bonus' && item.cycle === 'once')
    .map((item) => ({
      id: item.id,
      amount: paidAmountOfItem(item, stages, monthOverrides),
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

/** 按给定的单独计税方案跑一遍月度引擎 */
function runEngine(
  input: SalaryInput,
  insuranceMonthly: ReturnType<typeof computeInsuranceMonthly>,
  bonusSeparateAmounts: Record<string, number>,
) {
  return runMonthlyEngine({
    incomes: input.incomes,
    insuranceMonthly,
    deductions: input.deductions,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    bonusSeparateAmounts,
    stages: input.stages,
    taxpayerType: input.taxpayerType,
    taxReductionMonthly: input.taxReductionMonthly,
    monthOverrides: input.monthOverrides ?? {},
    postTaxDeductions: input.postTaxDeductions ?? [],
    payTiming: input.payTiming ?? 'same',
  })
}

/**
 * 枚举单独计税金额的精确候选点
 *
 * 总税负 = 综合所得个税（基数随单独计税金额增大而线性下降） + 年终奖单独计税（随金额分段线性上升），
 * 两部分都是分段线性函数，段内极值只可能落在端点，因此全局最优解只需在以下端点中搜索：
 * 0、奖金全额、月度税率表档位边界 ×12、综合所得年度税率表档位被跨过时对应的拆分点。
 * 公益捐赠比例限额会引入一个额外折点，一并纳入候选。
 */
function bonusSplitCandidates(
  amount: number,
  mergedTaxable: number,
  donationDeclared: number,
): number[] {
  const candidates = new Set<number>([0, amount])
  // 未扣捐赠前的应纳税所得额，用于定位年度税率表档位与捐赠限额折点
  const tentative = round2(dec(mergedTaxable).plus(donationDeclared))
  MONTHLY_TAX_BRACKETS.forEach((bracket) => {
    if (!Number.isFinite(bracket.upper)) return
    const boundary = round2(dec(bracket.upper).mul(12))
    if (boundary > 0 && boundary < amount) candidates.add(boundary)
  })
  ANNUAL_TAX_BRACKETS.forEach((bracket) => {
    if (!Number.isFinite(bracket.upper)) return
    // 综合所得应纳税所得额 = tentative − s，跨过档位边界时 s = tentative − upper
    const boundary = round2(dec(tentative).minus(bracket.upper))
    if (boundary > 0 && boundary < amount) candidates.add(boundary)
  })
  // 捐赠比例限额生效的折点：0.3 × tentative(s) = 申报捐赠额
  if (donationDeclared > 0) {
    const boundary = round2(dec(tentative).minus(dec(donationDeclared).div(0.3)))
    if (boundary > 0 && boundary < amount) candidates.add(boundary)
  }
  return [...candidates].filter((value) => value >= 0 && value <= amount).sort((a, b) => a - b)
}

/**
 * 全链路薪资计算主入口
 * 年终奖会同时跑「单独计税」与「并入综合所得」两套口径，
 * auto 模式下进一步搜索「部分单独计税」的拆分点，取税负最低方案
 */
export function calculateSalary(rawInput: SalaryInput): SalaryResult {
  const monthOverrides = rawInput.monthOverrides ?? {}
  // 自定义列以虚拟收入项身份参与计算，与常规收入项走同一套计税/计基逻辑
  const incomes: IncomeItem[] = [
    ...rawInput.incomes,
    ...buildCustomIncomeItems(rawInput.customColumns ?? [], monthOverrides),
  ]
  const input: SalaryInput = { ...rawInput, incomes, monthOverrides }

  const insuranceMonthly = computeInsuranceMonthly({
    incomes,
    insurance: input.insurance,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    stages: input.stages,
    monthOverrides,
    customCities: input.customCities,
  })

  // 年终奖金额按归属当月所处阶段取值，试用期发放的奖金可能低于转正后
  const bonusAmount = sumMoney(
    incomes
      .filter((item) => item.enabled && item.kind === 'bonus')
      .map((item) => paidAmountOfItem(item, input.stages, monthOverrides)),
  )

  const isResident = input.taxpayerType !== 'nonResident'
  // 年终奖单独计税政策仅适用于居民个人且在政策有效年度内，过期后自动降级为并入综合所得
  const bonusPolicyActive = isResident && input.year <= BONUS_SEPARATE_POLICY_END_YEAR
  // 一个纳税年度内只允许一笔奖金享受单独计税，取金额最大的那笔
  const topBonus = bonusPolicyActive
    ? collectBonusItems(incomes, input.stages, monthOverrides)[0]
    : undefined

  const merged = runEngine(input, insuranceMonthly, {})
  const separate = runEngine(
    input,
    insuranceMonthly,
    topBonus ? { [topBonus.id]: topBonus.amount } : {},
  )

  let applied: 'separate' | 'merged' | 'split'
  let chosen = merged
  let splitAmount: number | undefined

  if (!topBonus) {
    // 无全年一次性奖金时两种口径等价，统一走并入口径避免产生无意义的对比
    applied = 'merged'
  } else if (input.bonusMode === 'separate') {
    applied = 'separate'
    chosen = separate
  } else if (input.bonusMode === 'merged') {
    applied = 'merged'
  } else {
    const pureBest = Math.min(separate.tax, merged.tax)
    let bestTax = pureBest
    let bestAmount = separate.tax <= merged.tax ? topBonus.amount : 0
    let bestResult = separate.tax <= merged.tax ? separate : merged

    for (const amount of bonusSplitCandidates(
      topBonus.amount,
      merged.taxableIncome,
      merged.donationDeclaredAnnual,
    )) {
      if (amount === topBonus.amount || amount === 0) continue
      const candidate = runEngine(input, insuranceMonthly, { [topBonus.id]: amount })
      if (candidate.tax < bestTax) {
        bestTax = candidate.tax
        bestAmount = amount
        bestResult = candidate
      }
    }

    chosen = bestResult
    if (bestAmount >= topBonus.amount) {
      applied = 'separate'
    } else if (bestAmount <= 0) {
      applied = 'merged'
    } else {
      applied = 'split'
      splitAmount = bestAmount
    }
  }

  const monthsWorked = Math.max(0, input.endMonth - input.startMonth + 1)
  // 非居民个人按月分项计税，不适用居民个人的年度汇算，避免展示无意义的补退税
  const settlement = isResident
    ? computeSettlement({
        comprehensiveIncome: chosen.comprehensiveIncome,
        // 劳务报酬等额外收入与工资薪金合并后适用年度税率表
        otherIncome: chosen.otherIncomeAnnual,
        insurancePersonal: chosen.insurancePersonal,
        deductionAll: chosen.deductionAnnualAll,
        donation: chosen.donationDeclaredAnnual,
        monthsWorked,
        comprehensiveWithheld: chosen.comprehensiveWithheld,
        otherWithheld: chosen.otherTaxAnnual,
        taxReductionAnnual: round2(dec(input.taxReductionMonthly).mul(monthsWorked)),
      })
    : { settlementTax: 0, settlementDiff: 0, donationApplied: 0 }

  const annual: AnnualSummary = {
    gross: chosen.gross,
    comprehensiveIncome: chosen.comprehensiveIncome,
    taxFreeIncome: chosen.taxFreeIncome,
    nonCashIncome: chosen.nonCashIncome,
    otherTax: chosen.otherTax,
    otherIncome: chosen.otherIncome,
    insurancePersonal: chosen.insurancePersonal,
    insuranceCompany: chosen.insuranceCompany,
    postTaxDeduction: chosen.postTaxDeduction,
    totalDeduction: chosen.totalDeduction,
    companyCost: chosen.companyCost,
    taxableIncome: chosen.taxableIncome,
    tax: chosen.tax,
    net: chosen.net,
    netRate: chosen.netRate,
    taxRate: chosen.taxRate,
    settlementOnlyDeduction: round2(dec(chosen.deductionAnnualAll).minus(chosen.deductionAnnual)),
    settlementTax: settlement.settlementTax,
    settlementDiff: settlement.settlementDiff,
    donationApplied: settlement.donationApplied,
  }

  /**
   * 回填自定义列的月度展示值
   * 计入应发的列已在 incomeBreakdown 中体现，未计入的列仅展示不参与计算，
   * 两者都写回 customValues，保证表格列与计算结果同源
   */
  chosen.monthly.forEach((month, index) => {
    const values: Record<string, number> = {}
    ;(input.customColumns ?? []).forEach((column) => {
      const override = monthOverrides[index + 1]?.amounts?.[column.key]
      values[column.key] = column.intoGross
        ? (month.incomeBreakdown[column.key] ?? 0)
        : (typeof override === 'number' ? override : column.values[index] ?? 0)
    })
    month.customValues = values
  })

  let bonusComparison: BonusComparison | undefined
  if (bonusAmount > 0 && topBonus) {
    const better =
      applied === 'split' ? 'split' : separate.tax <= merged.tax ? 'separate' : 'merged'
    bonusComparison = {
      separateTax: separate.tax,
      mergedTax: merged.tax,
      // 拆分方案下只有一部分奖金适用单独计税，税额按实际单独部分计算
      bonusTax: bonusTaxSeparate(applied === 'split' ? (splitAmount ?? 0) : topBonus.amount),
      better,
      diff: round2(dec(separate.tax).minus(merged.tax).abs()),
      splitAmount,
      splitTax: applied === 'split' ? chosen.tax : undefined,
      invalidRange: findInvalidRange(topBonus.amount),
    }
  }

  return {
    monthly: chosen.monthly,
    insuranceMonthly,
    insuranceAnnual: aggregateInsuranceAnnual(insuranceMonthly),
    annual,
    bonusComparison,
    appliedBonusMode: applied,
    bonusPolicyActive,
  }
}

export { computeInsuranceMonthly, resolveCity, resolveBaseIncome, resolveRawBase } from './insurance'
export { bonusTaxSeparate, bonusInvalidRanges, findInvalidRange, taxByBrackets } from './bonus'
export { runMonthlyEngine, computeSettlement } from './tax'
export {
  otherIncomeAmount,
  otherIncomeExpense,
  otherIncomeTax,
  otherIncomeTaxable,
  isOtherIncomeKind,
  OTHER_INCOME_KINDS,
  OTHER_INCOME_LABELS,
  OTHER_INCOME_HINTS,
} from './otherIncome'
export {
  amountOfMonth,
  amountOfStage,
  scoreOfMonth,
  stageTypeOfMonth,
  resolveStageOfMonth,
  isInsuranceSkipped,
  isItemEnabledInStage,
  skippedInsuranceTypesOfMonth,
} from './stage'
export * from './money'
export { reverseMonthlyNet, eligibleAdjustIncomes } from './reverse'
export type { ReverseParams, ReversePlan } from './reverse'
