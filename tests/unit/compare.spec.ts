/**
 * @Author: wj
 * @FilePath: tests/unit/compare.spec.ts
 * @Description: 方案对比视图：计数文案、勾选参与对比与空态切换
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import CompareView from '@/views/CompareView.vue'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

/** 视图与测试共用同一个 Pinia 实例，避免各挂各的 */
function mountCompare() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(CompareView, { global: { plugins: [pinia, ElementPlus] } })
}

function saveScheme(): void {
  const salaryStore = useSalaryStore()
  const settingsStore = useSettingsStore()
  salaryStore.saveScheme('Offer A', {
    year: settingsStore.year,
    startMonth: settingsStore.startMonth,
    endMonth: settingsStore.endMonth,
    bonusMode: settingsStore.bonusMode,
    taxpayerType: settingsStore.taxpayerType,
    taxReductionMonthly: settingsStore.taxReductionMonthly,
  })
}

describe('方案对比视图', () => {
  it('未保存方案时只显示「仅当前录入」', () => {
    const wrapper = mountCompare()
    expect(wrapper.text()).toContain('仅当前录入')
    expect(wrapper.text()).toContain('还没有保存任何方案')
  })

  it('保存方案后计数为「当前录入 + 1 套存档」，取消勾选后回到空态', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    saveScheme()

    const wrapper = mount(CompareView, { global: { plugins: [pinia, ElementPlus] } })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('当前录入 + 1 套存档')

    const tag = wrapper.findAll('.el-check-tag')[0]
    await tag.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('当前录入 + 0 套存档')
    expect(wrapper.text()).toContain('所有存档方案都已隐藏')
  })
})
