/**
 * @Author: wj
 * @FilePath: src/composables/useTableEditing.ts
 * @Description: 月度明细表的单元格编辑与反推计算：金额、个税、社保、绩效分数双向联动
 */
import { ElMessage } from 'element-plus'
import {
  amountOfMonth,
  calculateSalary,
  round2,
  stageTypeOfMonth,
} from '@/core'
import { INSURANCE_COLUMN_PREFIX, POST_TAX_COLUMN_PREFIX, SCORE_COLUMN_PREFIX } from '@/config/columns'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import { formatMoney } from '@/utils/format'
import type { IncomeItem, InsuranceType, MonthOverride, SalaryInput } from '@/types'

/** 反推目标：应发合计 / 现金应发 / 实发工资 / 个税 */
export type ReverseMetric = 'gross' | 'cashGross' | 'net' | 'tax'

/** 单元格编辑类型，决定回填到哪个数据源 */
export type EditableKind =
  | 'income'
  | 'score'
  | 'postTax'
  | 'gross'
  | 'cashGross'
  | 'net'
  | 'tax'
  | 'insuranceBase'
  | 'insuranceTotal'
  | 'insuranceType'
  | 'note'

const METRIC_LABELS: Record<ReverseMetric, string> = {
  gross: '应发合计',
  cashGross: '应发工资',
  net: '实发工资',
  tax: '个税',
}

/** 按列 key 判断是否可编辑；合计行与只读列返回 null */
export function editableKindOf(key: string): EditableKind | null {
  if (key.startsWith(SCORE_COLUMN_PREFIX)) return 'score'
  if (key.startsWith(POST_TAX_COLUMN_PREFIX)) return 'postTax'
  if (key.startsWith(INSURANCE_COLUMN_PREFIX)) return 'insuranceType'
  if (key === 'cashGross') return 'cashGross'
  if (key === 'gross') return 'gross'
  if (key === 'net') return 'net'
  if (key === 'taxTotal') return 'tax'
  if (key === 'insuranceBase') return 'insuranceBase'
  if (key === 'insurancePersonal') return 'insuranceTotal'
  if (key === 'note') return 'note'
  return null
}

/** 从列 key 中解析收入项 / 扣款项 / 险种 id */
export function itemIdOf(key: string, kind: EditableKind): string {
  if (kind === 'score') return key.slice(SCORE_COLUMN_PREFIX.length)
  if (kind === 'postTax') return key.slice(POST_TAX_COLUMN_PREFIX.length)
  if (kind === 'insuranceType') return key.slice(INSURANCE_COLUMN_PREFIX.length)
  return key
}

function cloneOverrides(source: Record<number, MonthOverride>): Record<number, MonthOverride> {
  return JSON.parse(JSON.stringify(source)) as Record<number, MonthOverride>
}

export function useTableEditing() {
  const salaryStore = useSalaryStore()
  const settingsStore = useSettingsStore()
  const schemaStore = useTableSchemaStore()
  const { result } = useSalaryCalculator()

  function buildInput(monthOverrides: Record<number, MonthOverride>): SalaryInput {
    return {
      year: settingsStore.year,
      startMonth: settingsStore.startMonth,
      endMonth: settingsStore.endMonth,
      incomes: salaryStore.incomes,
      insurance: salaryStore.insurance,
      deductions: salaryStore.deductions,
      bonusMode: settingsStore.bonusMode,
      stages: salaryStore.stages,
      taxpayerType: settingsStore.taxpayerType,
      taxReductionMonthly: settingsStore.taxReductionMonthly,
      monthOverrides,
      customColumns: schemaStore.customColumnItems,
      postTaxDeductions: salaryStore.postTaxDeductions,
      customCities: settingsStore.customCities,
      payTiming: settingsStore.payTiming,
    }
  }

  function calculateWith(monthOverrides: Record<number, MonthOverride>) {
    return calculateSalary(buildInput(monthOverrides))
  }

  /** 从计算结果中读取目标指标 */
  function metricOf(
    calc: ReturnType<typeof calculateSalary>,
    month: number,
    metric: ReverseMetric,
  ): number {
    const row = calc.monthly[month - 1]
    if (!row) return 0
    switch (metric) {
      case 'gross':
        return row.gross
      case 'cashGross':
        return round2(row.gross - row.nonCashIncome)
      case 'net':
        return row.net
      case 'tax':
        return row.taxTotal
    }
  }

  /**
   * 反推调整项：优先使用设置里指定的项，否则取第一个满足条件的逐月计税工资项
   * 计分制项与非现金项不作为调整项，避免金额与分数 / 到手口径脱节
   */
  function findAdjustIncome(): IncomeItem | undefined {
    const eligible = salaryStore.incomes.filter(
      (item) =>
        item.enabled &&
        item.cycle === 'monthly' &&
        item.kind === 'salary' &&
        item.taxable &&
        !item.nonCash &&
        !item.scoreBased,
    )
    return (
      eligible.find((item) => item.id === settingsStore.reverseAdjustIncomeId) ?? eligible[0]
    )
  }

  function commitIncomeAmount(item: IncomeItem, month: number, amount: number) {
    const auto = amountOfMonth(item, month, stageTypeOfMonth(salaryStore.stages, month))
    if (Math.abs(amount - auto) < 0.005) {
      salaryStore.setMonthAmount(month, item.id, undefined)
    } else {
      salaryStore.setMonthAmount(month, item.id, round2(amount))
    }
  }

  /**
   * 二分反推：通过调整工资项，使目标指标尽量等于 target
   * 所有指标对收入均单调不减，故可用二分搜索；结果受税率表与取整影响时给出提示
   */
  function reverseIncome(month: number, metric: ReverseMetric, target: number): boolean {
    if (!Number.isFinite(target) || target < 0) {
      ElMessage.warning('请输入不小于 0 的目标金额')
      return false
    }
    const item = findAdjustIncome()
    if (!item) {
      ElMessage.warning('没有可用于反推的工资项，请先添加一个逐月发放、计税且非现金的工资项')
      return false
    }

    const overrides = cloneOverrides(salaryStore.monthOverrides)
    const trial = (amount: number): number => {
      const current = { ...(overrides[month] ?? {}) }
      current.amounts = { ...(current.amounts ?? {}), [item.id]: amount }
      overrides[month] = current
      return metricOf(calculateWith(overrides), month, metric)
    }

    const lowerMetric = trial(0)
    let upper = Math.max(item.amount || 0, 10000, target * 2)
    let upperMetric = trial(upper)
    let guard = 0
    while (upperMetric < target && guard < 24) {
      upper *= 2
      upperMetric = trial(upper)
      guard += 1
    }

    if (upperMetric < target) {
      ElMessage.warning(`目标超出可反推范围，请检查目标${METRIC_LABELS[metric]}是否过大`)
      return false
    }

    // 目标低于零收入时的指标（如已扣款大于收入），只能收敛到 0 并提示
    if (lowerMetric > target + 0.005) {
      commitIncomeAmount(item, month, 0)
      ElMessage.warning(
        `目标低于最低可达到值，已将「${item.name}」调整为 0，当前${METRIC_LABELS[metric]}为 ¥${formatMoney(metricOf(result.value, month, metric))}`,
      )
      return true
    }

    let amount = 0
    // 目标正好等于最低可达到值时无需搜索，直接取 0
    if (Math.abs(lowerMetric - target) > 0.005) {
      let low = 0
      let high = upper
      // 26 次二分已可将区间收敛到分以下，同时避免年终奖拆分搜索下反复重算造成卡顿
      for (let index = 0; index < 26 && high - low > 0.005; index += 1) {
        const mid = (low + high) / 2
        if (trial(mid) < target) low = mid
        else high = mid
      }

      // 二分落在最小可行值上，再在附近取与目标最接近的方案，抵消税率与取整误差
      const candidates = [
        high,
        high - 0.01,
        high + 0.01,
        high - 0.1,
        high + 0.1,
        high - 1,
        high + 1,
      ].filter((value) => value >= 0)
      let bestAmount = high
      let bestDiff = Number.POSITIVE_INFINITY
      candidates.forEach((candidate) => {
        const diff = Math.abs(trial(candidate) - target)
        if (diff < bestDiff) {
          bestDiff = diff
          bestAmount = candidate
        }
      })
      amount = bestAmount
    }

    commitIncomeAmount(item, month, amount)
    const actual = metricOf(result.value, month, metric)
    if (Math.abs(actual - target) > 0.05) {
      ElMessage.warning(
        `受税率与取整影响，当前${METRIC_LABELS[metric]}为 ¥${formatMoney(actual)}，与目标相差 ¥${formatMoney(Math.abs(actual - target))}`,
      )
    } else {
      ElMessage.success(
        `已反推「${item.name}」：本月${METRIC_LABELS[metric]} ¥${formatMoney(actual)}`,
      )
    }
    return true
  }

  /** 反推社保 / 公积金缴费基数，使指定险种或缴纳合计等于目标 */
  function reverseInsurance(
    month: number,
    kind: 'total' | InsuranceType,
    target: number,
  ): boolean {
    if (!Number.isFinite(target) || target < 0) {
      ElMessage.warning('请输入不小于 0 的目标金额')
      return false
    }
    const useHousingFund = kind === 'housingFund'
    const overrides = cloneOverrides(salaryStore.monthOverrides)

    const trial = (base: number): number => {
      const current = { ...(overrides[month] ?? {}) }
      if (useHousingFund) current.housingFundBase = base
      else current.insuranceBase = base
      overrides[month] = current
      const detail = calculateWith(overrides).insuranceMonthly[month - 1]
      if (!detail) return 0
      return kind === 'total' ? detail.personalTotal : (detail.personal[kind] ?? 0)
    }

    const lowerMetric = trial(0)
    let upper = Math.max(10000, target * 20)
    let upperMetric = trial(upper)
    let guard = 0
    while (upperMetric < target && guard < 24) {
      upper *= 2
      upperMetric = trial(upper)
      guard += 1
    }
    if (upperMetric < target) {
      ElMessage.warning('目标超出可反推范围，请检查目标缴纳额是否过大')
      return false
    }
    if (lowerMetric > target + 0.005) {
      ElMessage.warning('该月没有可调整的缴纳额（可能停缴或已停用该险种）')
      return false
    }

    let base = 0
    if (Math.abs(lowerMetric - target) > 0.005) {
      let low = 0
      let high = upper
      for (let index = 0; index < 36 && high - low > 0.004; index += 1) {
        const mid = (low + high) / 2
        if (trial(mid) < target) low = mid
        else high = mid
      }

      // 基数微调可能让四舍五入后的缴纳额命中目标，取最接近的候选
      const candidates = [high, high - 1, high + 1, high - 0.1, high + 0.1, high - 0.01, high + 0.01]
        .filter((value) => value >= 0)
        .map((value) => round2(value))
      let bestBase = round2(high)
      let bestDiff = Number.POSITIVE_INFINITY
      candidates.forEach((candidate) => {
        const diff = Math.abs(trial(candidate) - target)
        if (diff < bestDiff) {
          bestDiff = diff
          bestBase = candidate
        }
      })
      base = bestBase
    }
    if (useHousingFund) salaryStore.setMonthHousingFundBase(month, base)
    else salaryStore.setMonthInsuranceBase(month, base)

    const detail = result.value.insuranceMonthly[month - 1]
    const actual = !detail
      ? 0
      : kind === 'total'
        ? detail.personalTotal
        : (detail.personal[kind] ?? 0)
    if (Math.abs(actual - target) > 0.05) {
      ElMessage.warning(
        `受取整与基数上下限影响，当前缴纳额为 ¥${formatMoney(actual)}，已按基数 ¥${formatMoney(base)} 核定`,
      )
    } else {
      ElMessage.success(
        `已反推缴费基数 ¥${formatMoney(base)}，当前缴纳额 ¥${formatMoney(actual)}`,
      )
    }
    return true
  }

  /** 写入收入项金额；计分制项改为反算分数 */
  function setIncomeAmount(month: number, itemId: string, amount: number): boolean {
    const item = salaryStore.incomes.find((entry) => entry.id === itemId)
    if (!item) return false
    if (!Number.isFinite(amount) || amount < 0) {
      ElMessage.warning('请输入不小于 0 的金额')
      return false
    }
    if (item.scoreBased) {
      const rate = item.perPointAmount ?? 0
      if (rate <= 0) {
        ElMessage.warning('请先在「录入设置 → 收入项」中设置每分金额')
        return false
      }
      salaryStore.updateMonthlyScore(item.id, month, round2(amount / rate))
      return true
    }
    commitIncomeAmount(item, month, amount)
    return true
  }

  function setIncomeScore(month: number, itemId: string, score: number): boolean {
    if (!Number.isFinite(score) || score < 0) {
      ElMessage.warning('请输入不小于 0 的分数')
      return false
    }
    salaryStore.updateMonthlyScore(itemId, month, score)
    return true
  }

  function setPostTaxAmount(month: number, itemId: string, amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) {
      ElMessage.warning('请输入不小于 0 的金额')
      return false
    }
    salaryStore.setPostTaxMonthlyAmount(itemId, month, amount)
    return true
  }

  /** 反推列的当前值，用于判断输入是否与现状一致，避免无意义的覆盖 */
  function currentMetricOf(month: number, key: string, kind: EditableKind): number | undefined {
    if (kind === 'gross' || kind === 'cashGross' || kind === 'net' || kind === 'tax') {
      return metricOf(result.value, month, kind)
    }
    if (kind === 'insuranceTotal') {
      return result.value.insuranceMonthly[month - 1]?.personalTotal ?? 0
    }
    if (kind === 'insuranceType') {
      const detail = result.value.insuranceMonthly[month - 1]
      if (!detail) return 0
      const type = itemIdOf(key, kind) as InsuranceType
      return detail.personal[type] ?? 0
    }
    return undefined
  }

  /** 按单元格类型分发写入 */
  function applyCellValue(
    month: number,
    key: string,
    kind: EditableKind,
    value: number | string,
  ): boolean {
    if (kind === 'note') {
      salaryStore.setMonthNote(month, String(value ?? ''))
      return true
    }

    const amount = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(amount)) {
      ElMessage.warning('请输入有效数值')
      return false
    }

    // 输入值与当前计算结果一致时不反推，避免「输入 0 个税却把工资清零」这类副作用
    const current = currentMetricOf(month, key, kind)
    if (current !== undefined && Math.abs(current - amount) <= 0.005) {
      return true
    }

    switch (kind) {
      case 'income':
        return setIncomeAmount(month, key, amount)
      case 'score':
        return setIncomeScore(month, itemIdOf(key, kind), amount)
      case 'postTax':
        return setPostTaxAmount(month, itemIdOf(key, kind), amount)
      case 'gross':
      case 'cashGross':
      case 'net':
      case 'tax':
        return reverseIncome(month, kind, amount)
      case 'insuranceBase': {
        salaryStore.setMonthInsuranceBase(month, amount)
        return true
      }
      case 'insuranceTotal':
        return reverseInsurance(month, 'total', amount)
      case 'insuranceType':
        return reverseInsurance(month, itemIdOf(key, kind) as InsuranceType, amount)
    }
  }

  return { applyCellValue, editableKindOf, findAdjustIncome }
}
