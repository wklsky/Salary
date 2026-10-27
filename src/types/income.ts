/**
 * @Author: wj
 * @FilePath: src/types/income.ts
 * @Description: 收入项（薪酬组成）的类型定义，支持用户自由增删与计税/计基开关
 */
import type { StageType } from './stage'

/** 收入发放节奏：逐月固定 / 指定月份一次性发放 */
export type IncomeCycle = 'monthly' | 'once'

/**
 * 收入类别（对应综合所得的四个税目）：
 * - salary 工资薪金：累计预扣预缴
 * - bonus 全年一次性奖金：可在单独计税与并入综合所得之间切换
 * - labor 劳务报酬：按次减除费用后适用 20%/30%/40% 预扣率
 * - authorship 稿酬：按次减除费用后减征 30%，预扣率 20%
 * - royalty 特许权使用费：按次减除费用后预扣率 20%
 */
export type IncomeKind = 'salary' | 'bonus' | 'labor' | 'authorship' | 'royalty'

export interface IncomeItem {
  /** 唯一标识，同时作为动态表格列的 key */
  id: string
  name: string
  /** monthly 为每月金额，once 为一次性总额，单位：元 */
  amount: number
  cycle: IncomeCycle
  /** cycle 为 once 时的发放月份，取值 1-12 */
  month: number
  /** 是否计入社保/公积金缴费基数；部分地区补贴不计入，需支持单独开关 */
  intoInsuranceBase: boolean
  /** 是否并入综合所得计税；免税补贴、实报实销项需关闭 */
  taxable: boolean
  kind: IncomeKind
  enabled: boolean
  /** 是否按雇佣阶段差异化发放；实习期/试用期工资常低于转正后 */
  staged: boolean
  /** 各阶段发放金额，仅 staged 为 true 时生效，缺省阶段回落到 amount */
  stageAmounts: Partial<Record<StageType, number>>
  /** 各阶段是否发放；福利项常只在转正后才有，缺省视为发放 */
  stageEnabled: Partial<Record<StageType, boolean>>
  /**
   * 非现金福利：计入应发与应纳税所得额，但不计入到手
   * 如仅限食堂消费的餐补饭票、购物卡、宿舍等，员工拿不到现金却要为此纳税
   */
  nonCash: boolean
  /** 每月金额是否不同；开启后按 monthlyAmounts 逐月取值，如按出勤浮动的餐补 */
  variableByMonth: boolean
  /** 逐月金额表，长度 12，下标 0-11 对应 1-12 月；缺省月份回落到阶段/通用金额 */
  monthlyAmounts?: number[]
}
