<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/AdminSidebar.vue
 * @Description: 管理后台风格侧边菜单：视图切换与当前页面分区目录
 */
import { computed } from 'vue'
import { DataLine, EditPen, Histogram } from '@element-plus/icons-vue'
import type { AppView, NavItem } from '@/types'

interface Props {
  /** 当前视图 */
  view: AppView
  /** 当前激活分区 */
  activeSection: string
  /** 录入设置分区 */
  setupItems: NavItem[]
  /** 月度明细分区 */
  tableItems: NavItem[]
  /** 方案对比页没有分区，留空即可 */
  compareItems?: NavItem[]
  /** 桌面端收起侧边栏 */
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compareItems: () => [],
  collapsed: false,
})

const emit = defineEmits<{
  'select-view': [view: AppView]
  'select-section': [key: string]
}>()

const items = computed(() => {
  if (props.view === 'setup') return props.setupItems
  if (props.view === 'table') return props.tableItems
  return props.compareItems
})

function sectionTitle(item: NavItem): string {
  return item.meta ? `${item.label} · ${item.meta}` : item.label
}
</script>

<template>
  <div class="admin-sidebar" :class="{ 'is-collapsed': props.collapsed }">
    <div class="admin-sidebar__brand">
      <span class="admin-sidebar__mark" aria-hidden="true">薪</span>
      <div v-if="!props.collapsed" class="admin-sidebar__brand-text">
        <strong>薪资计算器</strong>
        <span>税前税后 · 年度汇算</span>
      </div>
    </div>

    <div class="admin-sidebar__scroll">
      <div class="admin-menu">
        <p v-if="!props.collapsed" class="admin-menu__title">视图</p>
        <button
          type="button"
          class="admin-menu__item"
          :class="{ 'is-active': props.view === 'setup' }"
          :aria-current="props.view === 'setup' ? 'page' : undefined"
          title="录入设置"
          @click="emit('select-view', 'setup')"
        >
          <el-icon class="admin-menu__icon"><EditPen /></el-icon>
          <span v-if="!props.collapsed" class="admin-menu__label">录入设置</span>
        </button>
        <button
          type="button"
          class="admin-menu__item"
          :class="{ 'is-active': props.view === 'table' }"
          :aria-current="props.view === 'table' ? 'page' : undefined"
          title="月度明细"
          @click="emit('select-view', 'table')"
        >
          <el-icon class="admin-menu__icon"><DataLine /></el-icon>
          <span v-if="!props.collapsed" class="admin-menu__label">月度明细</span>
        </button>
        <button
          type="button"
          class="admin-menu__item"
          :class="{ 'is-active': props.view === 'compare' }"
          :aria-current="props.view === 'compare' ? 'page' : undefined"
          title="方案对比"
          @click="emit('select-view', 'compare')"
        >
          <el-icon class="admin-menu__icon"><Histogram /></el-icon>
          <span v-if="!props.collapsed" class="admin-menu__label">方案对比</span>
        </button>
      </div>

      <div v-if="items.length" class="admin-menu">
        <p v-if="!props.collapsed" class="admin-menu__title">本页目录</p>
        <button
          v-for="item in items"
          :key="item.key"
          type="button"
          class="admin-menu__item admin-menu__item--section"
          :class="{ 'is-active': item.key === props.activeSection }"
          :aria-current="item.key === props.activeSection ? 'page' : undefined"
          :title="sectionTitle(item)"
          @click="emit('select-section', item.key)"
        >
          <span class="admin-menu__index">{{ item.index ?? '·' }}</span>
          <span v-if="!props.collapsed" class="admin-menu__text">
            <span class="admin-menu__label">{{ item.label }}</span>
            <span v-if="item.meta" class="admin-menu__meta">{{ item.meta }}</span>
          </span>
        </button>
      </div>
    </div>

    <div v-if="!props.collapsed" class="admin-sidebar__foot">
      数据保存在本机浏览器
    </div>
  </div>
</template>

<style scoped>
.admin-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--app-line);
  background:
    radial-gradient(circle at 0% 0%, rgb(34 211 238 / 12%), transparent 42%),
    linear-gradient(180deg, #050b15 0%, #070e1a 100%);
  color: #b8c4d4;
}

.admin-sidebar__brand {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-line);
}

.admin-sidebar__mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgb(34 211 238 / 45%);
  border-radius: 8px;
  background: linear-gradient(135deg, #22d3ee, #0891b2);
  color: #04070d;
  font-family: var(--app-font-ledger);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  box-shadow:
    0 0 18px rgb(34 211 238 / 45%),
    inset 0 1px 0 rgb(255 255 255 / 35%);
}

.admin-sidebar__brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.admin-sidebar__brand-text strong {
  overflow: hidden;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.admin-sidebar__brand-text span {
  overflow: hidden;
  color: #5f7a96;
  font-size: 10px;
  letter-spacing: 0.06em;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.admin-sidebar__scroll {
  flex: 1;
  min-height: 0;
  padding: 10px 8px 12px;
  overflow-y: auto;
  scrollbar-color: rgb(255 255 255 / 16%) transparent;
  scrollbar-width: thin;
}

.admin-sidebar__scroll::-webkit-scrollbar-thumb {
  background: rgb(255 255 255 / 16%);
  background-clip: padding-box;
  border: 3px solid transparent;
  border-radius: 8px;
}

.admin-sidebar__scroll::-webkit-scrollbar-thumb:hover {
  background-color: #22d3ee;
}

.admin-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

.admin-menu__title {
  margin: 0;
  padding: 8px 12px 4px;
  color: #5c7592;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.admin-menu__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #a9bdd4;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s,
    border-color 0.18s,
    color 0.18s;
}

.admin-menu__item:hover {
  background: rgb(34 211 238 / 6%);
  border-color: rgb(34 211 238 / 14%);
  color: #fff;
}

.admin-menu__item.is-active {
  background: linear-gradient(90deg, rgb(34 211 238 / 16%), rgb(34 211 238 / 5%));
  border-color: rgb(34 211 238 / 35%);
  color: #fff;
  box-shadow: inset 0 0 18px -8px rgb(34 211 238 / 60%);
}

.admin-menu__item.is-active::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -1px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #22d3ee;
  box-shadow: 0 0 12px #22d3ee;
  content: '';
}

.admin-menu__icon {
  flex: none;
  color: #6f88a4;
  font-size: 15px;
}

.admin-menu__item.is-active .admin-menu__icon {
  color: #22d3ee;
  filter: drop-shadow(0 0 6px rgb(34 211 238 / 70%));
}

.admin-menu__index {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgb(34 211 238 / 18%);
  border-radius: 5px;
  color: #6f88a4;
  font-family: var(--app-font-num);
  font-size: 9.5px;
  line-height: 1;
}

.admin-menu__item.is-active .admin-menu__index {
  border-color: transparent;
  background: #22d3ee;
  color: #04070d;
  box-shadow: 0 0 12px rgb(34 211 238 / 55%);
}

.admin-menu__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.admin-menu__label {
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.35;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.admin-menu__meta {
  overflow: hidden;
  color: #5c7592;
  font-size: 10px;
  line-height: 1.35;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.admin-menu__item.is-active .admin-menu__meta {
  color: #7dd3fc;
}

.admin-sidebar__foot {
  flex: none;
  padding: 12px 16px;
  border-top: 1px solid var(--app-line);
  color: #4f6983;
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.is-collapsed .admin-sidebar__brand {
  justify-content: center;
  padding: 0;
}

.is-collapsed .admin-sidebar__scroll {
  padding: 10px 8px;
}

.is-collapsed .admin-menu__item {
  justify-content: center;
  padding: 8px 0;
}

.is-collapsed .admin-menu__title,
.is-collapsed .admin-sidebar__brand-text,
.is-collapsed .admin-menu__text,
.is-collapsed .admin-sidebar__foot {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .admin-menu__item {
    transition: none;
  }
}
</style>
