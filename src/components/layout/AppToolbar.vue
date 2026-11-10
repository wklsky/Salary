<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/AppToolbar.vue
 * @Description: 顶栏：视图标题、年度到手、方案存档、导出导入、撤销重做与主题切换
 */
import {
  Check,
  Delete,
  Download,
  Expand,
  Fold,
  FolderOpened,
  Monitor,
  Moon,
  MoreFilled,
  Plus,
  Refresh,
  RefreshLeft,
  RefreshRight,
  Sunny,
  Upload,
  Warning,
} from '@element-plus/icons-vue'
import type { SalaryScheme } from '@/stores/useSalaryStore'

defineProps<{
  title: string
  section?: string
  netValue: number
  schemes: SalaryScheme[]
  activeSchemeId: string
  isDark: boolean
  isSystem: boolean
  canUndo: boolean
  canRedo: boolean
  isNarrow: boolean
  collapsed: boolean
  /** 有数据但久未导出时，顶栏提示备份 */
  backupDue: boolean
}>()

const activeSchemeId = defineModel<string>('activeSchemeId', { default: '' })

const emit = defineEmits<{
  'toggle-sidebar': []
  'scheme-command': [command: string]
  'more-command': [command: string]
  undo: []
  redo: []
  'toggle-theme': []
  backup: []
}>()
</script>

<template>
  <header class="app__navbar">
    <div class="app__navbar-left">
      <button
        type="button"
        class="app__toggle"
        :aria-label="isNarrow ? '打开菜单' : collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="emit('toggle-sidebar')"
      >
        <el-icon>
          <Expand v-if="isNarrow || collapsed" />
          <Fold v-else />
        </el-icon>
      </button>

      <strong class="app__view-title">{{ title }}</strong>
      <span v-if="section" class="app__view-section">{{ section }}</span>
    </div>

    <div class="app__actions">
      <div class="app__net">
        <span class="app__net-label">年度到手</span>
        <strong class="app__net-value num">
          ¥{{ netValue.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }}
        </strong>
      </div>
      <el-select v-model="activeSchemeId" size="small" placeholder="方案存档" class="scheme-select">
        <el-option v-for="scheme in schemes" :key="scheme.id" :label="scheme.name" :value="scheme.id" />
      </el-select>
      <el-dropdown trigger="click" @command="(command: string) => emit('scheme-command', command)">
        <el-button size="small" :icon="FolderOpened" text>方案</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="save" :icon="Plus">存为当前方案</el-dropdown-item>
            <el-dropdown-item command="apply" :icon="Check" :disabled="!activeSchemeId">
              应用所选方案
            </el-dropdown-item>
            <el-dropdown-item command="remove" :icon="Delete" :disabled="!activeSchemeId" divided>
              删除所选方案
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown trigger="click" @command="(command: string) => emit('more-command', command)">
        <el-button size="small" :icon="MoreFilled" text>更多</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="export" :icon="Download">导出备份</el-dropdown-item>
            <el-dropdown-item command="import" :icon="Upload">导入备份</el-dropdown-item>
            <el-dropdown-item command="restore-backup" :icon="RefreshLeft">
              从本地备份恢复
            </el-dropdown-item>
            <el-dropdown-item command="theme-system" :icon="Monitor" :disabled="isSystem">
              跟随系统主题
            </el-dropdown-item>
            <el-dropdown-item command="reset" :icon="Refresh" divided>重置数据</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip
        v-if="backupDue"
        content="数据只存在本机，导出后才有副本；建议每周备份一次"
        placement="bottom"
      >
        <button type="button" class="app__backup" @click="emit('backup')">
          <el-icon><Warning /></el-icon>
          <span>建议备份</span>
        </button>
      </el-tooltip>
      <el-tooltip content="撤销（Ctrl+Z）" placement="bottom">
        <button
          type="button"
          class="app__theme-toggle"
          :disabled="!canUndo"
          aria-label="撤销"
          @click="emit('undo')"
        >
          <el-icon><RefreshLeft /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="重做（Ctrl+Shift+Z）" placement="bottom">
        <button
          type="button"
          class="app__theme-toggle"
          :disabled="!canRedo"
          aria-label="重做"
          @click="emit('redo')"
        >
          <el-icon><RefreshRight /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip :content="isDark ? '切换到浅色' : '切换到深色'" placement="bottom">
        <button
          type="button"
          class="app__theme-toggle"
          :aria-label="isDark ? '切换到浅色' : '切换到深色'"
          @click="emit('toggle-theme')"
        >
          <el-icon>
            <Sunny v-if="isDark" />
            <Moon v-else />
          </el-icon>
        </button>
      </el-tooltip>
    </div>
  </header>
</template>

<style scoped>
.app__navbar {
  position: relative;
  z-index: 20;
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  min-height: 52px;
  padding: 6px 18px;
  background: color-mix(in srgb, var(--app-surface) 70%, transparent);
  border-bottom: 1px solid var(--app-line);
  backdrop-filter: blur(18px);
}

/* 底部一条渐隐的青色光带，像 HUD 面板的接缝 */
.app__navbar::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 1px;
  pointer-events: none;
  content: '';
  background: linear-gradient(90deg, transparent, var(--app-bracket), transparent);
}

.app__navbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app__toggle {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-ink-500);
  font-size: 17px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.app__toggle:hover {
  background: var(--app-sunken-2);
  color: var(--app-ink-900);
}

.app__toggle:focus-visible {
  outline: 2px solid var(--app-jade-600);
  outline-offset: 1px;
}

.app__view-title {
  overflow: hidden;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--app-ink-900);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.app__view-section {
  overflow: hidden;
  font-size: 12px;
  color: var(--app-ink-500);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.app__view-section::before {
  margin-right: 8px;
  color: var(--app-line-strong);
  content: '·';
}

.app__actions {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.app__net {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-right: 2px;
  padding-right: 12px;
  border-right: 1px solid var(--app-line);
}

.app__net-label {
  font-size: 11px;
  color: var(--app-ink-500);
}

.app__net-value {
  font-size: 16px;
  line-height: 1.2;
  color: var(--app-jade-600);
  text-shadow: 0 0 18px var(--app-glow);
}

.scheme-select {
  width: 148px;
}

/* 备份提醒：琥珀色小胶囊，只在久未导出时出现 */
.app__backup {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--el-color-warning) 42%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
  color: var(--el-color-warning);
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.app__backup:hover {
  border-color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 20%, transparent);
}

.app__backup .el-icon {
  font-size: 12px;
}

/* 主题切换：比普通按钮更轻，只在悬停时浮出底色 */
.app__theme-toggle {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--app-line);
  border-radius: 6px;
  background: var(--app-surface);
  color: var(--app-ink-500);
  font-size: 15px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.app__theme-toggle:hover {
  border-color: var(--app-jade-600);
  background: var(--app-jade-100);
  color: var(--app-jade-700);
}

.app__theme-toggle:disabled {
  border-color: var(--app-line);
  background: var(--app-surface);
  color: var(--app-ink-300);
  cursor: not-allowed;
  opacity: 0.6;
}

.app__theme-toggle:focus-visible {
  outline: 2px solid var(--app-jade-600);
  outline-offset: 2px;
}

@media (max-width: 860px) {
  .app__navbar {
    gap: 8px;
    padding: 6px 12px;
  }

  .app__view-section {
    display: none;
  }

  .app__net {
    display: none;
  }

  .app__actions {
    width: 100%;
    margin-left: 0;
  }

  /* 方案下拉可压缩，避免按钮被挤到第二行只剩「更多」孤零零一个 */
  .scheme-select {
    flex: 1 1 120px;
    width: auto;
    min-width: 0;
  }
}
</style>
