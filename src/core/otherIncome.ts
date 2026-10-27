/**
 * @Author: wj
 * @FilePath: src/core/otherIncome.ts
 * @Description: 劳务报酬、稿酬、特许权使用费的预扣预缴与年度汇算收入额
 */
import {
  AUTHORSHIP_INCOME_RATIO,
  OTHER_INCOME_EXPENSE_RATE,
  OTHER_INCOME_EXPENSE_THRESHOLD,
  OTHER_INCOME_FLAT_EXPENSE,
} from '@/config/policy'
import { LABOR_PREPAY_BRACKETS } from '@/config/taxBrackets'
import type { IncomeKind } from '@/types'
import { taxByBrackets } from './bonus'
import { dec, round2 } from './money'

/** 额外收入的三个税目，与工资薪金、全年一次性奖金并列 */
export const OTHER_INCOME_KINDS: IncomeKind[] = ['labor', 'authorship', 'royalty']

export function isOtherIncomeKind(kind: IncomeKind): boolean {
  return OTHER_INCOME_KINDS.includes(kind)
}

/**
 * 按次减除费用
 * 每次收入不超过 4000 元减除 800 元，超过 4000 元减除 20%
 */
export function otherIncomeExpense(income: number): number {
  if (income <= 0) return 0
  if (income <= OTHER_INCOME_EXPENSE_THRESHOLD) return OTHER_INCOME_FLAT_EXPENSE
  return round2(dec(income).mul(OTHER_INCOME_EXPENSE_RATE))
}

/** 预扣预缴应纳税所得额：收入减除费用后的余额 */
export function otherIncomeTaxable(income: number): number {
  return Math.max(0, round2(dec(income).minus(otherIncomeExpense(income))))
}

/**
 * 年度汇算口径的收入额
 * 劳务报酬、特许权使用费按减除费用后余额全额计入；稿酬再减征 30%
 */
export function otherIncomeAmount(kind: IncomeKind, income: number): number {
  const taxable = otherIncomeTaxable(income)
  if (taxable <= 0) return 0
  if (kind === 'authorship') {
    return round2(dec(taxable).mul(AUTHORSHIP_INCOME_RATIO))
  }
  return taxable
}

/**
 * 按次预扣预缴税额
 * 劳务报酬适用 20%/30%/40% 三级累进；稿酬、特许权使用费适用 20% 比例税率
 */
export function otherIncomeTax(kind: IncomeKind, income: number): number {
  const taxable = otherIncomeTaxable(income)
  if (taxable <= 0) return 0
  if (kind === 'labor') return taxByBrackets(LABOR_PREPAY_BRACKETS, taxable)
  if (kind === 'authorship') {
    return round2(dec(otherIncomeAmount(kind, income)).mul(0.2))
  }
  return round2(dec(taxable).mul(0.2))
}

/** 税目文案，用于界面提示计税规则 */
export const OTHER_INCOME_LABELS: Partial<Record<IncomeKind, string>> = {
  labor: '劳务报酬',
  authorship: '稿酬',
  royalty: '特许权使用费',
}

/** 税目计税规则说明 */
export const OTHER_INCOME_HINTS: Partial<Record<IncomeKind, string>> = {
  labor: '按次减费用后适用 20%/30%/40% 预扣率，汇算时并入综合所得',
  authorship: '按次减费用后减征 30%，预扣率 20%，汇算时并入综合所得',
  royalty: '按次减费用后按 20% 预扣，汇算时并入综合所得',
}
