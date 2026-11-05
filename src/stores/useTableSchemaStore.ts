/**
 * @Author: wj
 * @FilePath: src/stores/useTableSchemaStore.ts
 * @Description: 表格列 Schema 管理：动态收入列同步、可见性/顺序调整与预设模板
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createStaticColumns,
  POST_TAX_COLUMN_PREFIX,
  SCORE_COLUMN_PREFIX,
} from '@/config/columns'
import { COLUMN_PRESETS, DEFAULT_PRESET_ID } from '@/config/presets'
import { createId } from '@/utils/id'
import type {
  ColumnGroup,
  ColumnPreset,
  ColumnSchema,
  CustomColumnDef,
  CustomColumnItem,
  IncomeItem,
  PostTaxDeductionItem,
} from '@/types'

/** 动态收入列的起始排序值，落在静态收入列区间内 */
const DYNAMIC_COLUMN_ORDER_BASE = 150

/** 表格 Schema 的可序列化快照，随配置一起导出/导入 */
export interface TableSchemaSnapshot {
  columns: ColumnSchema[]
  presets: ColumnPreset[]
  activePresetId: string
}

/** 把任意来源的数值数组补齐为 12 个月的合法金额，避免脏存档导致计算 NaN */
function normalizeValues(values: unknown): number[] {
  const source = Array.isArray(values) ? values : []
  return Array.from({ length: 12 }, (_, index) => {
    const value = Number(source[index])
    return Number.isFinite(value) ? value : 0
  })
}

export const useTableSchemaStore = defineStore(
  'table-schema',
  () => {
    const columns = ref<ColumnSchema[]>(createStaticColumns())
    const presets = ref<ColumnPreset[]>(JSON.parse(JSON.stringify(COLUMN_PRESETS)) as ColumnPreset[])
    const activePresetId = ref<string>(DEFAULT_PRESET_ID)

    /** 按当前可见性与顺序输出，供表格渲染 */
    const visibleColumns = computed(() =>
      [...columns.value].filter((column) => column.visible).sort((a, b) => a.order - b.order),
    )

    /** 用户手动新增的自定义列 */
    const customColumns = computed(() => columns.value.filter((column) => column.custom))

    /** 自定义列转换为内核可识别的入参 */
    const customColumnItems = computed<CustomColumnItem[]>(() =>
      customColumns.value.map((column) => ({
        key: column.key,
        label: column.customLabel || column.label,
        values: column.custom?.values ?? Array<number>(12).fill(0),
        intoGross: column.custom?.intoGross ?? true,
        taxable: column.custom?.taxable ?? true,
        intoBase: column.custom?.intoBase ?? false,
      })),
    )

    const columnsByGroup = computed(() => {
      const map = new Map<ColumnGroup, ColumnSchema[]>()
      columns.value.forEach((column) => {
        const list = map.get(column.group) ?? []
        list.push(column)
        map.set(column.group, list)
      })
      ;[...map.values()].forEach((list) => list.sort((a, b) => a.order - b.order))
      return map
    })

    /**
     * 依据收入项同步动态列：
     * 新增收入项自动补列，删除收入项时清理孤儿列，避免表格出现无数据源的列
     */
    function syncDynamicColumns(incomes: IncomeItem[]) {
      const validIds = new Set(incomes.map((item) => item.id))
      columns.value = columns.value.filter((column) => !(column.dynamic && !validIds.has(column.key)))

      incomes.forEach((item, index) => {
        const existing = columns.value.find((column) => column.key === item.id)
        if (existing) {
          // 用户重命名过的列不再被收入项名称覆盖
          if (!existing.customLabel) existing.label = item.name
          return
        }
        columns.value.push({
          key: item.id,
          label: item.name,
          group: 'income',
          visible: activePresetId.value ? isIncomeColumnVisibleByPreset() : true,
          order: DYNAMIC_COLUMN_ORDER_BASE + index,
          width: 120,
          formatter: 'money',
          dynamic: true,
        })
      })
    }

    /**
     * 用最新内置预设覆盖 localStorage 中的旧版内置预设
     * 内置预设会随版本新增字段（如动态收入列插入位置），不能沿用旧存档；用户自建预设原样保留
     */
    function syncBuiltinPresets() {
      const builtinIds = new Set(COLUMN_PRESETS.map((preset) => preset.id))
      const customPresets = presets.value.filter((preset) => !builtinIds.has(preset.id))
      presets.value = [
        ...(JSON.parse(JSON.stringify(COLUMN_PRESETS)) as ColumnPreset[]),
        ...customPresets,
      ]
    }

    /**
     * 合并版本升级后新增的静态列
     * localStorage 里保存的是旧版列注册表，缺少新列时按注册表默认值补入，保留用户已有排序与显隐
     */
    function syncStaticColumns() {
      const registry = createStaticColumns()
      const registryByKey = new Map(registry.map((column) => [column.key, column]))

      // 同步静态列的默认表头（用户手动重命名过的保留），并补入旧存档缺少的新列
      columns.value = columns.value.map((column) => {
        if (column.dynamic || column.custom) return column
        const definition = registryByKey.get(column.key)
        if (!definition || column.customLabel) return column
        return { ...column, label: definition.label }
      })

      const existing = new Set(columns.value.map((column) => column.key))
      const missing = registry.filter((column) => !existing.has(column.key))
      if (missing.length > 0) columns.value = [...columns.value, ...missing]
    }

    /**
     * 依据税后扣款项目同步列
     * 每个扣款项派生一列（posttax_ + id），删除项目时清理对应列
     */
    function syncPostTaxColumns(items: PostTaxDeductionItem[]) {
      const validKeys = new Set(items.map((item) => `${POST_TAX_COLUMN_PREFIX}${item.id}`))
      const next = columns.value.filter(
        (column) =>
          !column.key.startsWith(POST_TAX_COLUMN_PREFIX) || validKeys.has(column.key),
      )
      if (next.length !== columns.value.length) columns.value = next

      items.forEach((item, index) => {
        const key = `${POST_TAX_COLUMN_PREFIX}${item.id}`
        const existing = columns.value.find((column) => column.key === key)
        if (existing) {
          // 用户重命名过的列不再被项目名称覆盖
          if (!existing.customLabel) existing.label = item.name
          return
        }
        columns.value.push({
          key,
          label: item.name,
          group: 'deduction',
          // 新增扣款项默认展示，便于核对每月扣款
          visible: true,
          order: 305 + index,
          width: 110,
          formatter: 'money',
          dynamic: false,
        })
      })
    }

    /**
     * 依据计分制收入项同步分数列
     * 每个计分项派生一列 score_ + id，编辑分数与金额可双向联动
     */
    function syncScoreColumns(incomes: IncomeItem[]) {
      const scoreItems = incomes.filter((item) => item.enabled && item.scoreBased)
      const validKeys = new Set(scoreItems.map((item) => `${SCORE_COLUMN_PREFIX}${item.id}`))
      const next = columns.value.filter(
        (column) =>
          !column.key.startsWith(SCORE_COLUMN_PREFIX) || validKeys.has(column.key),
      )
      if (next.length !== columns.value.length) columns.value = next

      scoreItems.forEach((item) => {
        const key = `${SCORE_COLUMN_PREFIX}${item.id}`
        const existing = columns.value.find((column) => column.key === key)
        if (existing) {
          // 用户重命名过的列不再被收入项名称覆盖
          if (!existing.customLabel) existing.label = `${item.name}(分)`
          return
        }
        // 分数列紧挨对应金额列，排在金额列之后
        const amountColumn = columns.value.find((column) => column.key === item.id)
        columns.value.push({
          key,
          label: `${item.name}(分)`,
          group: 'income',
          visible: true,
          order: amountColumn ? amountColumn.order + 0.001 : DYNAMIC_COLUMN_ORDER_BASE + 50,
          width: 100,
          formatter: 'number',
          dynamic: false,
        })
      })
    }

    /** 动态列是否可见取决于当前预设的 includeIncomeColumns 开关 */
    function isIncomeColumnVisibleByPreset(): boolean {
      const preset = presets.value.find((item) => item.id === activePresetId.value)
      return preset?.includeIncomeColumns ?? true
    }

    /** 新增自定义列：默认计入应发与计税，不计入社保基数 */
    function addCustomColumn(name: string): ColumnSchema {
      const key = createId('custom')
      const column: ColumnSchema = {
        key,
        label: name,
        group: 'income',
        visible: true,
        // 排在动态收入列之后，避免打断既有列序
        order: DYNAMIC_COLUMN_ORDER_BASE + 60 + columns.value.length,
        width: 120,
        formatter: 'money',
        dynamic: false,
        custom: {
          values: Array<number>(12).fill(0),
          intoGross: true,
          taxable: true,
          intoBase: false,
        },
      }
      columns.value.push(column)
      activePresetId.value = ''
      return column
    }

    function removeCustomColumn(key: string) {
      columns.value = columns.value.filter((column) => column.key !== key)
      activePresetId.value = ''
    }

    function updateCustomColumn(key: string, payload: Partial<CustomColumnDef>) {
      const target = columns.value.find((column) => column.key === key)
      if (!target?.custom) return
      Object.assign(target.custom, payload)
    }

    /** 设置自定义列在某月的数值，下标 0-11 对应 1-12 月 */
    function setCustomValue(key: string, month: number, value: number) {
      const target = columns.value.find((column) => column.key === key)
      if (!target?.custom) return
      const values = [...target.custom.values]
      values[month - 1] = value
      target.custom.values = values
    }

    function updateColumn(key: string, payload: Partial<ColumnSchema>) {
      const target = columns.value.find((column) => column.key === key)
      if (!target) return
      Object.assign(target, payload)
    }

    function toggleColumn(key: string, visible: boolean) {
      updateColumn(key, { visible })
      activePresetId.value = ''
    }

    /** 按传入的 key 顺序重排全表列序 */
    function reorderColumns(orderedKeys: string[]) {
      const orderMap = new Map(orderedKeys.map((key, index) => [key, index]))
      columns.value.forEach((column) => {
        const order = orderMap.get(column.key)
        if (order !== undefined) column.order = order
      })
      activePresetId.value = ''
    }

    /** 整体替换可见列，用于预设与「全选/反选」 */
    function setVisibleKeys(keys: string[]) {
      const visibleSet = new Set(keys)
      columns.value.forEach((column) => {
        column.visible = visibleSet.has(column.key)
      })
      reorderColumns(keys)
    }

    function applyPreset(id: string) {
      const preset = presets.value.find((item) => item.id === id)
      if (!preset) return
      const visibleSet = new Set(preset.visibleKeys)
      columns.value.forEach((column) => {
        // 动态收入列与计分制的分数列都随 includeIncomeColumns 一起显隐
        const incomeLike =
          column.dynamic || column.key.startsWith(SCORE_COLUMN_PREFIX)
        column.visible = incomeLike ? preset.includeIncomeColumns : visibleSet.has(column.key)
      })
      // 预设中键的顺序即展示顺序，未列出的静态列保持原序排在后面
      const presetOrders = new Map(preset.visibleKeys.map((key, index) => [key, index]))
      columns.value
        .filter((column) => !column.dynamic && presetOrders.has(column.key))
        .forEach((column) => {
          column.order = presetOrders.get(column.key) ?? column.order
        })

      let tail = preset.visibleKeys.length
      const rest = columns.value
        .filter(
          (column) =>
            !column.dynamic &&
            !column.key.startsWith(SCORE_COLUMN_PREFIX) &&
            !presetOrders.has(column.key),
        )
        .sort((a, b) => a.order - b.order)
      rest.forEach((column) => {
        column.order = tail
        tail += 1
      })

      // 动态收入列按锚点插入，如「工资表」预设要求绩效、饭票紧跟应发工资
      const anchorOrder =
        preset.incomeColumnAfter !== undefined
          ? presetOrders.get(preset.incomeColumnAfter)
          : undefined
      const dynamicBase = anchorOrder !== undefined ? anchorOrder + 0.5 : tail
      columns.value
        .filter((column) => column.dynamic)
        .sort((a, b) => a.order - b.order)
        .forEach((column, index) => {
          column.order = dynamicBase + index / 100
        })

      // 计分制分数列贴在对应金额列之后
      columns.value
        .filter((column) => column.key.startsWith(SCORE_COLUMN_PREFIX))
        .forEach((column) => {
          const itemId = column.key.slice(SCORE_COLUMN_PREFIX.length)
          const amountColumn = columns.value.find((item) => item.key === itemId)
          if (amountColumn) column.order = amountColumn.order + 0.001
        })

      activePresetId.value = id
    }

    function savePreset(name: string) {
      const preset: ColumnPreset = {
        id: createId('preset'),
        name,
        builtin: false,
        visibleKeys: visibleColumns.value
          .filter(
            (column) =>
              !column.dynamic && !column.key.startsWith(SCORE_COLUMN_PREFIX),
          )
          .map((column) => column.key),
        includeIncomeColumns: visibleColumns.value.some(
          (column) => column.dynamic || column.key.startsWith(SCORE_COLUMN_PREFIX),
        ),
      }
      presets.value.push(preset)
      activePresetId.value = preset.id
      return preset
    }

    function removePreset(id: string) {
      presets.value = presets.value.filter((item) => !item.builtin || item.id !== id)
      if (activePresetId.value === id) activePresetId.value = DEFAULT_PRESET_ID
    }

    function resetColumns() {
      columns.value = createStaticColumns()
      applyPreset(DEFAULT_PRESET_ID)
    }

    /** 导出纯 JSON 快照，避免把响应式代理写进配置文件 */
    function exportSchema(): TableSchemaSnapshot {
      return JSON.parse(
        JSON.stringify({
          columns: columns.value,
          presets: presets.value,
          activePresetId: activePresetId.value,
        }),
      ) as TableSchemaSnapshot
    }

    /**
     * 导入表格 Schema
     * 自定义列带逐月金额且参与计税，属于计算结果的一部分，因此必须随配置一起迁移；
     * 对旧版本或手工编辑过的文件做字段兜底，避免脏数据打散整张表
     */
    function importSchema(payload?: Partial<TableSchemaSnapshot>) {
      if (Array.isArray(payload?.columns)) {
        const imported = payload.columns
          .filter(
            (column): column is ColumnSchema =>
              typeof column?.key === 'string' && typeof column?.label === 'string',
          )
          .map((column) => {
            const custom = column.custom
            return {
              ...column,
              group: column.group ?? 'income',
              visible: column.visible !== false,
              order: Number.isFinite(column.order) ? column.order : 0,
              width: Number.isFinite(column.width) ? column.width : 120,
              formatter: column.formatter ?? 'money',
              dynamic: column.dynamic === true,
              custom: custom
                ? {
                    values: normalizeValues(custom.values),
                    intoGross: custom.intoGross !== false,
                    taxable: custom.taxable !== false,
                    intoBase: custom.intoBase === true,
                  }
                : undefined,
            }
          })
        if (imported.length > 0) columns.value = imported
      }

      if (Array.isArray(payload?.presets)) {
        const importedPresets = payload.presets
          .filter(
            (preset): preset is ColumnPreset =>
              typeof preset?.id === 'string' && typeof preset?.name === 'string',
          )
          .map((preset) => ({
            ...preset,
            builtin: preset.builtin === true,
            visibleKeys: Array.isArray(preset.visibleKeys) ? preset.visibleKeys : [],
            includeIncomeColumns: preset.includeIncomeColumns !== false,
          }))
        if (importedPresets.length > 0) presets.value = importedPresets
      }

      if (typeof payload?.activePresetId === 'string') {
        activePresetId.value = payload.activePresetId
      }
    }

    return {
      columns,
      presets,
      activePresetId,
      visibleColumns,
      columnsByGroup,
      customColumns,
      customColumnItems,
      syncDynamicColumns,
      syncStaticColumns,
      syncBuiltinPresets,
      syncPostTaxColumns,
      syncScoreColumns,
      addCustomColumn,
      removeCustomColumn,
      updateCustomColumn,
      setCustomValue,
      updateColumn,
      toggleColumn,
      reorderColumns,
      setVisibleKeys,
      applyPreset,
      savePreset,
      removePreset,
      resetColumns,
      exportSchema,
      importSchema,
    }
  },
  { persist: { key: 'salary-calc:table-schema' } },
)
