/**
 * @Author: wj
 * @FilePath: src/config/stages.ts
 * @Description: 雇佣阶段（实习期/试用期/转正后）的文案、默认值与区间校验
 */
import { createId } from '@/utils/id'
import type { StageRange, StageType } from '@/types'

export const STAGE_LABELS: Record<StageType, string> = {
  intern: '实习期',
  probation: '试用期',
  regular: '转正后',
}

export const STAGE_HINTS: Record<StageType, string> = {
  intern: '未正式建立劳动关系，通常按劳务/实习津贴发放，多数单位不缴纳五险一金',
  probation: '已建立劳动关系，试用期工资不得低于转正工资的 80%；部分单位试用期只缴五险',
  regular: '转正后的标准发放口径',
}

/** 未被任何阶段区间覆盖的月份按此阶段兜底 */
export const FALLBACK_STAGE: StageType = 'regular'

export const MIN_MONTH = 1
export const MAX_MONTH = 12

/** 默认阶段：实习 2 个月、试用 3 个月后转正，用户可按需调整区间 */
export function createDefaultStages(): StageRange[] {
  return [
    { id: createId('stage'), type: 'intern', fromMonth: 1, toMonth: 2, skipInsurance: true },
    {
      id: createId('stage'),
      type: 'probation',
      fromMonth: 3,
      toMonth: 5,
      skipInsurance: false,
      // 试用期只缴五险、转正后才缴公积金，是常见的实际做法
      skipInsuranceTypes: ['housingFund'],
    },
    { id: createId('stage'), type: 'regular', fromMonth: 6, toMonth: MAX_MONTH, skipInsurance: false },
  ]
}

/** 追加一个默认落到年末的新阶段，避免与已有区间重叠 */
export function createStage(type: StageType, fromMonth: number): StageRange {
  return {
    id: createId('stage'),
    type,
    fromMonth,
    toMonth: MAX_MONTH,
    // 实习期默认不缴纳五险一金，其余阶段默认缴纳
    skipInsurance: type === 'intern',
    skipInsuranceTypes: [],
  }
}

export interface StageIssue {
  level: 'error' | 'warning'
  message: string
  /** 关联阶段，用于界面定位高亮 */
  stageId?: string
}

/**
 * 校验阶段区间
 * 区间重叠会导致月份归属歧义，按错误处理；未覆盖月份会走兜底阶段，按警告提示
 */
export function validateStages(stages: StageRange[]): StageIssue[] {
  const issues: StageIssue[] = []
  const covered = new Set<number>()

  stages.forEach((stage) => {
    if (stage.fromMonth < MIN_MONTH || stage.toMonth > MAX_MONTH) {
      issues.push({ level: 'error', stageId: stage.id, message: '月份需在 1-12 之间' })
      return
    }
    if (stage.fromMonth > stage.toMonth) {
      issues.push({ level: 'error', stageId: stage.id, message: '起始月份不能晚于结束月份' })
      return
    }
    for (let month = stage.fromMonth; month <= stage.toMonth; month += 1) {
      if (covered.has(month)) {
        issues.push({
          level: 'error',
          stageId: stage.id,
          message: `第 ${month} 月被多个阶段重复覆盖，请调整区间`,
        })
        break
      }
      covered.add(month)
    }
  })

  const uncovered: number[] = []
  for (let month = MIN_MONTH; month <= MAX_MONTH; month += 1) {
    if (!covered.has(month)) uncovered.push(month)
  }
  if (uncovered.length > 0) {
    issues.push({
      level: 'warning',
      message: `第 ${uncovered.join('、')} 月未覆盖阶段，将按「${STAGE_LABELS[FALLBACK_STAGE]}」口径计算`,
    })
  }

  return issues
}
