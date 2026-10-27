/**
 * @Author: wj
 * @FilePath: src/core/stage.ts
 * @Description: 雇佣阶段解析：按月份定位阶段，并解析收入项在该阶段的发放金额
 */
import { FALLBACK_STAGE } from '@/config/stages'
import { INSURANCE_TYPES } from '@/types'
import type { IncomeItem, InsuranceType, StageRange, StageType } from '@/types'

/** 定位某月所属阶段，未命中任何区间时返回 null */
export function resolveStageOfMonth(stages: StageRange[], month: number): StageRange | null {
  return stages.find((stage) => month >= stage.fromMonth && month <= stage.toMonth) ?? null
}

/** 某月所属阶段类型，未配置阶段时按转正后处理 */
export function stageTypeOfMonth(stages: StageRange[], month: number): StageType {
  return resolveStageOfMonth(stages, month)?.type ?? FALLBACK_STAGE
}

/** 该月是否需要缴纳五险一金；实习期等阶段可单独关闭 */
export function isInsuranceSkipped(stages: StageRange[], month: number): boolean {
  return resolveStageOfMonth(stages, month)?.skipInsurance ?? false
}

/**
 * 该月停缴的险种
 * skipInsurance 视为全部险种停缴（实习期）；
 * 否则取阶段上单独停缴的险种，用于表达「试用期只缴五险，转正后才缴公积金」
 */
export function skippedInsuranceTypesOfMonth(
  stages: StageRange[],
  month: number,
): InsuranceType[] {
  const stage = resolveStageOfMonth(stages, month)
  if (!stage) return []
  if (stage.skipInsurance) return [...INSURANCE_TYPES]
  return stage.skipInsuranceTypes ?? []
}

/**
 * 收入项在指定阶段是否发放；未逐阶段配置时视为发放
 * 历史存档可能没有 stageEnabled 字段，故统一走可选链避免脏数据中断计算
 */
export function isItemEnabledInStage(item: IncomeItem, stage: StageType): boolean {
  return item.stageEnabled?.[stage] !== false
}

/**
 * 收入项在指定月份的发放金额
 *
 * 优先级：阶段停发 > 逐月金额 > 阶段金额 > 通用金额
 * 「该阶段不发放」是明确意愿，优先于逐月金额；
 * 逐月金额比阶段金额更精确，同时开启时以逐月金额为准
 */
export function amountOfMonth(item: IncomeItem, month: number, stage: StageType): number {
  if (!isItemEnabledInStage(item, stage)) return 0
  if (item.variableByMonth) {
    const value = item.monthlyAmounts?.[month - 1]
    if (typeof value === 'number') return value
  }
  return amountOfStage(item, stage)
}

/**
 * 收入项在指定阶段的发放金额
 * 该阶段停发时为 0；未开启阶段差异化或该阶段未单独设置金额时，统一回落到 amount
 */
export function amountOfStage(item: IncomeItem, stage: StageType): number {
  if (!isItemEnabledInStage(item, stage)) return 0
  if (!item.staged) return item.amount
  const value = item.stageAmounts?.[stage]
  return typeof value === 'number' ? value : item.amount
}
