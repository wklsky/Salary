/**
 * @Author: wj
 * @FilePath: src/utils/format.ts
 * @Description: 金额、百分比、月份等展示格式化工具
 */

/** 千分位金额，保留两位小数 */
export function formatMoney(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 不带小数的金额，用于卡片等强调场景 */
export function formatMoneyRounded(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return Math.round(value).toLocaleString('zh-CN')
}

/** ratio 为 0-1 的小数 */
export function formatPercent(ratio: number | undefined | null, digits = 1): string {
  if (ratio === undefined || ratio === null || Number.isNaN(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

export function formatMonth(month: number): string {
  return `${month} 月`
}
