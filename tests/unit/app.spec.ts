/**
 * @Author: wj
 * @FilePath: tests/unit/app.spec.ts
 * @Description: 应用挂载冒烟测试：验证主布局渲染、默认列预设与计算结果可用性
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import App from '@/App.vue'
import TableView from '@/views/TableView.vue'
import { createDefaultIncomes } from '@/config/presets'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import type { IncomeItem } from '@/types'

describe('应用挂载冒烟', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('默认进入录入设置视图并常驻展示年度到手', () => {
    const pinia = createPinia()
    const wrapper = mount(App, { global: { plugins: [pinia, ElementPlus] } })

    const text = wrapper.text()
    expect(text).toContain('薪资计算器')
    expect(text).toContain('录入设置')
    expect(text).toContain('月度明细')
    expect(text).toContain('计算周期')
    // 顶栏常驻年度到手，录入页也能看到结果
    expect(text).toContain('年度到手')
    // 计算结果不得出现 NaN / Infinity，说明边界保护生效
    expect(text).not.toContain('NaN')
    expect(text).not.toContain('Infinity')
  })

  it('月度明细按分页渲染结果概览、逐月明细与年度汇总', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(TableView, {
      props: { section: 'overview' },
      global: { plugins: [pinia, ElementPlus] },
    })

    expect(wrapper.text()).toContain('单位用工成本')
    expect(wrapper.text()).not.toContain('NaN')

    await wrapper.setProps({ section: 'monthly' })
    expect(wrapper.text()).toContain('可直接编辑')

    await wrapper.setProps({ section: 'annual' })
    expect(wrapper.text()).toContain('年度汇总')
  })

  it('默认预设生成可见列且收入项自动派生动态列', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    mount(App, { global: { plugins: [pinia, ElementPlus] } })

    const schemaStore = useTableSchemaStore()
    const labels = schemaStore.visibleColumns.map((column) => column.label)

    expect(labels).toContain('月份')
    expect(labels).toContain('实发工资')
    expect(labels).toContain('专项附加扣除')
    // 默认 4 个收入项（基本工资/绩效工资/交通餐补/年终奖）应各自派生一列
    expect(schemaStore.visibleColumns.filter((column) => column.dynamic)).toHaveLength(4)
  })

  it('旧版本 localStorage 存档不会导致白屏', () => {
    // 复现线上故障：早期存档的收入项没有 staged / stageAmounts / stageEnabled
    const legacyIncomes = createDefaultIncomes().map((item) => {
      const clone: Partial<IncomeItem> = { ...item }
      delete clone.staged
      delete clone.stageAmounts
      delete clone.stageEnabled
      return clone
    })
    const legacyInsurance = {
      cityCode: 'beijing',
      baseMode: 'gross',
      manualBase: 15000,
      clampEnabled: true,
      items: {
        pension: { enabled: true },
        medical: { enabled: true },
        unemployment: { enabled: true },
        injury: { enabled: true },
        maternity: { enabled: false },
        housingFund: { enabled: true },
      },
    }
    localStorage.setItem(
      'salary-calc:input',
      JSON.stringify({ incomes: legacyIncomes, insurance: legacyInsurance, deductions: {} }),
    )

    const wrapper = mount(App, { global: { plugins: [createPinia(), ElementPlus] } })
    expect(wrapper.text()).toContain('薪资计算器')
    expect(wrapper.text()).not.toContain('NaN')
  })

  it('默认初始化数据全部为 0，不预填演示金额', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    mount(App, { global: { plugins: [pinia, ElementPlus] } })

    const { result } = useSalaryCalculator()
    const annual = result.value.annual

    expect(result.value.monthly).toHaveLength(12)
    // 初始化不预填任何收入与社保，所有金额都应是 0 且为有限值
    expect(annual.gross).toBe(0)
    expect(annual.net).toBe(0)
    expect(annual.tax).toBe(0)
    expect(annual.insurancePersonal).toBe(0)
    expect(annual.nonCashIncome).toBe(0)
    expect(Number.isFinite(annual.net)).toBe(true)
  })
})
