/**
 * @Author: wj
 * @FilePath: src/stores/useSettingsStore.ts
 * @Description: 全局计算设置：年度、在职区间、纳税人身份、减免税额与年终奖计税方式
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BonusMode, TaxpayerType } from '@/types'

interface SettingsPayload {
  year: number
  startMonth: number
  endMonth: number
  bonusMode: BonusMode
  taxpayerType: TaxpayerType
  taxReductionMonthly: number
}

export const useSettingsStore = defineStore(
  'salary-settings',
  () => {
    const year = ref<number>(new Date().getFullYear())
    /** 当年入职月份，影响累计减除费用的月份数 */
    const startMonth = ref<number>(1)
    /** 当年离职月份；按自然年计算，跨年周期请分两次录入 */
    const endMonth = ref<number>(12)
    /** 年终奖计税方式，auto 会自动搜索税负最低的拆分方案 */
    const bonusMode = ref<BonusMode>('auto')
    /** 居民个人累计预扣；非居民个人按月单独计税且不享受专项附加扣除 */
    const taxpayerType = ref<TaxpayerType>('resident')
    /** 每月减免税额，如残疾、孤老、烈属等减征政策，无则填 0 */
    const taxReductionMonthly = ref<number>(0)

    function updateSettings(payload: Partial<SettingsPayload>) {
      if (payload.year !== undefined) year.value = payload.year
      if (payload.startMonth !== undefined) startMonth.value = payload.startMonth
      if (payload.endMonth !== undefined) endMonth.value = payload.endMonth
      if (payload.bonusMode !== undefined) bonusMode.value = payload.bonusMode
      if (payload.taxpayerType !== undefined) taxpayerType.value = payload.taxpayerType
      if (payload.taxReductionMonthly !== undefined) {
        taxReductionMonthly.value = payload.taxReductionMonthly
      }
      // 保证在职区间合法，避免离职月早于入职月导致零收入
      if (endMonth.value < startMonth.value) endMonth.value = startMonth.value
    }

    /** 补齐旧版本存档缺失的设置项，避免读取 undefined 参与计算 */
    function normalize() {
      if (typeof endMonth.value !== 'number') endMonth.value = 12
      if (!taxpayerType.value) taxpayerType.value = 'resident'
      if (typeof taxReductionMonthly.value !== 'number') taxReductionMonthly.value = 0
      if (endMonth.value < startMonth.value) endMonth.value = startMonth.value
    }

    return {
      year,
      startMonth,
      endMonth,
      bonusMode,
      taxpayerType,
      taxReductionMonthly,
      updateSettings,
      normalize,
    }
  },
  { persist: { key: 'salary-calc:settings' } },
)
