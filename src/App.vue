<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/App.vue
 * @Description: 应用外壳：视图切换（录入设置 / 月度明细）、方案存档与导入导出
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Delete, Download, Expand, Fold, MoreFilled, Refresh, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWindowSize } from '@vueuse/core'
import AdminSidebar from '@/components/layout/AdminSidebar.vue'
import SetupView from '@/components/layout/SetupView.vue'
import TableView from '@/components/layout/TableView.vue'
import ColumnConfigDrawer from '@/components/table-config/ColumnConfigDrawer.vue'
import { BONUS_SEPARATE_VALID_UNTIL, POLICY_VERSION } from '@/config/policy'
import { useExport } from '@/composables/useExport'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import type {
  AppView,
  BonusMode,
  NavItem,
  SetupSectionKey,
  TableSectionKey,
  TaxpayerType,
} from '@/types'

const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()
const schemaStore = useTableSchemaStore()
const { result } = useSalaryCalculator()
const { exportJson, readJsonFile } = useExport()

const view = ref<AppView>('setup')
const drawerVisible = ref(false)
const navDrawerVisible = ref(false)
const activeSchemeId = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const setupRef = ref<{ jumpTo: (key: SetupSectionKey) => void } | null>(null)
const tableRef = ref<{ jumpTo: (key: TableSectionKey) => void } | null>(null)

/** 两个视图各自上报的分区目录，侧边栏只展示当前视图的那一份 */
const setupSections = ref<NavItem[]>([])
const tableSections = ref<NavItem[]>([])
/** 初始默认高亮计算周期，子视图的滚动监听会很快接管 */
const activeSection = ref('period')

const currentSections = computed(() =>
  view.value === 'setup' ? setupSections.value : tableSections.value,
)

const viewLabel = computed(() => (view.value === 'setup' ? '录入设置' : '月度明细'))
const activeSectionLabel = computed(
  () => currentSections.value.find((item) => item.key === activeSection.value)?.label ?? '',
)

const { width: windowWidth } = useWindowSize()
const sidebarCollapsed = ref(false)
const isNarrow = computed(() => windowWidth.value <= 960)

const viewTabs: { value: AppView; label: string }[] = [
  { value: 'setup', label: '录入设置' },
  { value: 'table', label: '月度明细' },
]

function onSelectView(next: AppView) {
  view.value = next
  navDrawerVisible.value = false
}

/** 桌面端折叠/展开侧边栏，窄屏改为打开抽屉菜单 */
function onToggleSidebar() {
  if (isNarrow.value) {
    navDrawerVisible.value = true
    return
  }
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function onSetupSections(items: NavItem[]) {
  setupSections.value = items
}

function onTableSections(items: NavItem[]) {
  tableSections.value = items
}

function onSetupActive(key: SetupSectionKey) {
  if (view.value === 'setup') activeSection.value = key
}

function onTableActive(key: TableSectionKey) {
  if (view.value === 'table') activeSection.value = key
}

/** 侧边栏点击：展开对应分区并滚动到目标位置 */
function onNavSelect(key: string) {
  navDrawerVisible.value = false
  if (!key) return
  activeSection.value = key
  if (view.value === 'setup') {
    setupRef.value?.jumpTo(key as SetupSectionKey)
  } else {
    tableRef.value?.jumpTo(key as TableSectionKey)
  }
}

/** 切换视图时回到顶部，并让侧边栏高亮新视图的首个分区 */
watch(view, async () => {
  navDrawerVisible.value = false
  activeSection.value = ''
  await nextTick()
  bodyRef.value?.scrollTo({ top: 0 })
  activeSection.value = currentSections.value[0]?.key ?? ''
})

/**
 * 补全旧版本 localStorage 存档缺失的字段
 * 必须在任何子组件读取数据之前执行，否则内核会读到 undefined 而抛错
 */
salaryStore.normalize()
settingsStore.normalize()
// 旧版存档的表格 Schema / 内置预设可能缺少新增字段，启动时统一升级
schemaStore.syncBuiltinPresets()
schemaStore.syncStaticColumns()

/**
 * 收入项增删时同步表格动态列
 * 只监听 id 与名称，避免金额微调触发无意义的列重建
 */
watch(
  () => salaryStore.incomes.map((item) => `${item.id}:${item.name}:${item.scoreBased ? 1 : 0}`),
  () => {
    schemaStore.syncDynamicColumns(salaryStore.incomes)
    schemaStore.syncScoreColumns(salaryStore.incomes)
  },
  { immediate: true, deep: true },
)

/** 税后扣款项目增删或改名时同步表格列 */
watch(
  () => salaryStore.postTaxDeductions.map((item) => `${item.id}:${item.name}`),
  () => schemaStore.syncPostTaxColumns(salaryStore.postTaxDeductions),
  { immediate: true, deep: true },
)

/** 年度到手，用于顶栏常驻展示，切换视图时也能一眼看到结果 */
const annualNet = computed(() => result.value.annual.net)

async function onExportJson() {
  exportJson(
    {
      year: settingsStore.year,
      startMonth: settingsStore.startMonth,
      endMonth: settingsStore.endMonth,
      monthCount: settingsStore.monthCount,
      bonusMode: settingsStore.bonusMode,
      taxpayerType: settingsStore.taxpayerType,
      taxReductionMonthly: settingsStore.taxReductionMonthly,
      reverseAdjustIncomeId: settingsStore.reverseAdjustIncomeId,
      ...salaryStore.exportSnapshot(),
      // 自定义列会影响计税与应发，必须与薪资入参一起迁移
      tableSchema: schemaStore.exportSchema(),
    },
    `薪资配置_${settingsStore.year}.json`,
  )
}

async function onImportJson(rawFile: File) {
  try {
    const payload = await readJsonFile<{
      year?: number
      startMonth?: number
      endMonth?: number
      monthCount?: number
      bonusMode?: BonusMode
      taxpayerType?: TaxpayerType
      taxReductionMonthly?: number
      reverseAdjustIncomeId?: string
      incomes?: Parameters<typeof salaryStore.importSnapshot>[0]['incomes']
      insurance?: Parameters<typeof salaryStore.importSnapshot>[0]['insurance']
      deductions?: Parameters<typeof salaryStore.importSnapshot>[0]['deductions']
      stages?: Parameters<typeof salaryStore.importSnapshot>[0]['stages']
      monthOverrides?: Parameters<typeof salaryStore.importSnapshot>[0]['monthOverrides']
      postTaxDeductions?: Parameters<
        typeof salaryStore.importSnapshot
      >[0]['postTaxDeductions']
      tableSchema?: Parameters<typeof schemaStore.importSchema>[0]
    }>(rawFile)

    salaryStore.importSnapshot(payload)
    schemaStore.importSchema(payload.tableSchema)
    // 导入的 Schema 可能是旧版本，补齐新增静态列、内置预设与税后扣款项列
    schemaStore.syncBuiltinPresets()
    schemaStore.syncStaticColumns()
    schemaStore.syncPostTaxColumns(salaryStore.postTaxDeductions)
    schemaStore.syncScoreColumns(salaryStore.incomes)
    settingsStore.updateSettings({
      year: payload.year,
      startMonth: payload.startMonth,
      endMonth: payload.endMonth,
      monthCount: payload.monthCount,
      bonusMode: payload.bonusMode,
      taxpayerType: payload.taxpayerType,
      taxReductionMonthly: payload.taxReductionMonthly,
      reverseAdjustIncomeId: payload.reverseAdjustIncomeId,
    })
    activeSchemeId.value = ''
    ElMessage.success('配置已导入')
  } catch (error) {
    console.error('[salary] 导入配置失败', error)
    ElMessage.error('导入失败，请检查 JSON 文件格式')
  }
}

/** 原生文件选择：下拉菜单里点击「导入配置」再唤起，避免顶栏堆积上传组件 */
async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await onImportJson(file)
}

async function onSaveScheme() {
  try {
    const { value } = await ElMessageBox.prompt('为当前方案命名', '保存方案', {
      inputPlaceholder: '例如：A 公司 Offer',
      inputValidator: (input: string) => (input.trim().length > 0 ? true : '名称不能为空'),
    })
    const scheme = salaryStore.saveScheme(value.trim(), {
      year: settingsStore.year,
      startMonth: settingsStore.startMonth,
      endMonth: settingsStore.endMonth,
      bonusMode: settingsStore.bonusMode,
      taxpayerType: settingsStore.taxpayerType,
      taxReductionMonthly: settingsStore.taxReductionMonthly,
    })
    activeSchemeId.value = scheme.id
    ElMessage.success('方案已保存')
  } catch (error) {
    if (error !== 'cancel') console.error('[salary] 保存方案失败', error)
  }
}

async function onApplyScheme() {
  if (!activeSchemeId.value) {
    ElMessage.warning('请先选择方案')
    return
  }
  try {
    await ElMessageBox.confirm('应用方案会覆盖当前录入内容，是否继续？', '应用方案', {
      type: 'warning',
      confirmButtonText: '应用方案',
    })
    const meta = salaryStore.applyScheme(activeSchemeId.value)
    if (!meta) {
      ElMessage.warning('方案不存在或已被删除')
      return
    }
    settingsStore.updateSettings(meta)
    ElMessage.success('方案已应用')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') console.error('[salary] 应用方案失败', error)
  }
}

async function onRemoveScheme() {
  if (!activeSchemeId.value) return
  try {
    await ElMessageBox.confirm('删除后无法恢复，是否继续？', '删除方案', {
      type: 'warning',
      confirmButtonText: '删除',
    })
    salaryStore.removeScheme(activeSchemeId.value)
    activeSchemeId.value = ''
    ElMessage.success('方案已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') console.error('[salary] 删除方案失败', error)
  }
}

async function onReset() {
  try {
    await ElMessageBox.confirm('将清空当前录入并恢复默认示例数据，是否继续？', '重置确认', {
      type: 'warning',
    })
    salaryStore.resetAll()
    schemaStore.resetColumns()
    schemaStore.syncDynamicColumns(salaryStore.incomes)
    schemaStore.syncPostTaxColumns(salaryStore.postTaxDeductions)
    schemaStore.syncScoreColumns(salaryStore.incomes)
    view.value = 'setup'
    ElMessage.success('已重置')
  } catch (error) {
    // 用户取消重置
    if (error !== 'cancel') console.error('[salary] 重置失败', error)
  }
}

function onCommand(command: string) {
  if (command === 'import') {
    fileInput.value?.click()
    return
  }
  if (command === 'export') {
    onExportJson()
    return
  }
  if (command === 'remove-scheme') {
    onRemoveScheme()
    return
  }
  if (command === 'reset') onReset()
}
</script>

<template>
  <div class="app">
    <aside class="app__sidebar-wrap" :class="{ 'is-collapsed': sidebarCollapsed }">
      <AdminSidebar
        :view="view"
        :active-section="activeSection"
        :setup-items="setupSections"
        :table-items="tableSections"
        :collapsed="sidebarCollapsed"
        @select-view="onSelectView"
        @select-section="onNavSelect"
      />
    </aside>

    <div class="app__main">
      <header class="app__navbar">
        <div class="app__navbar-left">
          <button
            type="button"
            class="app__toggle"
            :aria-label="
              isNarrow ? '打开菜单' : sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'
            "
            @click="onToggleSidebar"
          >
            <el-icon>
              <Expand v-if="isNarrow || sidebarCollapsed" />
              <Fold v-else />
            </el-icon>
          </button>

          <nav class="app__breadcrumb" aria-label="面包屑">
            <span class="app__crumb">薪资计算器</span>
            <span class="app__crumb-sep">/</span>
            <span class="app__crumb">{{ viewLabel }}</span>
            <template v-if="activeSectionLabel">
              <span class="app__crumb-sep">/</span>
              <span class="app__crumb app__crumb--current">{{ activeSectionLabel }}</span>
            </template>
          </nav>

          <el-tooltip
            :content="`年终奖单独计税有效期至 ${BONUS_SEPARATE_VALID_UNTIL}`"
            placement="bottom"
          >
            <el-tag size="small" effect="plain" class="app__policy">
              政策版本 {{ POLICY_VERSION }}
            </el-tag>
          </el-tooltip>
        </div>

        <div class="app__actions">
          <div class="app__net">
            <span class="app__net-label">年度到手</span>
            <strong class="app__net-value num">¥{{ annualNet.toLocaleString('zh-CN') }}</strong>
          </div>
          <el-select v-model="activeSchemeId" size="small" placeholder="方案存档" class="scheme-select">
            <el-option
              v-for="scheme in salaryStore.schemes"
              :key="scheme.id"
              :label="scheme.name"
              :value="scheme.id"
            />
          </el-select>
          <el-button size="small" @click="onSaveScheme">存为方案</el-button>
          <el-button size="small" :disabled="!activeSchemeId" @click="onApplyScheme">应用</el-button>
          <el-dropdown trigger="click" @command="onCommand">
            <el-button size="small" :icon="MoreFilled" text>更多</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="export" :icon="Download">导出配置</el-dropdown-item>
                <el-dropdown-item command="import" :icon="Upload">导入配置</el-dropdown-item>
                <el-dropdown-item
                  command="remove-scheme"
                  :icon="Delete"
                  :disabled="!activeSchemeId"
                >
                  删除当前方案
                </el-dropdown-item>
                <el-dropdown-item command="reset" :icon="Refresh" divided>
                  重置数据
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          hidden
          @change="onFileChange"
        />
      </header>

      <div class="app__tags">
        <div class="app__tag-list" role="tablist" aria-label="视图切换">
          <button
            v-for="tab in viewTabs"
            :key="tab.value"
            type="button"
            role="tab"
            class="app__tag"
            :class="{ 'is-active': view === tab.value }"
            :aria-selected="view === tab.value"
            @click="onSelectView(tab.value)"
          >
            <i class="app__tag-dot" aria-hidden="true"></i>
            {{ tab.label }}
          </button>
        </div>
        <span v-if="activeSectionLabel" class="app__tags-hint">
          当前板块：{{ activeSectionLabel }}
        </span>
      </div>

      <main ref="bodyRef" class="app__body" data-scroll-root>
        <SetupView
          v-if="view === 'setup'"
          ref="setupRef"
          @next="onSelectView('table')"
          @sections="onSetupSections"
          @active-section="onSetupActive"
        />
        <TableView
          v-else
          ref="tableRef"
          @back="onSelectView('setup')"
          @config-columns="drawerVisible = true"
          @sections="onTableSections"
          @active-section="onTableActive"
        />
      </main>

      <footer class="app__footer">
        <span>数据仅保存在本机浏览器，不上传服务器</span>
        <span>年终奖单独计税有效期至 {{ BONUS_SEPARATE_VALID_UNTIL }}</span>
      </footer>
    </div>

    <el-drawer
      v-model="navDrawerVisible"
      direction="ltr"
      size="248px"
      :with-header="false"
      class="app__nav-drawer"
    >
      <AdminSidebar
        :view="view"
        :active-section="activeSection"
        :setup-items="setupSections"
        :table-items="tableSections"
        @select-view="onSelectView"
        @select-section="onNavSelect"
      />
    </el-drawer>

    <ColumnConfigDrawer v-model="drawerVisible" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

/* 左侧深色管理菜单，桌面端可收起到图标栏 */
.app__sidebar-wrap {
  flex: 0 0 auto;
  width: 220px;
  height: 100%;
  transition: width 0.2s ease;
}

.app__sidebar-wrap.is-collapsed {
  width: 68px;
}

.app__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

/* 顶部白色导航栏：折叠按钮 + 面包屑 + 操作区 */
.app__navbar {
  z-index: 20;
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  min-height: 52px;
  padding: 6px 18px;
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-line);
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
  background: #f1f5f9;
  color: var(--app-ink-900);
}

.app__toggle:focus-visible {
  outline: 2px solid var(--app-jade-600);
  outline-offset: 1px;
}

.app__breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  color: var(--app-ink-500);
  font-size: 12px;
  white-space: nowrap;
}

.app__crumb {
  overflow: hidden;
  text-overflow: ellipsis;
}

.app__crumb--current {
  color: var(--app-ink-900);
  font-weight: 600;
}

.app__crumb-sep {
  color: var(--app-line-strong);
}

.app__policy {
  flex: none;
  margin-left: 2px;
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
  color: var(--app-jade-700);
}

.scheme-select {
  width: 148px;
}

/* 标签页视图：固定当前打开的两个工作视图 */
.app__tags {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  padding: 3px 18px;
  overflow: hidden;
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-line);
}

.app__tag-list {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.app__tag-list::-webkit-scrollbar {
  display: none;
}

.app__tag {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--app-line);
  border-radius: 3px;
  background: #fff;
  color: var(--app-ink-500);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}

.app__tag:hover {
  border-color: var(--app-ink-300);
  color: var(--app-ink-900);
}

.app__tag.is-active {
  border-color: var(--app-jade-600);
  background: var(--app-jade-100);
  color: var(--app-jade-700);
  font-weight: 600;
}

.app__tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.75;
}

.app__tags-hint {
  flex: none;
  color: var(--app-ink-300);
  font-size: 11px;
  white-space: nowrap;
}

.app__body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.app__footer {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 20px;
  padding: 7px 20px;
  background: rgb(255 255 255 / 60%);
  border-top: 1px solid var(--app-line);
  font-size: 11px;
  color: var(--app-ink-300);
}

.app__nav-drawer :deep(.el-drawer__body) {
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: #152235;
}

@media (max-height: 560px) {
  /* 视口高度很小时优先把空间留给内容区，隐藏常驻页脚 */
  .app__footer {
    display: none;
  }
}

@media (max-width: 960px) {
  .app__sidebar-wrap {
    display: none;
  }

  .app__tags-hint {
    display: none;
  }
}

@media (max-width: 860px) {
  .app__navbar {
    gap: 8px;
    padding: 6px 12px;
  }

  .app__tags {
    padding: 3px 12px;
  }

  .app__policy {
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

@media (prefers-reduced-motion: reduce) {
  .app__sidebar-wrap {
    transition: none;
  }
}
</style>

