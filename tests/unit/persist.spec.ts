/**
 * @Author: wj
 * @FilePath: tests/unit/persist.spec.ts
 * @Description: 存档版本、导入校验与缺失险种补全测试
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { migrateSnapshot, readVersion, validateSnapshot } from '@/core/persist'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

describe('存档版本', () => {
  it('无版本号的旧存档按 v1 处理', () => {
    expect(readVersion({ incomes: [] })).toBe(1)
    expect(readVersion(null)).toBe(1)
  })

  it('能读出导出文件里的版本号', () => {
    expect(readVersion({ version: 2 })).toBe(2)
    expect(readVersion({ __v: 3 })).toBe(3)
  })

  it('迁移时剥离版本字段，避免写回 store', () => {
    const migrated = migrateSnapshot<Record<string, unknown>>({ version: 2, incomes: [] })
    expect(migrated.version).toBeUndefined()
    expect(migrated.incomes).toEqual([])
  })
})

describe('导入校验', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('结构完整的配置可以通过校验', () => {
    expect(
      validateSnapshot({
        incomes: [{ id: 'a', name: '基本工资', amount: 8000 }],
        stages: [],
        insurance: {},
        deductions: {},
        tableSchema: { columns: [] },
      }),
    ).toEqual([])
  })

  it('收入项金额非法时给出可读的错误', () => {
    const errors = validateSnapshot({
      incomes: [{ id: 'a', name: '基本工资', amount: '8000' }],
    })
    expect(errors[0]).toContain('金额')
  })

  it('导入损坏的配置时不落库并抛出错误', () => {
    const store = useSalaryStore()
    const before = JSON.stringify(store.incomes)
    expect(() => store.importSnapshot({ incomes: 'not-an-array' as never })).toThrow(/导入失败/)
    expect(JSON.stringify(store.incomes)).toBe(before)
  })

  it('导入旧存档时补齐缺失险种且不改变计算结果', () => {
    const store = useSalaryStore()
    store.importSnapshot({
      insurance: {
        cityCode: 'beijing',
        baseMode: 'gross',
        manualBase: 10000,
        clampEnabled: true,
        housingFundBaseMode: 'same',
        housingFundManualBase: 0,
        housingFundClampEnabled: true,
        medicalFixed: 0,
        // 旧存档只有养老与医疗，没有大额医疗
        items: {
          pension: { enabled: true },
          medical: { enabled: true },
        } as never,
      },
    })
    expect(store.insurance.items.largeMedical).toBeDefined()
    // 后加险种按未启用补齐，升级前后缴纳额一致
    expect(store.insurance.items.largeMedical.enabled).toBe(false)
  })
})

describe('存档版本写入', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('normalize 后写入当前存档版本', () => {
    const settings = useSettingsStore()
    settings.normalize()
    expect(settings.storageVersion).toBeGreaterThan(0)
  })
})
