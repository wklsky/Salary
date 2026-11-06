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

  it('导出快照包含方案存档，导入后可完整还原', () => {
    const salaryStore = useSalaryStore()
    salaryStore.saveScheme('留档方案', {
      year: 2026,
      startMonth: 1,
      endMonth: 12,
      bonusMode: 'auto',
      taxpayerType: 'resident',
      taxReductionMonthly: 0,
    })

    const snapshot = salaryStore.exportSnapshot()
    expect(snapshot.schemes).toHaveLength(1)

    // 清空方案后再导入，验证存档随快照一起回来
    salaryStore.removeScheme(snapshot.schemes[0]!.id)
    expect(salaryStore.schemes).toHaveLength(0)

    salaryStore.importSnapshot(snapshot as Parameters<typeof salaryStore.importSnapshot>[0])
    expect(salaryStore.schemes).toHaveLength(1)
    expect(salaryStore.schemes[0]?.name).toBe('留档方案')
  })

  it('导入旧存档缺少方案字段时不报错', () => {
    const salaryStore = useSalaryStore()
    expect(() =>
      salaryStore.importSnapshot({
        incomes: [],
        insurance: undefined,
        deductions: undefined,
        stages: [],
        monthOverrides: {},
        postTaxDeductions: [],
      }),
    ).not.toThrow()
    expect(salaryStore.schemes).toHaveLength(0)
  })
})

describe('自定义城市政策', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const city = {
    code: 'custom_1',
    name: '测试市',
    base: { lower: 5000, upper: 20000 },
    rates: {
      pension: { personal: 0.08, company: 0.16 },
      medical: { personal: 0.02, company: 0.09 },
      largeMedical: null,
      unemployment: { personal: 0.005, company: 0.005 },
      injury: { personal: 0, company: 0.004 },
      maternity: null,
      housingFund: { personal: 0.07, company: 0.07 },
    },
    medicalFixed: 0,
    referenceYear: 2026,
  }

  it('新增、覆盖与删除自定义城市', () => {
    const store = useSettingsStore()
    store.upsertCustomCity(city)
    expect(store.customCities).toHaveLength(1)

    // 同 code 视为政策更新，原地覆盖而不是追加
    store.upsertCustomCity({ ...city, name: '测试市（更新）' })
    expect(store.customCities).toHaveLength(1)
    expect(store.customCities[0]?.name).toBe('测试市（更新）')

    store.removeCustomCity('custom_1')
    expect(store.customCities).toHaveLength(0)
  })

  it('非数组的城市数据在规范化时被清空', () => {
    const store = useSettingsStore()
    // 模拟旧版本或损坏的持久化数据
    ;(store as unknown as { customCities: unknown }).customCities = 'oops'
    store.normalize()
    expect(Array.isArray(store.customCities)).toBe(true)
    expect(store.customCities).toHaveLength(0)
  })
})

describe('年终奖合计口径', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('按归属月实际金额统计：阶段金额与单月覆盖优先于基础金额', () => {
    const store = useSalaryStore()
    const item = store.addIncome('bonus')
    const id = item.id
    store.updateIncome(id, { amount: 50000, staged: true, stageAmounts: { regular: 80000 } })
    // 默认发放月 1 月 = 实习期，未配置实习期金额 → 回落基础金额
    expect(store.bonusTotal).toBe(50000)
    // 改为 8 月发放：8 月 = 转正后 → 按转正后金额统计
    store.updateIncome(id, { month: 8 })
    expect(store.bonusTotal).toBe(80000)
    // 单月覆盖优先级最高
    store.setMonthAmount(8, id, 66666)
    expect(store.bonusTotal).toBe(66666)
  })
})
