/**
 * @Author: wj
 * @FilePath: src/types/income.ts
 * @Description: 收入项（薪酬组成）的类型定义，支持用户自由增删与计税/计基开关
 */
import type { StageType } from './stage'

/** 收入发放节奏：逐月固定 / 指定月份一次性发放 */
export type IncomeCycle = 'monthly' | 'once'

/**
 * 收入类别：
 * - salary 走工资薪金「累计预扣预缴」逻辑
 * - bonus 走全年一次性奖金逻辑，可在单独计税与并入综合所得之间切换
 */
export type IncomeKind = 'salary' | 'bonus'

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
}
