/**
 * @Author: wj
 * @FilePath: src/core/index.ts
 * @Description: 计算内核统一出口：编排社保、累计预扣与年终奖双口径对比
 */
import { INSURANCE_TYPES } from '@/types'
import type {
  AnnualSummary,
  BonusComparison,
  InsuranceAnnualItem,
  InsuranceType,
  SalaryInput,
  SalaryResult,
} from '@/types'
import { MONTHLY_TAX_BRACKETS } from '@/config/taxBrackets'
import { bonusTaxSeparate, findInvalidRange } from './bonus'
import { computeInsuranceMonthly } from './insurance'
import { dec, round2, sumMoney } from './money'
import { amountOfStage, stageTypeOfMonth } from './stage'
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

/** 收集当年一次性奖金，金额按发放当月所处阶段取值，按金额从大到小排序 */
function collectBonusItems(input: SalaryInput): BonusItem[] {
  return input.incomes
    .filter((item) => item.enabled && item.kind === 'bonus' && item.cycle === 'once')
    .map((item) => ({
      id: item.id,
      amount: amountOfStage(item, stageTypeOfMonth(input.stages, item.month)),
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
  })
}

/**
 * 枚举单独计税金额的候选点
 * 除均匀分布采样外，额外加入月度税率表的档位边界（×12），
 * 边界值本身正是「多发反而少拿」无效区间的左端点，天然是最优解的候选
 */
function bonusSplitCandidates(amount: number): number[] {
  const candidates = new Set<number>([0, amount])
  MONTHLY_TAX_BRACKETS.forEach((bracket) => {
    if (!Number.isFinite(bracket.upper)) return
    const boundary = round2(dec(bracket.upper).mul(12))
    if (boundary < amount) candidates.add(boundary)
  })
  // 采样密度兼顾精度与响应速度：每次计算都会重跑 12 个月引擎，过密会拖慢输入
  const steps = 48
  for (let index = 1; index < steps; index += 1) {
    candidates.add(round2(dec(amount).mul(index).div(steps)))
  }
  return [...candidates].filter((value) => value >= 0 && value <= amount).sort((a, b) => a - b)
}

/**
 * 全链路薪资计算主入口
 * 年终奖会同时跑「单独计税」与「并入综合所得」两套口径，
 * auto 模式下进一步搜索「部分单独计税」的拆分点，取税负最低方案
 */
export function calculateSalary(input: SalaryInput): SalaryResult {
  const insuranceMonthly = computeInsuranceMonthly({
    incomes: input.incomes,
    insurance: input.insurance,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    stages: input.stages,
  })

  // 年终奖金额按发放当月所处阶段取值，试用期发放的奖金可能低于转正后
  const bonusAmount = sumMoney(
    input.incomes
      .filter((item) => item.enabled && item.kind === 'bonus')
      .map((item) => amountOfStage(item, stageTypeOfMonth(input.stages, item.month))),
  )

  const isResident = input.taxpayerType !== 'nonResident'
  // 一个纳税年度内只允许一笔奖金享受单独计税，取金额最大的那笔
  const topBonus = isResident ? collectBonusItems(input)[0] : undefined

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

    for (const amount of bonusSplitCandidates(topBonus.amount)) {
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
  const settlement = computeSettlement({
    comprehensiveIncome: chosen.comprehensiveIncome,
    insurancePersonal: chosen.insurancePersonal,
    deductionAll: chosen.deductionAnnualAll,
    donation: chosen.donationDeclaredAnnual,
    monthsWorked,
    comprehensiveWithheld: chosen.comprehensiveWithheld,
  })

  const annual: AnnualSummary = {
    gross: chosen.gross,
    comprehensiveIncome: chosen.comprehensiveIncome,
    taxFreeIncome: chosen.taxFreeIncome,
    insurancePersonal: chosen.insurancePersonal,
    insuranceCompany: chosen.insuranceCompany,
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
  }
}

export { computeInsuranceMonthly, resolveCity, resolveBaseIncome, resolveRawBase } from './insurance'
export { bonusTaxSeparate, bonusInvalidRanges, findInvalidRange, taxByBrackets } from './bonus'
export { runMonthlyEngine, computeSettlement } from './tax'
export {
  amountOfStage,
  stageTypeOfMonth,
  resolveStageOfMonth,
  isInsuranceSkipped,
  isItemEnabledInStage,
} from './stage'
export * from './money'
