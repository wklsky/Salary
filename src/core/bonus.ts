/**
 * @Author: wj
 * @FilePath: src/core/bonus.ts
 * @Description: 全年一次性奖金计税：单独计税、并入综合所得对比与临界无效区间计算
 */
import { MONTHLY_TAX_BRACKETS } from '@/config/taxBrackets'
import type { TaxBracket } from '@/types'
import { dec, round2 } from './money'

/** 命中税率级距：金额落在 (lower, upper] 区间 */
export function findBracket(brackets: TaxBracket[], amount: number): TaxBracket {
  const matched = brackets.find((item) => amount > item.lower && amount <= item.upper)
  return matched ?? brackets[brackets.length - 1]
}

/** 按级距计算税额：金额 × 税率 - 速算扣除数 */
export function taxByBrackets(brackets: TaxBracket[], amount: number): number {
  const positive = amount > 0 ? amount : 0
  const bracket = findBracket(brackets, positive)
  const tax = round2(dec(positive).mul(bracket.rate).minus(bracket.quickDeduction))
  return tax > 0 ? tax : 0
}

/**
 * 全年一次性奖金单独计税
 * 以「奖金 ÷ 12」查按月换算税率表定位级距，再用全额奖金乘以该级税率
 */
export function bonusTaxSeparate(bonus: number): number {
  if (bonus <= 0) return 0
  const monthlyAverage = dec(bonus).div(12).toNumber()
  const bracket = findBracket(MONTHLY_TAX_BRACKETS, monthlyAverage)
  const tax = round2(dec(bonus).mul(bracket.rate).minus(bracket.quickDeduction))
  return tax > 0 ? tax : 0
}

export interface InvalidRange {
  from: number
  to: number
}

/**
 * 计算「多发奖金反而到手变少」的无效区间
 * 跳档处税额增速超过奖金增速，令净额 net(B) = net(X) 解得区间右端点：
 * X = (B × (1 - r1) + QD1 - QD2) / (1 - r2)
 */
export function bonusInvalidRanges(): InvalidRange[] {
  const ranges: InvalidRange[] = []
  for (let index = 0; index < MONTHLY_TAX_BRACKETS.length - 1; index += 1) {
    const current = MONTHLY_TAX_BRACKETS[index]
    const next = MONTHLY_TAX_BRACKETS[index + 1]
    const upper = dec(current.upper).mul(12).toNumber()
    const boundary = round2(
      dec(upper)
        .mul(dec(1).minus(current.rate))
        .plus(current.quickDeduction)
        .minus(next.quickDeduction)
        .div(dec(1).minus(next.rate)),
    )
    if (boundary > upper) {
      ranges.push({ from: upper, to: boundary })
    }
  }
  return ranges
}

/** 判断奖金金额是否落在无效区间内，用于 UI 给出「多发 1 元少拿」提示 */
export function findInvalidRange(bonus: number): InvalidRange | undefined {
  if (bonus <= 0) return undefined
  return bonusInvalidRanges().find((range) => bonus > range.from && bonus < range.to)
}
