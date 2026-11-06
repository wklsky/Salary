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
  border-right: 1px solid rgb(255 255 255 / 6%);
  background: linear-gradient(180deg, #1b2a3d 0%, #152235 100%);
  color: #b8c4d4;
}

.admin-sidebar__brand {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 16px;
  border-bottom: 1px solid rgb(255 255 255 / 6%);
}

.admin-sidebar__mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(135deg, #0f766e, #0b5e57);
  color: #fff;
  font-family: var(--app-font-ledger);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 8px 16px -10px rgb(15 118 110 / 90%);
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
  color: #7f90a6;
  font-size: 10px;
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
  background-color: #7dd3c7;
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
  color: #6f8198;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
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
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #b8c4d4;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s,
    color 0.18s;
}

.admin-menu__item:hover {
  background: rgb(255 255 255 / 6%);
  color: #fff;
}

.admin-menu__item.is-active {
  background: rgb(15 118 110 / 26%);
  color: #fff;
}

.admin-menu__item.is-active::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #7dd3c7;
  content: '';
}

.admin-menu__icon {
  flex: none;
  color: #8fa2b7;
  font-size: 15px;
}

.admin-menu__item.is-active .admin-menu__icon {
  color: #7dd3c7;
}

.admin-menu__index {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 5px;
  color: #8fa2b7;
  font-family: var(--app-font-num);
  font-size: 9.5px;
  line-height: 1;
}

.admin-menu__item.is-active .admin-menu__index {
  border-color: transparent;
  background: #0f766e;
  color: #fff;
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
  color: #72859b;
  font-size: 10px;
  line-height: 1.35;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.admin-menu__item.is-active .admin-menu__meta {
  color: #9fe3d8;
}

.admin-sidebar__foot {
  flex: none;
  padding: 12px 16px;
  border-top: 1px solid rgb(255 255 255 / 6%);
  color: #65778e;
  font-size: 10.5px;
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
