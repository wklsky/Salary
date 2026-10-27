/**
 * @Author: wj
 * @FilePath: src/stores/useTableSchemaStore.ts
 * @Description: 表格列 Schema 管理：动态收入列同步、可见性/顺序调整与预设模板
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createStaticColumns } from '@/config/columns'
import { COLUMN_PRESETS, DEFAULT_PRESET_ID } from '@/config/presets'
import { createId } from '@/utils/id'
import type { ColumnGroup, ColumnPreset, ColumnSchema, IncomeItem } from '@/types'

/** 动态收入列的起始排序值，落在静态收入列区间内 */
const DYNAMIC_COLUMN_ORDER_BASE = 150

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

    /** 动态列是否可见取决于当前预设的 includeIncomeColumns 开关 */
    function isIncomeColumnVisibleByPreset(): boolean {
      const preset = presets.value.find((item) => item.id === activePresetId.value)
      return preset?.includeIncomeColumns ?? true
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
        column.visible = column.dynamic ? preset.includeIncomeColumns : visibleSet.has(column.key)
      })
      // 预设中键的顺序即展示顺序，未列出的列保持原序排在后面
      const presetOrders = new Map(preset.visibleKeys.map((key, index) => [key, index]))
      let tail = preset.visibleKeys.length
      const rest = columns.value
        .filter((column) => !presetOrders.has(column.key))
        .sort((a, b) => a.order - b.order)
      columns.value.forEach((column) => {
        const order = presetOrders.get(column.key)
        column.order = order ?? tail
      })
      rest.forEach((column) => {
        column.order = tail
        tail += 1
      })
      activePresetId.value = id
    }

    function savePreset(name: string) {
      const preset: ColumnPreset = {
        id: createId('preset'),
        name,
        builtin: false,
        visibleKeys: visibleColumns.value.filter((column) => !column.dynamic).map((column) => column.key),
        includeIncomeColumns: visibleColumns.value.some((column) => column.dynamic),
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

    return {
      columns,
      presets,
      activePresetId,
      visibleColumns,
      columnsByGroup,
      syncDynamicColumns,
      updateColumn,
      toggleColumn,
      reorderColumns,
      setVisibleKeys,
      applyPreset,
      savePreset,
      removePreset,
      resetColumns,
    }
  },
  { persist: { key: 'salary-calc:table-schema' } },
)
