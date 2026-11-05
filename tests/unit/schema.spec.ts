/**
 * @Author: wj
 * @FilePath: tests/unit/schema.spec.ts
 * @Description: 表格 Schema 导入导出测试：自定义列与逐月金额需随配置完整迁移
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'

describe('表格 Schema 导入导出', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('自定义列及其逐月金额可完整导出并恢复', () => {
    const store = useTableSchemaStore()
    const column = store.addCustomColumn('项目奖金')
    store.setCustomValue(column.key, 6, 6000)
    store.updateCustomColumn(column.key, { intoBase: true })

    const snapshot = store.exportSchema()
    store.resetColumns()
    expect(store.customColumns).toHaveLength(0)

    store.importSchema(snapshot)
    const restored = store.customColumns[0]
    expect(restored?.label).toBe('项目奖金')
    expect(restored?.custom?.values[5]).toBe(6000)
    expect(restored?.custom?.intoBase).toBe(true)
  })

  it('税后扣款项同步为表格列，删除项目时清理对应列', () => {
    const store = useTableSchemaStore()
    store.syncPostTaxColumns([
      {
        id: 'utility',
        name: '水电费',
        enabled: true,
        monthlyAmounts: Array<number>(12).fill(0),
      },
    ])
    const column = store.columns.find((item) => item.key === 'posttax_utility')
    expect(column?.label).toBe('水电费')
    expect(column?.group).toBe('deduction')
    expect(column?.visible).toBe(true)

    store.syncPostTaxColumns([])
    expect(store.columns.some((item) => item.key.startsWith('posttax_'))).toBe(false)
  })

  it('计分制收入项同步分数列，关闭后清理', () => {
    const store = useTableSchemaStore()
    const income = {
      id: 'performance',
      name: '绩效',
      amount: 0,
      cycle: 'monthly' as const,
      month: 1,
      intoInsuranceBase: false,
      taxable: true,
      kind: 'salary' as const,
      enabled: true,
      staged: false,
      stageAmounts: {},
      stageEnabled: {},
      nonCash: false,
      variableByMonth: false,
      scoreBased: true,
      perPointAmount: 20,
      monthlyScores: Array<number>(12).fill(0),
    }
    store.syncDynamicColumns([income])
    store.syncScoreColumns([income])
    const column = store.columns.find((item) => item.key === 'score_performance')
    expect(column?.label).toBe('绩效(分)')
    expect(column?.formatter).toBe('number')
    // 分数列紧挨金额列之后
    const amountColumn = store.columns.find((item) => item.key === 'performance')
    expect((column?.order ?? 0) > (amountColumn?.order ?? 0)).toBe(true)

    store.syncScoreColumns([])
    expect(store.columns.some((item) => item.key.startsWith('score_'))).toBe(false)
  })

  it('导入脏数据时补齐缺失字段而不抛错', () => {
    const store = useTableSchemaStore()
    expect(() =>
      store.importSchema({
        columns: [
          {
            key: 'custom_dirty',
            label: '补贴',
            group: 'income',
            visible: true,
            order: 1,
            formatter: 'money',
            dynamic: false,
            custom: { values: [100] as unknown as number[] } as never,
          },
        ],
      }),
    ).not.toThrow()

    const column = store.columns.find((item) => item.key === 'custom_dirty')
    expect(column?.custom?.values).toHaveLength(12)
    expect(column?.custom?.values[0]).toBe(100)
    // 缺失的月份与布尔开关按安全默认值补齐
    expect(column?.custom?.values[1]).toBe(0)
    expect(column?.custom?.intoGross).toBe(true)
    expect(column?.custom?.intoBase).toBe(false)
  })
})
