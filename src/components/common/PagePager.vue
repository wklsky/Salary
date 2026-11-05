<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/common/PagePager.vue
 * @Description: 通用分页页脚：账本式页码 + 上一页/下一页
 */
interface Props {
  /** 页码，如 01 / 07 */
  progress: string
  /** 上一页名称；为空时不显示上一页 */
  prevLabel?: string
  /** 下一页名称；为空时显示 lastLabel 按钮 */
  nextLabel?: string
  /** 最后一页的跨视图按钮文案 */
  lastLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  prevLabel: '',
  nextLabel: '',
  lastLabel: '',
})

const emit = defineEmits<{
  prev: []
  next: []
  last: []
}>()
</script>

<template>
  <div class="page-pager">
    <span class="page-pager__progress">{{ props.progress }}</span>
    <el-button v-if="props.prevLabel" size="small" @click="emit('prev')">
      ← {{ props.prevLabel }}
    </el-button>
    <span class="page-pager__spacer" />
    <el-button v-if="props.nextLabel" size="small" @click="emit('next')">
      {{ props.nextLabel }} →
    </el-button>
    <el-button v-else-if="props.lastLabel" size="small" type="primary" @click="emit('last')">
      {{ props.lastLabel }}
    </el-button>
  </div>
</template>

<style scoped>
.page-pager {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 2px 6px;
  border-top: 1px dashed var(--app-line-strong);
}

.page-pager__progress {
  color: var(--app-ink-500);
  font-family: var(--app-font-ledger);
  font-size: 11.5px;
  letter-spacing: 0.1em;
}

.page-pager__spacer {
  flex: 1;
}
</style>
