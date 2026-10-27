/**
 * @Author: wj
 * @FilePath: src/stores/useSalaryStore.ts
 * @Description: 薪资录入数据管理：收入项、五险一金、专项附加扣除与多方案存档
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createDefaultIncomes } from '@/config/presets'
import { DEDUCTION_CATALOG, DEDUCTION_LIST } from '@/config/specialDeductions'
import { createDefaultStages, createStage } from '@/config/stages'
import { amountOfMonth, OTHER_INCOME_LABELS, stageTypeOfMonth } from '@/core'
import { createId } from '@/utils/id'
import { INSURANCE_TYPES } from '@/types'
import type {
  DeductionKey,
  DeductionState,
  DeductionStateMap,
  IncomeItem,
  IncomeKind,
  InsuranceConfig,
  InsuranceItemConfig,
  InsuranceType,
  MonthOverride,
  StageRange,
  StageType,
} from '@/types'

/** 存档方案：把一次完整录入的入参快照下来，便于多方案对比 */
export interface SalaryScheme {
  id: string
  name: string
  createdAt: number
  year: number
  startMonth: number
  bonusMode: 'separate' | 'merged' | 'auto'
  incomes: IncomeItem[]
  insurance: InsuranceConfig
  deductions: DeductionStateMap
  stages: StageRange[]
  /** 单月数据覆盖；旧存档缺失时视为无覆盖 */
  monthOverrides?: Record<number, MonthOverride>
}

export function createDefaultInsurance(): InsuranceConfig {
  const items = INSURANCE_TYPES.reduce((acc, type) => {
    // 生育保险在多数城市已并入医疗统一征收，默认关闭以避免重复计费
    acc[type] = { enabled: type !== 'maternity' } satisfies InsuranceItemConfig
    return acc
  }, {} as Record<InsuranceType, InsuranceItemConfig>)

  return {
    cityCode: 'beijing',
    baseMode: 'gross',
    manualBase: 15000,
    clampEnabled: true,
    // 公积金基数默认与社保基数一致，用户可切换为独立口径
    housingFundBaseMode: 'same',
    housingFundManualBase: 15000,
    housingFundClampEnabled: true,
    // 大病医疗固定额各地不一，默认不叠加，避免医保个人额与「基数 × 费率」对不上
    medicalFixed: 0,
    items,
  }
}

export function createDefaultDeductions(): DeductionStateMap {
  return DEDUCTION_LIST.reduce((acc, meta) => {
    acc[meta.key as DeductionKey] = {
      enabled: false,
      amount: meta.defaultAmount,
      share: 1,
      month: 12,
    } satisfies DeductionState
    return acc
  }, {} as DeductionStateMap)
}

export const useSalaryStore = defineStore(
  'salary-input',
  () => {
    const incomes = ref<IncomeItem[]>(createDefaultIncomes())
    const insurance = ref<InsuranceConfig>(createDefaultInsurance())
    const deductions = ref<DeductionStateMap>(createDefaultDeductions())
    /** 雇佣阶段划分：实习期/试用期/转正后，决定逐月发放与社保缴纳 */
    const stages = ref<StageRange[]>(createDefaultStages())
    /** 单月数据覆盖，key 为月份；用于表达「某月与规则不同」的实际发放 */
    const monthOverrides = ref<Record<number, MonthOverride>>({})
    const schemes = ref<SalaryScheme[]>([])

    /** 已启用的收入项，表格动态列以此为数据源 */
    const activeIncomes = computed(() => incomes.value.filter((item) => item.enabled))

    /** 年终奖合计，用于计税方式建议 */
    const bonusTotal = computed(() =>
      incomes.value
        .filter((item) => item.enabled && item.kind === 'bonus')
        .reduce((acc, item) => acc + item.amount, 0),
    )

    function addIncome(kind: IncomeKind = 'salary'): IncomeItem {
      const isBonus = kind === 'bonus'
      // 劳务报酬等额外收入多为一事一结，且不计入社保缴费基数
      const isOther = kind === 'labor' || kind === 'authorship' || kind === 'royalty'
      const item: IncomeItem = {
        id: createId('income'),
        name: isBonus ? '年终奖' : isOther ? (OTHER_INCOME_LABELS[kind] ?? '额外收入') : '新增收入项',
        amount: 0,
        cycle: isBonus || isOther ? 'once' : 'monthly',
        month: 1,
        intoInsuranceBase: !isBonus && !isOther,
        taxable: true,
        kind,
        enabled: true,
        staged: false,
        stageAmounts: {},
        stageEnabled: {},
        nonCash: false,
        variableByMonth: false,
      }
      incomes.value.push(item)
      return item
    }

    function removeIncome(id: string) {
      incomes.value = incomes.value.filter((item) => item.id !== id)
    }

    function updateIncome(id: string, payload: Partial<IncomeItem>) {
      const target = incomes.value.find((item) => item.id === id)
      if (!target) return
      Object.assign(target, payload)
    }

    function moveIncome(id: string, offset: number) {
      const index = incomes.value.findIndex((item) => item.id === id)
      const nextIndex = index + offset
      if (index < 0 || nextIndex < 0 || nextIndex >= incomes.value.length) return
      const list = [...incomes.value]
      const [moved] = list.splice(index, 1)
      if (!moved) return
      list.splice(nextIndex, 0, moved)
      incomes.value = list
    }

    /**
     * 让收入项进入按阶段配置模式
     * 用户可能在「雇佣阶段」页签直接改某一阶段的金额，此时无需先回收入项页签开开关
     */
    function ensureStaged(target: IncomeItem) {
      if (target.staged) return
      target.staged = true
      if (Object.keys(target.stageAmounts).length === 0) {
        target.stageAmounts = {
          intern: target.amount,
          probation: target.amount,
          regular: target.amount,
        }
      }
    }

    /**
     * 让收入项进入逐月金额模式
     * 开启时把当前各月解析值（按阶段/通用口径）作为 12 个月的初始值，避免金额突变
     */
    function toggleVariableByMonth(id: string, value: boolean) {
      const target = incomes.value.find((item) => item.id === id)
      if (!target) return
      target.variableByMonth = value
      if (value && !target.monthlyAmounts) {
        target.monthlyAmounts = Array.from({ length: 12 }, (_, index) =>
          amountOfMonth(target, index + 1, stageTypeOfMonth(stages.value, index + 1)),
        )
      }
    }

    /** 设置收入项在指定月份的金额，仅 variableByMonth 开启后生效 */
    function updateMonthlyAmount(id: string, month: number, amount: number) {
      const target = incomes.value.find((item) => item.id === id)
      if (!target) return
      const list = target.monthlyAmounts ? [...target.monthlyAmounts] : Array<number>(12).fill(0)
      list[month - 1] = amount
      target.monthlyAmounts = list
    }

    /**
     * 补齐历史存档缺失的阶段字段
     * 早期版本的收入项没有 staged / stageAmounts / stageEnabled，
     * 直接读取会让内核抛错，故在读取存档与初始化时统一兜底
     */
    function normalizeIncomes(list: IncomeItem[]): IncomeItem[] {
      return list.map((item) => ({
        ...item,
        staged: item.staged ?? false,
        nonCash: item.nonCash ?? false,
        variableByMonth: item.variableByMonth ?? false,
        stageAmounts: item.stageAmounts ?? {},
        stageEnabled: item.stageEnabled ?? {},
      }))
    }

    /** 对当前录入数据做一次字段补全，用于兼容旧版本 localStorage 存档 */
    function normalize() {
      incomes.value = normalizeIncomes(incomes.value)
      if (!Array.isArray(stages.value)) stages.value = createDefaultStages()
      // 单月覆盖为后加能力，缺失时视为无覆盖，计算结果与升级前一致
      if (typeof monthOverrides.value !== 'object' || monthOverrides.value === null) {
        monthOverrides.value = {}
      }
      // 阶段停缴险种为后加能力，缺失时视为不停缴，保证行为不变
      stages.value = stages.value.map((stage) => ({
        ...stage,
        skipInsuranceTypes: stage.skipInsuranceTypes ?? [],
      }))
      // 公积金基数字段为后加能力，旧存档缺失时沿用社保口径，保证行为不变
      insurance.value = {
        ...insurance.value,
        housingFundBaseMode: insurance.value.housingFundBaseMode ?? 'same',
        housingFundManualBase: insurance.value.housingFundManualBase ?? insurance.value.manualBase,
        housingFundClampEnabled:
          insurance.value.housingFundClampEnabled ?? insurance.value.clampEnabled,
        medicalFixed: insurance.value.medicalFixed ?? 0,
      }
    }

    /** 设置某收入项在特定阶段的发放金额 */
    function updateStageAmount(id: string, stage: StageType, amount: number) {
      const target = incomes.value.find((item) => item.id === id)
      if (!target) return
      ensureStaged(target)
      target.stageAmounts = { ...target.stageAmounts, [stage]: amount }
    }

    /** 设置某收入项在特定阶段是否发放，用于表达「转正后才有的福利」 */
    function toggleStageEnabled(id: string, stage: StageType, enabled: boolean) {
      const target = incomes.value.find((item) => item.id === id)
      if (!target) return
      ensureStaged(target)
      target.stageEnabled = { ...target.stageEnabled, [stage]: enabled }
    }

    /** 切换阶段差异化开关；开启时把当前金额作为各阶段的初始默认值 */
    function toggleStagedIncome(id: string, staged: boolean) {
      const target = incomes.value.find((item) => item.id === id)
      if (!target) return
      target.staged = staged
      if (staged) ensureStaged(target)
    }

    function addStage(type: StageType) {
      // 新阶段默认接在现有区间之后，避免与已有区间重叠
      const lastEnd = stages.value.reduce((max, stage) => Math.max(max, stage.toMonth), 0)
      const fromMonth = Math.min(lastEnd + 1, 12)
      stages.value.push(createStage(type, fromMonth))
    }

    function removeStage(id: string) {
      stages.value = stages.value.filter((stage) => stage.id !== id)
    }

    function updateStage(id: string, payload: Partial<StageRange>) {
      const target = stages.value.find((stage) => stage.id === id)
      if (!target) return
      Object.assign(target, payload)
    }

    function updateInsurance(payload: Partial<InsuranceConfig>) {
      Object.assign(insurance.value, payload)
    }

    function updateInsuranceItem(type: InsuranceType, payload: Partial<InsuranceItemConfig>) {
      const current = insurance.value.items[type]
      if (!current) return
      insurance.value.items[type] = { ...current, ...payload }
    }

    function updateDeduction(key: DeductionKey, payload: Partial<DeductionState>) {
      const current = deductions.value[key]
      if (!current) return
      deductions.value[key] = { ...current, ...payload }
    }

    /** 住房贷款利息与住房租金互斥，切换时自动关闭同组其它项 */
    function toggleDeduction(key: DeductionKey, enabled: boolean) {
      updateDeduction(key, { enabled })
      if (!enabled) return
      const group = DEDUCTION_CATALOG[key]?.exclusiveGroup
      if (!group) return
      DEDUCTION_LIST.forEach((meta) => {
        if (meta.key !== key && meta.exclusiveGroup === group) {
          updateDeduction(meta.key, { enabled: false })
        }
      })
    }

    function resetAll() {
      incomes.value = createDefaultIncomes()
      insurance.value = createDefaultInsurance()
      deductions.value = createDefaultDeductions()
      stages.value = createDefaultStages()
      monthOverrides.value = {}
    }

    /** 取某月的覆盖对象，缺失时创建，避免调用方判空 */
    function ensureMonthOverride(month: number): MonthOverride {
      const current = monthOverrides.value[month]
      if (current) return current
      const created: MonthOverride = {}
      monthOverrides.value = { ...monthOverrides.value, [month]: created }
      return created
    }

    /** 覆盖某月某个数据项的金额，传入 undefined 表示恢复按规则计算 */
    function setMonthAmount(month: number, key: string, amount: number | undefined) {
      const override = ensureMonthOverride(month)
      const amounts = { ...(override.amounts ?? {}) }
      if (amount === undefined) delete amounts[key]
      else amounts[key] = amount
      override.amounts = amounts
    }

    function setMonthInsuranceBase(month: number, base: number | undefined) {
      const override = ensureMonthOverride(month)
      override.insuranceBase = base
    }

    function setMonthNote(month: number, note: string) {
      const override = ensureMonthOverride(month)
      override.note = note
    }

    /** 清空某月的所有覆盖，恢复为按规则自动计算 */
    function resetMonth(month: number) {
      if (!monthOverrides.value[month]) return
      const next = { ...monthOverrides.value }
      delete next[month]
      monthOverrides.value = next
    }

    function saveScheme(name: string, meta: { year: number; startMonth: number; bonusMode: 'separate' | 'merged' | 'auto' }) {
      const scheme: SalaryScheme = {
        id: createId('scheme'),
        name,
        createdAt: Date.now(),
        year: meta.year,
        startMonth: meta.startMonth,
        bonusMode: meta.bonusMode,
        incomes: JSON.parse(JSON.stringify(incomes.value)) as IncomeItem[],
        insurance: JSON.parse(JSON.stringify(insurance.value)) as InsuranceConfig,
        deductions: JSON.parse(JSON.stringify(deductions.value)) as DeductionStateMap,
        stages: JSON.parse(JSON.stringify(stages.value)) as StageRange[],
        monthOverrides: JSON.parse(JSON.stringify(monthOverrides.value)) as Record<
          number,
          MonthOverride
        >,
      }
      schemes.value.push(scheme)
      return scheme
    }

    function applyScheme(id: string): { year: number; startMonth: number; bonusMode: 'separate' | 'merged' | 'auto' } | null {
      const scheme = schemes.value.find((item) => item.id === id)
      if (!scheme) return null
      incomes.value = normalizeIncomes(JSON.parse(JSON.stringify(scheme.incomes)) as IncomeItem[])
      insurance.value = JSON.parse(JSON.stringify(scheme.insurance)) as InsuranceConfig
      deductions.value = JSON.parse(JSON.stringify(scheme.deductions)) as DeductionStateMap
      stages.value = JSON.parse(JSON.stringify(scheme.stages ?? createDefaultStages())) as StageRange[]
      monthOverrides.value = (JSON.parse(
        JSON.stringify(scheme.monthOverrides ?? {}),
      ) as Record<number, MonthOverride>) ?? {}
      return { year: scheme.year, startMonth: scheme.startMonth, bonusMode: scheme.bonusMode }
    }

    function removeScheme(id: string) {
      schemes.value = schemes.value.filter((item) => item.id !== id)
    }

    /** 导出为可序列化的纯对象，避免把响应式代理写进 JSON */
    function exportSnapshot() {
      return {
        incomes: JSON.parse(JSON.stringify(incomes.value)) as IncomeItem[],
        insurance: JSON.parse(JSON.stringify(insurance.value)) as InsuranceConfig,
        deductions: JSON.parse(JSON.stringify(deductions.value)) as DeductionStateMap,
        stages: JSON.parse(JSON.stringify(stages.value)) as StageRange[],
        monthOverrides: JSON.parse(JSON.stringify(monthOverrides.value)) as Record<
          number,
          MonthOverride
        >,
      }
    }

    function importSnapshot(payload: {
      incomes?: IncomeItem[]
      insurance?: InsuranceConfig
      deductions?: DeductionStateMap
      stages?: StageRange[]
      monthOverrides?: Record<number, MonthOverride>
    }) {
      if (Array.isArray(payload.incomes)) incomes.value = normalizeIncomes(payload.incomes)
      if (payload.insurance) insurance.value = { ...createDefaultInsurance(), ...payload.insurance }
      if (payload.deductions) {
        deductions.value = { ...createDefaultDeductions(), ...payload.deductions }
      }
      if (Array.isArray(payload.stages)) stages.value = payload.stages
      if (payload.monthOverrides && typeof payload.monthOverrides === 'object') {
        monthOverrides.value = payload.monthOverrides
      }
    }

    return {
      incomes,
      insurance,
      deductions,
      stages,
      monthOverrides,
      schemes,
      activeIncomes,
      bonusTotal,
      addIncome,
      removeIncome,
      updateIncome,
      normalize,
      updateStageAmount,
      toggleStageEnabled,
      toggleStagedIncome,
      toggleVariableByMonth,
      updateMonthlyAmount,
      setMonthAmount,
      setMonthInsuranceBase,
      setMonthNote,
      resetMonth,
      moveIncome,
      addStage,
      removeStage,
      updateStage,
      updateInsurance,
      updateInsuranceItem,
      updateDeduction,
      toggleDeduction,
      resetAll,
      saveScheme,
      applyScheme,
      removeScheme,
      exportSnapshot,
      importSnapshot,
    }
  },
  { persist: { key: 'salary-calc:input' } },
)
