/**
 * @Author: wj
 * @FilePath: tests/unit/smoke.spec.ts
 * @Description: 环境冒烟：逐个组件验证在 happy-dom 下可正常挂载
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import AnnualTable from '@/components/result/AnnualTable.vue'
import BonusAdvice from '@/components/result/BonusAdvice.vue'
import DeductionEditor from '@/components/deduction/DeductionEditor.vue'
import IncomeEditor from '@/components/income/IncomeEditor.vue'
import InsuranceEditor from '@/components/insurance/InsuranceEditor.vue'
import MonthEditorDrawer from '@/components/month/MonthEditorDrawer.vue'
import SetupView from '@/components/layout/SetupView.vue'
import StageEditor from '@/components/stage/StageEditor.vue'

function mountWith(comp: unknown) {
  return mount(comp as never, { global: { plugins: [ElementPlus, createPinia()] } })
}

describe('组件挂载冒烟', () => {
  it('IncomeEditor 可挂载', () => {
    expect(mountWith(IncomeEditor).text()).toContain('年度应发')
  })

  it('InsuranceEditor 可挂载', () => {
    expect(mountWith(InsuranceEditor).text()).toContain('参保城市')
  })

  it('DeductionEditor 可挂载', () => {
    expect(mountWith(DeductionEditor).text()).toContain('月度可扣')
  })

  it('BonusAdvice 可挂载', () => {
    expect(mountWith(BonusAdvice).text()).toContain('年终奖')
  })

  it('AnnualTable 可挂载', () => {
    expect(mountWith(AnnualTable).text()).toContain('收入构成')
  })

  it('StageEditor 可挂载并渲染默认阶段', () => {
    const text = mountWith(StageEditor).text()
    expect(text).toContain('实习期')
    expect(text).toContain('试用期')
    expect(text).toContain('转正后')
  })

  it('SetupView 可挂载并展示计算周期', () => {
    const text = mountWith(SetupView).text()
    expect(text).toContain('计算周期')
    expect(text).toContain('计算月数')
    expect(text).toContain('个月，最长 12 个月')
  })

  it('MonthEditorDrawer 可挂载并渲染月份标题', () => {
    // 抽屉内容渲染到 body，需挂载到文档后才能取到文本
    // happy-dom 下抽屉主体的过渡层延迟挂载，故只校验标题与底部按钮稳定渲染
    const wrapper = mount(MonthEditorDrawer, {
      props: { modelValue: true, month: 6 },
      attachTo: document.body,
      global: { plugins: [ElementPlus, createPinia()] },
    })
    const text = wrapper.text()
    expect(text).toContain('6 月数据')
    expect(text).toContain('清除本月所有调整')
    wrapper.unmount()
  })
})
