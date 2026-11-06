import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus, { ElInputNumber } from 'element-plus'
import { createPinia } from 'pinia'
import InsuranceEditor from '@/components/insurance/InsuranceEditor.vue'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

/**
 * 回归：费率按百分比存储时若只保留 2 位小数，7.5% → 0.08，减号会把数值弹回原值
 * 表现为「比例只能增多、不能减少」。这里同时校验输入与点按减号两条路径。
 */
describe('InsuranceEditor 费率输入', () => {
  function mountEditor() {
    return mount(InsuranceEditor, {
      attachTo: document.body,
      global: { plugins: [ElementPlus, createPinia()] },
    })
  }

  it('输入 7.5 存为 0.075 并按 7.50 回显', async () => {
    const wrapper = mountEditor()
    const store = useSalaryStore()
    await wrapper.vm.$nextTick()

    const input = wrapper.findAll('.rate-row__input input')[0]
    await input.setValue('7.5')
    await input.trigger('change')
    await wrapper.vm.$nextTick()

    expect(store.insurance.items.pension.rate?.personal).toBe(0.075)
    expect((input.element as HTMLInputElement).value).toBe('7.50')
    wrapper.unmount()
  })

  it('点按减号能把 8% 降到 7.5%', async () => {
    const wrapper = mountEditor()
    const store = useSalaryStore()
    await wrapper.vm.$nextTick()

    const decrease = wrapper
      .findAll('.rate-row')[0]
      .find('.el-input-number__decrease')
      .element as HTMLElement & { _RepeatClick?: { start: (evt: MouseEvent) => void } }

    decrease._RepeatClick?.start({ button: 0 } as MouseEvent)
    await wrapper.vm.$nextTick()

    expect(store.insurance.items.pension.rate?.personal).toBe(0.075)
    const numbers = wrapper
      .findAllComponents(ElInputNumber)
      .filter((item) => item.classes('rate-row__input'))
    expect(numbers[0].props('modelValue')).toBe(7.5)
    wrapper.unmount()
  })

  it('按金额反推：基数 5000 输入个人 500 元，换算为 10%', async () => {
    const wrapper = mountEditor()
    const store = useSalaryStore()
    await wrapper.vm.$nextTick()

    store.updateInsurance({ baseMode: 'manual', manualBase: 5000 })
    await wrapper.vm.$nextTick()

    const group = wrapper.find('.rate-panel__actions').findComponent({ name: 'ElRadioGroup' })
    group.vm.$emit('update:modelValue', 'amount')
    await wrapper.vm.$nextTick()

    const amountInput = wrapper.findAll('.rate-row__input input')[0]
    await amountInput.setValue('500')
    await amountInput.trigger('change')
    await wrapper.vm.$nextTick()

    expect(store.insurance.items.pension.rate?.personal).toBe(0.1)
    expect(wrapper.find('.rate-row__amount').text()).toContain('10.00%')
    wrapper.unmount()
  })

  it('试用期停缴公积金时，公积金行展示真正缴纳的月份而不是 ¥0.00', async () => {
    const wrapper = mountEditor()
    const store = useSalaryStore()
    const settings = useSettingsStore()
    await wrapper.vm.$nextTick()

    // 默认阶段：实习 1-2 月停缴全部，试用 3-5 月只停缴公积金，转正 6-12 月正常缴纳
    settings.updateSettings({ startMonth: 1, endMonth: 12 })
    store.updateIncome('base_salary', { amount: 8000 })
    store.updateInsurance({ baseMode: 'manual', manualBase: 8000 })
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('.rate-row')
    const housingRow = rows[rows.length - 1]
    expect(housingRow.text()).toContain('住房公积金')
    // 12% × 8000 = 960，说明参考月跳过了试用期，取到转正后的月份
    expect(housingRow.text()).toContain('¥960.00')
    wrapper.unmount()
  })
})
