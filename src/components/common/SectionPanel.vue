<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/common/SectionPanel.vue
 * @Description: 通用分页面板，统一 HUD 式章节页眉与玻璃面板容器
 */
interface Props {
  /** 章节序号，如 01 */
  index: string
  title: string
  desc: string
  /** 右侧状态胶囊 */
  meta?: string
}

const props = withDefaults(defineProps<Props>(), {
  meta: '',
})
</script>

<template>
  <el-card shadow="never" class="section-panel ledger-card">
    <template #header>
      <div class="section-panel__head">
        <span class="section-panel__index">{{ props.index }}</span>
        <div class="section-panel__titles">
          <h2 class="section-panel__title">{{ props.title }}</h2>
          <p class="section-panel__desc">{{ props.desc }}</p>
        </div>
        <span v-if="props.meta" class="section-panel__meta">{{ props.meta }}</span>
      </div>
    </template>
    <div class="section-panel__body">
      <slot />
    </div>
  </el-card>
</template>

<style scoped>
.section-panel :deep(.el-card__header) {
  padding: 0;
  border-bottom: 1px solid var(--app-line);
}

.section-panel :deep(.el-card__body) {
  padding: 0;
}

/* HUD 式页眉：方括号章节号 + 竖分隔线 + 标题说明 */
.section-panel__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  padding: 18px 20px 16px;
}

.section-panel__index {
  min-width: 36px;
  margin: 0;
  padding: 0 2px 0 0;
  color: var(--app-jade-600);
  font-family: var(--app-font-ledger);
  font-size: 23px;
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: 0.04em;
}

.section-panel__index::before {
  margin-right: 1px;
  color: var(--app-ink-300);
  font-size: 15px;
  content: '[';
}

.section-panel__index::after {
  margin-left: 1px;
  color: var(--app-ink-300);
  font-size: 15px;
  content: ']';
}

.section-panel__titles {
  min-width: 0;
  padding-left: 14px;
  border-left: 1px solid var(--app-line);
}

.section-panel__title {
  margin: 0;
  font-size: var(--app-text-lg);
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--app-ink-900);
}

.section-panel__desc {
  margin: 3px 0 0;
  font-size: var(--app-text-base);
  line-height: 1.55;
  color: var(--app-ink-500);
}

.section-panel__meta {
  margin-top: 2px;
  padding: 3px 10px;
  border: 1px solid var(--app-line);
  border-radius: 999px;
  color: var(--app-jade-700);
  background: var(--app-jade-100);
  font-family: var(--app-font-num);
  font-size: var(--app-text-sm);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.section-panel__body {
  padding: 18px 20px 20px;
}

@media (max-width: 640px) {
  .section-panel__head {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    padding: 15px 16px 13px;
  }

  .section-panel__index {
    min-width: 30px;
    font-size: 24px;
  }

  .section-panel__meta {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .section-panel__body {
    padding: 15px 16px 17px;
  }
}
</style>
