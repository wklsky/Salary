/**
 * @Author: wj
 * @FilePath: tests/unit/settings.spec.ts
 * @Description: 计算周期与方案存档设置测试：区间合法性、月数钳制与方案设置回填
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

describe('计算周期设置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('起始月后移时自动修正离职月，避免空区间', async () => {
    const store = useSettingsStore()
    store.updateSettings({ startMonth: 1, endMonth: 1 })
    // 界面直接绑定 startMonth，模拟用户把起始月改到 6 月
    store.startMonth = 6
    await nextTick()
    expect(store.endMonth).toBe(6)
    expect(store.monthCount).toBe(1)
  })

  it('计算月数不得跨年', () => {
    const store = useSettingsStore()
    store.updateSettings({ startMonth: 6, monthCount: 12 })
    expect(store.endMonth).toBe(12)
    expect(store.monthCount).toBe(7)
  })

  it('旧存档中的非法月份会被收敛到 1-12', () => {
    const store = useSettingsStore()
    store.startMonth = 0
    store.endMonth = 99
    store.normalize()
    expect(store.startMonth).toBe(1)
    expect(store.endMonth).toBe(12)
  })
})

describe('方案存档', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('保存并应用方案时完整恢复计算设置', () => {
    const salaryStore = useSalaryStore()
    const meta = {
      year: 2026,
      startMonth: 3,
      endMonth: 8,
      bonusMode: 'auto' as const,
      taxpayerType: 'nonResident' as const,
      taxReductionMonthly: 100,
    }
    const scheme = salaryStore.saveScheme('A 公司', meta)

    // 先打乱当前状态，再应用方案
    salaryStore.resetAll()
    const restored = salaryStore.applyScheme(scheme.id)

    expect(restored).toEqual(meta)
  })
})
