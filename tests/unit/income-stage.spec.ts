/**
 * @Author: wj
 * @FilePath: tests/unit/income-stage.spec.ts
 * @Description: 收入项阶段差异化：通用金额与各阶段金额保持唯一数据源
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import IncomeEditor from '@/components/income/IncomeEditor.vue'
import { useSalaryStore } from '@/stores/useSalaryStore'

function setupStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useSalaryStore()
  // 清空默认收入项，只保留本用例构造的一项
  store.incomes = []
  const item = store.addIncome('salary')
  return { pinia, store, item }
}

describe('收入项阶段金额', () => {
  it('开启按阶段区分发放后不再渲染通用金额输入框，避免出现改了不生效的输入框', () => {
    const { pinia, store, item } = setupStore()
    store.updateIncome(item.id, { name: '绩效工资', amount: 3000 })
    store.toggleStagedIncome(item.id, true)
    store.updateStageAmount(item.id, 'regular', 2000)

    const wrapper = mount(IncomeEditor, { global: { plugins: [ElementPlus, pinia] } })

    expect(wrapper.text()).toContain('按阶段金额')
    // 通用金额输入框已被阶段金额替代，页面上只剩各阶段金额输入框
    expect(wrapper.findAll('.income-item__amount .el-input-number')).toHaveLength(0)
    expect(wrapper.findAll('.stage-cell .el-input-number').length).toBeGreaterThan(0)
  })

  it('关闭按阶段区分发放时用「转正后」金额回填通用金额，避免回落到旧数值', () => {
    const { store, item } = setupStore()
    store.updateIncome(item.id, { amount: 3000 })
    store.toggleStagedIncome(item.id, true)
    store.updateStageAmount(item.id, 'regular', 2000)
    store.toggleStagedIncome(item.id, false)

    expect(item.amount).toBeCloseTo(2000, 2)
    expect(item.staged).toBe(false)
  })
})
