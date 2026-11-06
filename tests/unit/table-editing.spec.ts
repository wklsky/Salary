/**
 * @Author: wj
 * @FilePath: tests/unit/table-editing.spec.ts
 * @Description: 表格编辑反推与自定义城市的联动回归：反推必须与页面展示使用同一套城市政策
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTableEditing } from '@/composables/useTableEditing'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { CityPolicy } from '@/types'

/** 覆盖内置北京：只保留养老 50%/50%，其余险种费率为 null（引擎自动跳过） */
const city: CityPolicy = {
  code: 'beijing',
  name: '测试覆盖北京',
  base: { lower: 0, upper: 100000 },
  rates: {
    pension: { personal: 0.5, company: 0.5 },
    medical: null,
    largeMedical: null,
    unemployment: null,
    injury: null,
    maternity: null,
    housingFund: null,
  },
  medicalFixed: 0,
  referenceYear: 2026,
}

describe('表格编辑与自定义城市的联动', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('自定义城市覆盖内置城市后，五险一金反推使用自定义费率', () => {
    const settingsStore = useSettingsStore()
    const salaryStore = useSalaryStore()
    settingsStore.upsertCustomCity(city)
    // 默认阶段 1 月=实习期停缴全部险种，清空阶段让 1 月正常缴纳
    salaryStore.stages = []
    salaryStore.updateInsurance({
      cityCode: 'beijing',
      baseMode: 'manual',
      manualBase: 10000,
      clampEnabled: false,
    })

    const { applyCellValue } = useTableEditing()
    // 当前个人养老 = 10000 × 50% = 5000；输入 6000 触发反推
    const ok = applyCellValue(1, 'ins_pension', 'insuranceType', 6000)

    expect(ok).toBe(true)
    // 反推基数 ≈ 6000 / 0.5 = 12000；若反推漏传自定义城市，会按内置北京多险种费率算出其它基数
    expect(salaryStore.monthOverrides[1]?.insuranceBase ?? 0).toBeCloseTo(12000, 0)
  })

  it('与当前值一致时直接返回，不产生单月覆盖', () => {
    const settingsStore = useSettingsStore()
    const salaryStore = useSalaryStore()
    settingsStore.upsertCustomCity(city)
    salaryStore.stages = []
    salaryStore.updateInsurance({
      cityCode: 'beijing',
      baseMode: 'manual',
      manualBase: 10000,
      clampEnabled: false,
    })

    const { applyCellValue } = useTableEditing()
    const ok = applyCellValue(1, 'ins_pension', 'insuranceType', 5000)

    expect(ok).toBe(true)
    expect(salaryStore.monthOverrides[1]?.insuranceBase).toBeUndefined()
  })
})
