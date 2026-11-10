/**
 * @Author: wj
 * @FilePath: src/composables/useHistory.ts
 * @Description: 录入与设置的撤销/重做，按 300ms 合并连续输入
 */
import { ref, watch } from 'vue'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type {
  BonusMode,
  CityPolicy,
  DeductionStateMap,
  IncomeItem,
  InsuranceConfig,
  MonthOverride,
  PayTiming,
  PostTaxDeductionItem,
  StageRange,
  TaxpayerType,
} from '@/types'

/** 最多保留 30 步，超出后丢弃最早的快照 */
const MAX_STEPS = 30
/** 连续输入合并为一步，避免每个字符都进历史 */
const MERGE_WINDOW = 300

/** 参与撤销的完整录入快照 */
interface SnapshotData {
  incomes: IncomeItem[]
  insurance: InsuranceConfig
  deductions: DeductionStateMap
  stages: StageRange[]
  monthOverrides: Record<number, MonthOverride>
  postTaxDeductions: PostTaxDeductionItem[]
  year: number
  startMonth: number
  endMonth: number
  bonusMode: BonusMode
  taxpayerType: TaxpayerType
  taxReductionMonthly: number
  payTiming: PayTiming
  customCities: CityPolicy[]
  reverseAdjustIncomeId: string
}

export function useHistory() {
  const salaryStore = useSalaryStore()
  const settingsStore = useSettingsStore()

  const past: string[] = []
  const future: string[] = []
  const canUndo = ref(false)
  const canRedo = ref(false)
  let present = readSnapshot()
  let timer: number | undefined

  function syncFlags() {
    canUndo.value = past.length > 0
    canRedo.value = future.length > 0
  }

  /** 读取当前状态的序列化快照 */
  function readSnapshot(): string {
    const data: SnapshotData = {
      incomes: salaryStore.incomes,
      insurance: salaryStore.insurance,
      deductions: salaryStore.deductions,
      stages: salaryStore.stages,
      monthOverrides: salaryStore.monthOverrides,
      postTaxDeductions: salaryStore.postTaxDeductions,
      year: settingsStore.year,
      startMonth: settingsStore.startMonth,
      endMonth: settingsStore.endMonth,
      bonusMode: settingsStore.bonusMode,
      taxpayerType: settingsStore.taxpayerType,
      taxReductionMonthly: settingsStore.taxReductionMonthly,
      payTiming: settingsStore.payTiming,
      customCities: settingsStore.customCities,
      reverseAdjustIncomeId: settingsStore.reverseAdjustIncomeId,
    }
    return JSON.stringify(data)
  }

  /** 把快照写回各 store */
  function writeSnapshot(raw: string) {
    const data = JSON.parse(raw) as SnapshotData
    salaryStore.incomes = data.incomes
    salaryStore.insurance = data.insurance
    salaryStore.deductions = data.deductions
    salaryStore.stages = data.stages
    salaryStore.monthOverrides = data.monthOverrides
    salaryStore.postTaxDeductions = data.postTaxDeductions
    settingsStore.updateSettings({
      year: data.year,
      startMonth: data.startMonth,
      endMonth: data.endMonth,
      bonusMode: data.bonusMode,
      taxpayerType: data.taxpayerType,
      taxReductionMonthly: data.taxReductionMonthly,
      payTiming: data.payTiming,
      customCities: data.customCities,
      reverseAdjustIncomeId: data.reverseAdjustIncomeId,
    })
  }

  /** 把当前状态记入历史；与前一条相同时忽略 */
  function commit() {
    window.clearTimeout(timer)
    const current = readSnapshot()
    if (current === present) return
    past.push(present)
    if (past.length > MAX_STEPS) past.shift()
    present = current
    future.length = 0
    syncFlags()
  }

  /** 有未落地的合并窗口时先提交，保证撤销能回到刚才那一步之前 */
  function flushPending() {
    if (timer === undefined) return
    window.clearTimeout(timer)
    timer = undefined
    commit()
  }

  watch(readSnapshot, () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = undefined
      commit()
    }, MERGE_WINDOW)
  })

  function undo() {
    flushPending()
    const previous = past.pop()
    if (previous === undefined) return false
    future.push(present)
    // 先更新 present 再写回，写回触发的 watch 会因状态一致而自动跳过
    present = previous
    writeSnapshot(previous)
    syncFlags()
    return true
  }

  function redo() {
    flushPending()
    const next = future.pop()
    if (next === undefined) return false
    past.push(present)
    present = next
    writeSnapshot(next)
    syncFlags()
    return true
  }

  return { canUndo, canRedo, undo, redo }
}
