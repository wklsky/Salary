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
import { createDefaultIncomes } from '@/config/presets'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import type { IncomeItem } from '@/types'

describe('应用挂载冒烟', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('渲染主布局与核心指标', () => {
    const pinia = createPinia()
    const wrapper = mount(App, { global: { plugins: [pinia, ElementPlus] } })

    const text = wrapper.text()
    expect(text).toContain('薪资计算器')
    expect(text).toContain('年度到手')
    expect(text).toContain('单位用工成本')
    expect(text).toContain('年度汇算')
    // 计算结果不得出现 NaN / Infinity，说明边界保护生效
    expect(text).not.toContain('NaN')
    expect(text).not.toContain('Infinity')
  })

  it('默认预设生成可见列且收入项自动派生动态列', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    mount(App, { global: { plugins: [pinia, ElementPlus] } })

    const schemaStore = useTableSchemaStore()
    const labels = schemaStore.visibleColumns.map((column) => column.label)

    expect(labels).toContain('月份')
    expect(labels).toContain('到手工资')
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

  it('默认示例数据产出合理的计算结果', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    mount(App, { global: { plugins: [pinia, ElementPlus] } })

    const { result } = useSalaryCalculator()
    const annual = result.value.annual

    expect(result.value.monthly).toHaveLength(12)
    expect(annual.gross).toBeGreaterThan(0)
    expect(annual.net).toBeGreaterThan(0)
    expect(annual.net).toBeLessThan(annual.gross)
    expect(annual.companyCost).toBeGreaterThan(annual.gross)
    // 到手 + 个人社保 + 个税 应恒等于应发
    expect(annual.net + annual.insurancePersonal + annual.tax).toBeCloseTo(annual.gross, 1)
  })
})
