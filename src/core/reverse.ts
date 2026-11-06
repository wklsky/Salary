/**
 * @Author: wj
 * @FilePath: src/core/reverse.ts
 * @Description: 目标倒推：以指定工资项的月发放额为变量，二分求解期望到手金额
 */
import type { IncomeItem, SalaryInput } from '@/types'
import { dec, round2 } from './money'
import { calculateSalary } from './index'

/** 反推参数 */
export interface ReverseParams {
  /** 完整的计算入参，反推时只调整「可调项」的金额 */
  input: SalaryInput
  /** 期望的月度到手金额（元） */
  targetMonthlyNet: number
  /** 指定可调整的收入项 id；缺省自动挑选第一个合适的工资项 */
  adjustIncomeId?: string
}

/** 反推结果 */
export interface ReversePlan {
  /** 目标是否可达 */
  reachable: boolean
  /** 实际参与调整的收入项 */
  adjustIncomeId: string
  adjustIncomeName: string
  /** 需要把该项调整为的月发放额（元） */
  monthlyIncome: number
  /** 在职月数 */
  monthsWorked: number
  /** 回代后的月度到手（元），按年度到手 ÷ 在职月数折算 */
  monthlyNet: number
  /** 回代后的年度到手（元） */
  annualNet: number
  /** 达成值 − 目标（元/月），正数表示高于目标 */
  gap: number
  /** 目标不可达时的最低可达月度到手 */
  minMonthlyNet?: number
}

/** 反推可调项：逐月发放、计税、非现金、非计分制的工资项 */
export function eligibleAdjustIncomes(incomes: IncomeItem[]): IncomeItem[] {
  return incomes.filter(
    (item) =>
      item.enabled &&
      item.cycle === 'monthly' &&
      item.kind === 'salary' &&
      item.taxable &&
      !item.nonCash &&
      !item.scoreBased,
  )
}

/**
 * 把指定收入项规整为「在职期间足额按月发放」的工资项
 * 反推问的是「税前月薪应该是多少」，因此清除该项的阶段差异、逐月金额与单月覆盖
 */
function normalizeAdjustedInput(input: SalaryInput, itemId: string, amount: number): SalaryInput {
  const incomes = input.incomes.map((item) =>
    item.id === itemId
      ? {
          ...item,
          amount: round2(amount),
          staged: false,
          stageAmounts: {},
          stageEnabled: {},
          variableByMonth: false,
          monthlyAmounts: undefined,
          scoreBased: false,
        }
      : item,
  )

  const monthOverrides: SalaryInput['monthOverrides'] = {}
  Object.entries(input.monthOverrides ?? {}).forEach(([month, override]) => {
    const amounts = { ...(override.amounts ?? {}) }
    delete amounts[itemId]
    monthOverrides[Number(month)] = { ...override, amounts }
  })

  return { ...input, incomes, monthOverrides }
}

/** 指定金额下的年度到手 */
function annualNetAt(input: SalaryInput, itemId: string, amount: number): number {
  return calculateSalary(normalizeAdjustedInput(input, itemId, amount)).annual.net
}

/** 季度/月度到手目标折算年度目标 */
function monthlyTargetToAnnual(targetMonthlyNet: number, monthsWorked: number): number {
  return round2(dec(targetMonthlyNet).mul(monthsWorked))
}

/**
 * 目标倒推主入口
 *
 * 到手金额随工资单调不减（含税率跳档、社保封顶等分段线性平台期），
 * 故用「首个使到手 ≥ 目标的金额」二分逼近，再在邻域取最接近目标的候选。
 * 每次迭代完整跑 calculateSalary，保证年终奖拆分、封顶托底等口径与正式结果一致。
 */
export function reverseMonthlyNet(params: ReverseParams): ReversePlan | null {
  const { input, targetMonthlyNet } = params
  const monthsWorked = Math.max(0, input.endMonth - input.startMonth + 1)
  if (monthsWorked <= 0) return null
  if (!Number.isFinite(targetMonthlyNet) || targetMonthlyNet < 0) return null

  const eligible = eligibleAdjustIncomes(input.incomes)
  if (eligible.length === 0) return null
  const item =
    eligible.find((entry) => entry.id === params.adjustIncomeId) ?? eligible[0]

  const annualTarget = monthlyTargetToAnnual(targetMonthlyNet, monthsWorked)
  const minAnnualNet = annualNetAt(input, item.id, 0)
  const minMonthlyNet = round2(dec(minAnnualNet).div(monthsWorked))

  // 即使工资为 0 也已超过目标，只能如实返回最低可达值
  if (minAnnualNet > annualTarget + 0.005) {
    return {
      reachable: false,
      adjustIncomeId: item.id,
      adjustIncomeName: item.name,
      monthlyIncome: 0,
      monthsWorked,
      monthlyNet: minMonthlyNet,
      annualNet: minAnnualNet,
      gap: round2(dec(minMonthlyNet).minus(targetMonthlyNet)),
      minMonthlyNet,
    }
  }

  // 先指数扩张找到一个使到手超过目标的金额，再二分收敛
  const ceiling = 50_000_000
  let upper = Math.min(Math.max(item.amount || 0, 10000, targetMonthlyNet * 2), ceiling)
  let upperNet = annualNetAt(input, item.id, upper)
  let guard = 0
  while (upperNet < annualTarget && upper < ceiling && guard < 32) {
    upper = Math.min(upper * 2, ceiling)
    upperNet = annualNetAt(input, item.id, upper)
    guard += 1
  }

  if (upperNet < annualTarget) {
    return {
      reachable: false,
      adjustIncomeId: item.id,
      adjustIncomeName: item.name,
      monthlyIncome: upper,
      monthsWorked,
      monthlyNet: round2(dec(upperNet).div(monthsWorked)),
      annualNet: upperNet,
      gap: round2(dec(upperNet).div(monthsWorked).minus(targetMonthlyNet)),
    }
  }

  let low = 0
  let high = upper
  // 高精度二分：40 次可把区间收敛到分以下
  for (let index = 0; index < 40 && high - low > 0.005; index += 1) {
    const mid = (low + high) / 2
    if (annualNetAt(input, item.id, mid) < annualTarget) low = mid
    else high = mid
  }

  // 二分落在最小可行值，税率跳档与取整会让附近存在更贴近目标的解
  const candidates = [high, high - 0.01, high + 0.01, high - 0.1, high + 0.1, high - 1, high + 1]
    .filter((value) => value >= 0 && value <= ceiling)
    .map((value) => round2(value))

  let bestIncome = round2(high)
  let bestDiff = Number.POSITIVE_INFINITY
  candidates.forEach((candidate) => {
    const diff = Math.abs(annualNetAt(input, item.id, candidate) - annualTarget)
    if (diff < bestDiff) {
      bestDiff = diff
      bestIncome = candidate
    }
  })

  const annualNet = annualNetAt(input, item.id, bestIncome)
  const monthlyNet = round2(dec(annualNet).div(monthsWorked))
  return {
    reachable: true,
    adjustIncomeId: item.id,
    adjustIncomeName: item.name,
    monthlyIncome: bestIncome,
    monthsWorked,
    monthlyNet,
    annualNet,
    gap: round2(dec(monthlyNet).minus(targetMonthlyNet)),
  }
}
