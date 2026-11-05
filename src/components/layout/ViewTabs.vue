<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/ViewTabs.vue
 * @Description: 主视图标签页，使用 Element Plus Tabs 承载录入设置 / 月度明细切换
 */
import type { AppView } from '@/types'

interface Props {
  modelValue: AppView
  items: { value: AppView; label: string }[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: AppView]
}>()

function onChange(value: string | number) {
  emit('update:modelValue', value as AppView)
}
</script>

<template>
  <el-tabs
    :model-value="props.modelValue"
    type="card"
    class="view-tabs"
    @update:model-value="onChange"
  >
    <el-tab-pane v-for="item in props.items" :key="item.value" :name="item.value">
      <template #label>
        <span class="view-tabs__label">
          <i class="view-tabs__dot" aria-hidden="true" />
          {{ item.label }}
        </span>
      </template>
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.view-tabs :deep(.el-tabs__content) {
  display: none;
}

.view-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.view-tabs :deep(.el-tabs__nav-wrap) {
  padding-top: 2px;
}

.view-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.view-tabs :deep(.el-tabs__nav) {
  border: 0;
}

.view-tabs :deep(.el-tabs__item) {
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--app-line);
  border-radius: 3px;
  background: #fff;
  color: var(--app-ink-500);
  font-size: 12px;
  line-height: 24px;
}

.view-tabs :deep(.el-tabs__item + .el-tabs__item) {
  margin-left: 6px;
}

.view-tabs :deep(.el-tabs__item.is-active) {
  border-color: var(--app-jade-600);
  background: var(--app-jade-100);
  color: var(--app-jade-700);
  font-weight: 600;
}

.view-tabs__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.view-tabs__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.75;
}
</style>
