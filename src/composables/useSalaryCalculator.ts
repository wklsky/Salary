/**
 * @Author: wj
 * @FilePath: src/composables/useSalaryCalculator.ts
 * @Description: 把录入数据组装为计算入参并输出响应式计算结果
 */
import { computed, type ComputedRef } from 'vue'
import { calculateSalary } from '@/core'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { SalaryInput, SalaryResult } from '@/types'

export interface SalaryCalculator {
  input: ComputedRef<SalaryInput>
  result: ComputedRef<SalaryResult>
}

export function useSalaryCalculator(): SalaryCalculator {
  const salaryStore = useSalaryStore()
  const settingsStore = useSettingsStore()

  const input = computed<SalaryInput>(() => ({
    year: settingsStore.year,
    startMonth: settingsStore.startMonth,
    incomes: salaryStore.incomes,
    insurance: salaryStore.insurance,
    deductions: salaryStore.deductions,
    bonusMode: settingsStore.bonusMode,
    stages: salaryStore.stages,
    endMonth: settingsStore.endMonth,
    taxpayerType: settingsStore.taxpayerType,
    taxReductionMonthly: settingsStore.taxReductionMonthly,
  }))

  // 计算内核为纯函数，入参变化即重算；12 个月的循环开销可忽略，不做防抖
  const result = computed<SalaryResult>(() => calculateSalary(input.value))

  return { input, result }
}
