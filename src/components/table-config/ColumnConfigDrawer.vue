<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/table-config/ColumnConfigDrawer.vue
 * @Description: 表格组成项配置抽屉：预设切换、列的显隐/排序/重命名与自定义预设保存
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import { Delete, Plus, Rank } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { COLUMN_GROUP_LABELS } from '@/config/columns'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import type { ColumnGroup, ColumnSchema } from '@/types'

interface Props {
  /** 抽屉是否展开 */
  modelValue: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
})

/**
 * 对外事件
 * @event update:model-value 抽屉展开状态变化，回传 { value: boolean }
 */
const emit = defineEmits<{
  'update:model-value': [value: boolean]
}>()

const schemaStore = useTableSchemaStore()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:model-value', value),
})

const selectedColumns = computed(() => schemaStore.visibleColumns)
const optionalColumns = computed(() => schemaStore.columns.filter((column) => !column.visible))

const listRef = ref<HTMLElement | null>(null)
let sortableInstance: Sortable | null = null

/** 从 DOM 读取拖拽后的列顺序并回写 Schema */
function flushOrderFromDom() {
  const nodes = listRef.value?.querySelectorAll<HTMLElement>('[data-column-key]')
  if (!nodes) return
  const keys = Array.from(nodes).map((node) => node.dataset.columnKey ?? '')
  schemaStore.reorderColumns(keys)
}

function destroySortable() {
  sortableInstance?.destroy()
  sortableInstance = null
}

function initSortable() {
  destroySortable()
  if (!listRef.value) return
  sortableInstance = Sortable.create(listRef.value, {
    handle: '.drag-handle',
    animation: 160,
    onEnd: flushOrderFromDom,
  })
}

// 抽屉懒渲染，展开后才能拿到列表 DOM，故在 nextTick 后初始化拖拽
watch(visible, async (value) => {
  if (!value) {
    destroySortable()
    return
  }
  await nextTick()
  initSortable()
})

// 组件卸载时销毁 sortablejs 实例，避免残留全局事件监听
onBeforeUnmount(destroySortable)

function onPresetChange(id: string) {
  schemaStore.applyPreset(id)
}

async function onSavePreset() {
  try {
    const { value } = await ElMessageBox.prompt('输入预设名称', '另存为预设', {
      inputPlaceholder: '例如：我的薪酬口径',
      inputValidator: (input: string) => (input.trim().length > 0 ? true : '名称不能为空'),
    })
    schemaStore.savePreset(value.trim())
    ElMessage.success('预设已保存')
  } catch (error) {
    // 用户取消输入时 ElMessageBox 会抛出 cancel，此处静默处理
    if (error !== 'cancel') console.error('[salary] 保存列预设失败', error)
  }
}

function onRemovePreset(id: string) {
  schemaStore.removePreset(id)
}

function hideColumn(column: ColumnSchema) {
  schemaStore.toggleColumn(column.key, false)
}

function showColumn(column: ColumnSchema) {
  schemaStore.toggleColumn(column.key, true)
}

function onRename(column: ColumnSchema, value: string) {
  schemaStore.updateColumn(column.key, { customLabel: value })
}

function onWidthChange(column: ColumnSchema, value: number) {
  schemaStore.updateColumn(column.key, { width: Math.round(value ?? 120) })
}

/** 按分组输出可添加列，保持与列注册表一致的归类顺序 */
const optionalGroups = computed(() => {
  const map = new Map<ColumnGroup, ColumnSchema[]>()
  optionalColumns.value.forEach((column) => {
    const list = map.get(column.group) ?? []
    list.push(column)
    map.set(column.group, list)
  })
  return Array.from(map.entries())
})

function onSelectAll() {
  schemaStore.setVisibleKeys(schemaStore.columns.map((column) => column.key))
}

const newColumnName = ref('')

/** 新增自定义列：自带 12 个月的数值，可在单月编辑里逐月填写并参与计算 */
function onAddCustomColumn() {
  const name = newColumnName.value.trim()
  if (!name) {
    ElMessage.warning('请输入列名称')
    return
  }
  schemaStore.addCustomColumn(name)
  newColumnName.value = ''
  ElMessage.success('已添加自定义列，可在明细页点击月份填写金额')
}

function onRemoveCustomColumn(column: ColumnSchema) {
  schemaStore.removeCustomColumn(column.key)
}

function onCustomFlagChange(column: ColumnSchema, field: 'intoGross' | 'taxable' | 'intoBase', value: boolean) {
  schemaStore.updateCustomColumn(column.key, { [field]: value })
}
</script>

<template>
  <el-drawer v-model="visible" title="表格组成项配置" size="52%">
    <div class="column-config">
      <section class="preset-section">
        <div class="preset-section__row">
          <span class="section-title">预设模板</span>
          <el-select
            :model-value="schemaStore.activePresetId || ''"
            size="small"
            placeholder="自定义"
            class="preset-select"
            @update:model-value="onPresetChange"
          >
            <el-option
              v-for="preset in schemaStore.presets"
              :key="preset.id"
              :label="preset.name"
              :value="preset.id"
            />
          </el-select>
          <el-button size="small" @click="onSavePreset">另存为</el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :disabled="!schemaStore.activePresetId || schemaStore.presets.find((p) => p.id === schemaStore.activePresetId)?.builtin"
            @click="onRemovePreset(schemaStore.activePresetId)"
          >
            删除
          </el-button>
          <el-button size="small" type="primary" plain @click="schemaStore.resetColumns()">
            恢复默认
          </el-button>
        </div>
      </section>

      <div class="column-config__body">
        <section class="panel">
          <header class="panel__head">
            <span class="section-title">已展示列（拖拽排序）</span>
            <span class="panel__count">{{ selectedColumns.length }}</span>
          </header>
          <ul ref="listRef" class="column-list">
            <li
              v-for="column in selectedColumns"
              :key="column.key"
              :data-column-key="column.key"
              class="column-item"
            >
              <el-icon class="drag-handle"><Rank /></el-icon>
              <el-input
                :model-value="column.customLabel || column.label"
                size="small"
                class="column-item__name"
                @update:model-value="(value: string) => onRename(column, value)"
              />
              <el-input-number
                :model-value="column.width ?? 120"
                :min="60"
                :max="320"
                :step="10"
                size="small"
                controls-position="right"
                class="column-item__width"
                @update:model-value="(value: number) => onWidthChange(column, value)"
              />
              <el-button :icon="Delete" size="small" text type="danger" @click="hideColumn(column)" />
            </li>
          </ul>
        </section>

        <section class="panel">
          <header class="panel__head">
            <span class="section-title">可添加列</span>
            <el-button link type="primary" size="small" @click="onSelectAll">全部添加</el-button>
          </header>
          <div class="optional-list">
            <div v-for="[group, list] in optionalGroups" :key="group" class="optional-group">
              <p class="optional-group__title">{{ COLUMN_GROUP_LABELS[group] }}</p>
              <div class="optional-group__items">
                <el-checkbox
                  v-for="column in list"
                  :key="column.key"
                  :model-value="false"
                  size="small"
                  @update:model-value="showColumn(column)"
                >
                  {{ column.customLabel || column.label }}
                </el-checkbox>
              </div>
            </div>
            <el-empty v-if="optionalColumns.length === 0" description="全部列均已展示" :image-size="60" />
          </div>
        </section>
      </div>

      <section class="panel custom-panel">
        <header class="panel__head">
          <span class="section-title">自定义列</span>
          <span class="panel__count">{{ schemaStore.customColumns.length }}</span>
        </header>

        <div class="custom-add">
          <el-input
            v-model="newColumnName"
            size="small"
            placeholder="列名称，如「项目奖金」「补贴」"
            class="custom-add__input"
            @keyup.enter="onAddCustomColumn"
          />
          <el-button size="small" type="primary" :icon="Plus" @click="onAddCustomColumn">
            添加表头
          </el-button>
        </div>

        <ul class="custom-list">
          <li v-for="column in schemaStore.customColumns" :key="column.key" class="custom-item">
            <div class="custom-item__head">
              <el-input
                :model-value="column.customLabel || column.label"
                size="small"
                class="custom-item__name"
                @update:model-value="(value: string) => onRename(column, value)"
              />
              <el-button
                :icon="Delete"
                size="small"
                text
                type="danger"
                @click="onRemoveCustomColumn(column)"
              />
            </div>
            <div class="custom-item__flags">
              <el-checkbox
                :model-value="column.custom?.intoGross ?? true"
                size="small"
                @update:model-value="
                  (value: boolean) => onCustomFlagChange(column, 'intoGross', value)
                "
              >
                计入应发
              </el-checkbox>
              <el-checkbox
                :model-value="column.custom?.taxable ?? true"
                size="small"
                :disabled="!column.custom?.intoGross"
                @update:model-value="
                  (value: boolean) => onCustomFlagChange(column, 'taxable', value)
                "
              >
                并入综合所得
              </el-checkbox>
              <el-checkbox
                :model-value="column.custom?.intoBase ?? false"
                size="small"
                :disabled="!column.custom?.intoGross"
                @update:model-value="
                  (value: boolean) => onCustomFlagChange(column, 'intoBase', value)
                "
              >
                计入缴费基数
              </el-checkbox>
            </div>
          </li>
        </ul>
        <p class="custom-tip">
          自定义列的金额在明细页点击对应月份填写；未勾选「计入应发」时该列仅作展示，不影响工资计算
        </p>
      </section>
    </div>
  </el-drawer>
</template>

<style scoped>
.column-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.preset-section__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preset-select {
  width: 200px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.column-config__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.column-list {
  flex: 1;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.column-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}

.drag-handle {
  cursor: move;
  color: var(--el-text-color-secondary);
}

.column-item__name {
  flex: 1;
}

.column-item__width {
  width: 96px;
}

.optional-list {
  flex: 1;
  overflow-y: auto;
}

.optional-group {
  margin-bottom: 12px;
}

.optional-group__title {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.optional-group__items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.custom-panel {
  flex: none;
}

.custom-add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.custom-add__input {
  max-width: 260px;
}

.custom-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
  list-style: none;
}

.custom-item {
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.custom-item__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.custom-item__name {
  flex: 1;
}

.custom-item__flags {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.custom-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
