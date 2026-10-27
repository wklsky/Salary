/**
 * @Author: wj
 * @FilePath: src/core/money.ts
 * @Description: 金额精度工具，全链路基于 decimal.js 避免浮点误差
 */
import Decimal from 'decimal.js'

// 薪资计算涉及的位阶不大，但税率相乘会产生多位小数，精度给足并统一四舍五入
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

/** 空值安全构造 Decimal，避免 undefined 参与运算导致 NaN */
export function dec(value: Decimal.Value | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0)
  return new Decimal(value)
}

/** 四舍五入到分，返回 number 便于展示与序列化 */
export function round2(value: Decimal.Value | null | undefined): number {
  return dec(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
}

/** 四舍五入到元；公积金按各地公积金中心惯例以整元扣缴 */
export function round0(value: Decimal.Value | null | undefined): number {
  return dec(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

/** 逐项累加后再统一取整，避免多笔金额各自取整带来的累计偏差 */
export function sumMoney(values: Array<number | null | undefined>): number {
  return round2(values.reduce<Decimal>((acc, cur) => acc.plus(dec(cur)), new Decimal(0)))
}

/** 除法安全封装：分母为 0 时返回 0，避免页面上出现 NaN / Infinity */
export function safeDivide(
  numerator: Decimal.Value | null | undefined,
  denominator: Decimal.Value | null | undefined,
): number {
  const denominatorDecimal = dec(denominator)
  if (denominatorDecimal.isZero()) return 0
  return round2(dec(numerator).div(denominatorDecimal))
}

/** 区间收敛，用于社保缴费基数上下限封顶托底 */
export function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** 负数截断为 0：应纳税所得额不允许为负 */
export function nonNegative(value: number): number {
  return value > 0 ? value : 0
}
