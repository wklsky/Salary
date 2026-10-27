/**
 * @Author: wj
 * @FilePath: src/config/policy.ts
 * @Description: 全局政策常量集中管理，所有数值变更只改此文件，禁止散落到计算逻辑
 */

/** 政策版本，用于 UI 展示与结果可信度说明 */
export const POLICY_VERSION = '2026.01'

/** 政策配置生效日期 */
export const POLICY_EFFECTIVE_DATE = '2025-01-01'

/** 综合所得基本减除费用：元/月 */
export const BASIC_DEDUCTION_MONTHLY = 5000

/** 全年一次性奖金单独计税政策有效期截止日，过期后 UI 需提示 */
export const BONUS_SEPARATE_VALID_UNTIL = '2027-12-31'

/** 住房公积金常见的可选比例档位（%） */
export const HOUSING_FUND_RATE_OPTIONS = [5, 6, 7, 8, 10, 12]

/**
 * 劳务报酬、稿酬、特许权使用费按次减除费用
 * 每次收入不超过 4000 元的减除 800 元，超过 4000 元的减除 20%
 */
export const OTHER_INCOME_EXPENSE_THRESHOLD = 4000
export const OTHER_INCOME_FLAT_EXPENSE = 800
export const OTHER_INCOME_EXPENSE_RATE = 0.2

/** 稿酬所得减征 30%，即按减除费用后余额的 70% 计入收入额 */
export const AUTHORSHIP_INCOME_RATIO = 0.7

/** 政策免责声明：社保基数与比例随城市、年度调整，计算结果仅供参考 */
export const POLICY_DISCLAIMER =
  '各地社保/公积金比例与基数上下限每年调整，本工具内置数据为参考值，请按当地社保局最新公布口径核对后再用于决策。'
