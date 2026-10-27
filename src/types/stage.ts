/**
 * @Author: wj
 * @FilePath: src/types/stage.ts
 * @Description: 雇佣阶段（实习期/试用期/转正后）的类型定义
 */

/**
 * 雇佣阶段：
 * - intern 实习期：未正式建立劳动关系，通常按劳务口径发放且不缴纳五险一金
 * - probation 试用期：已建立劳动关系，工资可能打折缴纳
 * - regular 转正后：标准发放口径
 */
export type StageType = 'intern' | 'probation' | 'regular'

export const STAGE_TYPES: StageType[] = ['intern', 'probation', 'regular']

/** 阶段区间：用起止月份描述该阶段在当年覆盖的月份 */
export interface StageRange {
  id: string
  type: StageType
  /** 起始月份，取值 1-12 */
  fromMonth: number
  /** 结束月份，取值 1-12，需不小于起始月份 */
  toMonth: number
  /** 该阶段是否不缴纳五险一金；实习期默认开启 */
  skipInsurance: boolean
}
