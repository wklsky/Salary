/**
 * @Author: wj
 * @FilePath: src/config/taxBrackets.ts
 * @Description: 个人所得税税率表配置（综合所得年度税率表与按月换算税率表）
 */
import type { TaxBracket } from '@/types'

/**
 * 综合所得年度税率表：居民个人工资薪金所得适用，按纳税年度合并计税
 * 上限为 Infinity 表示最高级距
 */
export const ANNUAL_TAX_BRACKETS: TaxBracket[] = [
  { level: 1, lower: 0, upper: 36000, rate: 0.03, quickDeduction: 0 },
  { level: 2, lower: 36000, upper: 144000, rate: 0.1, quickDeduction: 2520 },
  { level: 3, lower: 144000, upper: 300000, rate: 0.2, quickDeduction: 16920 },
  { level: 4, lower: 300000, upper: 420000, rate: 0.25, quickDeduction: 31920 },
  { level: 5, lower: 420000, upper: 660000, rate: 0.3, quickDeduction: 52920 },
  { level: 6, lower: 660000, upper: 960000, rate: 0.35, quickDeduction: 85920 },
  { level: 7, lower: 960000, upper: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 181920 },
]

/**
 * 劳务报酬预扣预缴税率表
 * 按「每次收入减除费用后的余额」适用三级超额累进，与年度综合所得税率表不同
 */
export const LABOR_PREPAY_BRACKETS: TaxBracket[] = [
  { level: 1, lower: 0, upper: 20000, rate: 0.2, quickDeduction: 0 },
  { level: 2, lower: 20000, upper: 50000, rate: 0.3, quickDeduction: 2000 },
  { level: 3, lower: 50000, upper: Number.POSITIVE_INFINITY, rate: 0.4, quickDeduction: 7000 },
]

/**
 * 按月换算后的综合所得税率表：全年一次性奖金单独计税时使用
 * 本质是把年度级距除以 12，但速算扣除数不能简单除以 12，故独立配置
 */
export const MONTHLY_TAX_BRACKETS: TaxBracket[] = [
  { level: 1, lower: 0, upper: 3000, rate: 0.03, quickDeduction: 0 },
  { level: 2, lower: 3000, upper: 12000, rate: 0.1, quickDeduction: 210 },
  { level: 3, lower: 12000, upper: 25000, rate: 0.2, quickDeduction: 1410 },
  { level: 4, lower: 25000, upper: 35000, rate: 0.25, quickDeduction: 2660 },
  { level: 5, lower: 35000, upper: 55000, rate: 0.3, quickDeduction: 4410 },
  { level: 6, lower: 55000, upper: 80000, rate: 0.35, quickDeduction: 7160 },
  { level: 7, lower: 80000, upper: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 15160 },
]
