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
})
