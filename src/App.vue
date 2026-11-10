<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/App.vue
 * @Description: 应用外壳：视图切换（录入设置 / 月度明细）、方案存档与导入导出
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWindowSize } from '@vueuse/core'
import AdminSidebar from '@/components/layout/AdminSidebar.vue'
import AppToolbar from '@/components/layout/AppToolbar.vue'
import CompareView from '@/views/CompareView.vue'
import SetupView from '@/views/SetupView.vue'
import TableView from '@/views/TableView.vue'
import ColumnConfigDrawer from '@/components/table-config/ColumnConfigDrawer.vue'
import { BONUS_SEPARATE_VALID_UNTIL } from '@/config/policy'
import { migrateSnapshot, PERSIST_VERSION, readVersion } from '@/core/persist'
import { useExport } from '@/composables/useExport'
import { useBackup } from '@/composables/useBackup'
import { useCountUp } from '@/composables/useCountUp'
import { useHistory } from '@/composables/useHistory'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useTheme } from '@/composables/useTheme'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import type {
  AppView,
  BonusMode,
  CityPolicy,
  NavItem,
  SetupSectionKey,
  TableSectionKey,
  TaxpayerType,
  PayTiming,
} from '@/types'

const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()
const schemaStore = useTableSchemaStore()
const { result } = useSalaryCalculator()
const { exportJson, readJsonFile } = useExport()
const { isDark, isSystem, toggleTheme, useSystemTheme } = useTheme()
const { canUndo, canRedo, undo, redo } = useHistory()
const { backupDue, restoreFromBackup } = useBackup()

function onUndo() {
  if (!undo()) ElMessage.info('没有可撤销的操作')
}

function onRedo() {
  if (!redo()) ElMessage.info('没有可重做的操作')
}

/** 输入框内保留浏览器原生撤销，避免抢走用户正在编辑的文本 */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable === true
  )
}

/** Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做 */
function onHistoryKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  const key = event.key.toLowerCase()
  if (key !== 'z' && key !== 'y') return
  if (isTypingTarget(event.target)) return
  event.preventDefault()
  if (key === 'y' || event.shiftKey) onRedo()
  else onUndo()
}

onMounted(() => window.addEventListener('keydown', onHistoryKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onHistoryKeydown))

const view = ref<AppView>('setup')
const drawerVisible = ref(false)
const navDrawerVisible = ref(false)
const activeSchemeId = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)

/** 两个视图各自上报的分区目录，侧边栏只展示当前视图的那一份 */
const setupSections = ref<NavItem[]>([])
const tableSections = ref<NavItem[]>([])
/** 初始默认高亮计算周期，子视图的滚动监听会很快接管 */
const activeSection = ref('period')

const currentSections = computed(() => {
  if (view.value === 'setup') return setupSections.value
  if (view.value === 'table') return tableSections.value
  return []
})

const VIEW_LABELS: Record<AppView, string> = {
  setup: '录入设置',
  table: '月度明细',
  compare: '方案对比',
}
const viewLabel = computed(() => VIEW_LABELS[view.value])
const activeSectionLabel = computed(
  () => currentSections.value.find((item) => item.key === activeSection.value)?.label ?? '',
)

const { width: windowWidth } = useWindowSize()
const sidebarCollapsed = ref(false)
const isNarrow = computed(() => windowWidth.value <= 960)

function onSelectView(next: AppView) {
  navDrawerVisible.value = false
  if (view.value === next) return
  view.value = next
  // 同步切到新视图首分页，避免视图切换瞬间出现空白页
  activeSection.value = next === 'setup' ? 'period' : next === 'table' ? 'overview' : ''
}

/** 桌面端折叠/展开侧边栏，窄屏改为打开抽屉菜单 */
function onToggleSidebar() {
  if (isNarrow.value) {
    navDrawerVisible.value = true
    return
  }
  sidebarCollapsed.value = !sidebarCollapsed.value
}

/** 分区列表变化时，保证当前激活页仍然存在（如删除年终奖后回退到结果概览） */
function ensureActive(items: NavItem[]) {
  if (items.length === 0) return
  if (!items.some((item) => item.key === activeSection.value)) {
    activeSection.value = items[0]?.key ?? ''
  }
}

function onSetupSections(items: NavItem[]) {
  setupSections.value = items
  if (view.value === 'setup') ensureActive(items)
}

function onTableSections(items: NavItem[]) {
  tableSections.value = items
  if (view.value === 'table') ensureActive(items)
}

/** 侧边栏点击：切换到对应分页 */
function onNavSelect(key: string) {
  navDrawerVisible.value = false
  if (!key) return
  activeSection.value = key
}

/** 切换视图时关闭移动抽屉并把内容区回到顶部 */
watch(view, async () => {
  navDrawerVisible.value = false
  await nextTick()
  bodyRef.value?.scrollTo({ top: 0 })
})

/** 分页切换后内容区回到顶部，不同界面之间不会沿用上一页的滚动位置 */
watch(activeSection, () => {
  nextTick(() => bodyRef.value?.scrollTo({ top: 0 }))
})

/**
 * 补全旧版本 localStorage 存档缺失的字段
 * 必须在任何子组件读取数据之前执行，否则内核会读到 undefined 而抛错
 */
salaryStore.normalize()
settingsStore.normalize()
// 主题迁移：旧版本默认浅色，切换到科技风后首次进入强制展示深色主视觉（只迁移一次，之后尊重用户选择）
const THEME_MIGRATION_KEY = 'salary-calc:theme-tech-v1'
if (!localStorage.getItem(THEME_MIGRATION_KEY)) {
  settingsStore.updateSettings({ theme: 'dark' })
  localStorage.setItem(THEME_MIGRATION_KEY, '1')
}
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
/** 挂载时滚动一次即可，之后直接跟随结果变化 */
const animatedAnnualNet = useCountUp(annualNet)

async function onExportJson() {
  await exportJson(
    {
      // 存档版本：导入时据此判断能否直接读取，还是需要迁移/升级
      version: PERSIST_VERSION,
      year: settingsStore.year,
      startMonth: settingsStore.startMonth,
      endMonth: settingsStore.endMonth,
      monthCount: settingsStore.monthCount,
      bonusMode: settingsStore.bonusMode,
      taxpayerType: settingsStore.taxpayerType,
      taxReductionMonthly: settingsStore.taxReductionMonthly,
      reverseAdjustIncomeId: settingsStore.reverseAdjustIncomeId,
      customCities: settingsStore.customCities,
      payTiming: settingsStore.payTiming,
      ...salaryStore.exportSnapshot(),
      // 自定义列会影响计税与应发，必须与薪资入参一起迁移
      tableSchema: schemaStore.exportSchema(),
    },
    `薪资配置_${settingsStore.year}.json`,
  )
  // 记录备份时间，提醒胶囊据此判断是否久未导出
  settingsStore.updateSettings({ lastExportedAt: new Date().toISOString() })
}

async function onImportJson(rawFile: File) {
  try {
    const source = await readJsonFile<unknown>(rawFile)
    // 版本高于当前应用时不猜测字段含义，直接提示升级
    if (readVersion(source) > PERSIST_VERSION) {
      throw new Error('该文件由更新版本的薪资计算器导出，请先升级本应用再导入')
    }
    const payload = migrateSnapshot<Record<string, unknown>>(source) as {
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
      schemes?: Parameters<typeof salaryStore.importSnapshot>[0]['schemes']
      customCities?: CityPolicy[]
      payTiming?: PayTiming
      tableSchema?: Parameters<typeof schemaStore.importSchema>[0]
    }

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
      customCities: payload.customCities,
      payTiming: payload.payTiming,
    })
    activeSchemeId.value = ''
    ElMessage.success('配置已导入')
  } catch (error) {
    console.error('[salary] 导入配置失败', error)
    ElMessage.error(error instanceof Error ? error.message : '导入失败，请检查 JSON 文件格式')
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
    await ElMessageBox.confirm('将清空当前录入并恢复为初始数据（金额均为 0），是否继续？', '重置确认', {
      type: 'warning',
    })
    salaryStore.resetAll()
    schemaStore.resetColumns()
    schemaStore.syncDynamicColumns(salaryStore.incomes)
    schemaStore.syncPostTaxColumns(salaryStore.postTaxDeductions)
    schemaStore.syncScoreColumns(salaryStore.incomes)
    view.value = 'setup'
    activeSection.value = 'period'
    ElMessage.success('已重置')
  } catch (error) {
    // 用户取消重置
    if (error !== 'cancel') console.error('[salary] 重置失败', error)
  }
}

function onSchemeCommand(command: string) {
  if (command === 'save') {
    onSaveScheme()
    return
  }
  if (command === 'apply') {
    onApplyScheme()
    return
  }
  if (command === 'remove') onRemoveScheme()
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
  if (command === 'restore-backup') {
    restoreFromBackup()
    return
  }
  if (command === 'theme-system') {
    useSystemTheme()
    ElMessage.success('已切换为跟随系统主题')
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
      <AppToolbar
        v-model:active-scheme-id="activeSchemeId"
        :title="viewLabel"
        :section="activeSectionLabel"
        :net-value="animatedAnnualNet"
        :schemes="salaryStore.schemes"
        :is-dark="isDark"
        :is-system="isSystem"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :is-narrow="isNarrow"
        :collapsed="sidebarCollapsed"
        :backup-due="backupDue"
        @toggle-sidebar="onToggleSidebar"
        @scheme-command="onSchemeCommand"
        @more-command="onCommand"
        @undo="onUndo"
        @redo="onRedo"
        @toggle-theme="toggleTheme"
        @backup="onExportJson"
      />

      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        hidden
        @change="onFileChange"
      />

      <main ref="bodyRef" class="app__body">
        <SetupView
          v-if="view === 'setup'"
          :section="activeSection as SetupSectionKey"
          @next="onSelectView('table')"
          @sections="onSetupSections"
          @select-section="onNavSelect"
        />
        <TableView
          v-else-if="view === 'table'"
          :section="activeSection as TableSectionKey"
          @back="onSelectView('setup')"
          @config-columns="drawerVisible = true"
          @sections="onTableSections"
          @select-section="onNavSelect"
        />
        <CompareView v-else />
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

/* 顶部玻璃导航栏：折叠按钮 + 视图标题 + 操作区 */
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
  background: color-mix(in srgb, var(--app-surface) 55%, transparent);
  border-top: 1px solid var(--app-line);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--app-ink-300);
}

.app__nav-drawer :deep(.el-drawer__body) {
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: #060c16;
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
}


@media (prefers-reduced-motion: reduce) {
  .app__sidebar-wrap {
    transition: none;
  }
}
</style>

