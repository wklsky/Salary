<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/App.vue
 * @Description: 应用外壳：视图切换（录入设置 / 月度明细）、方案存档与导入导出
 */
import { computed, ref, watch } from 'vue'
import { Delete, Download, MoreFilled, Refresh, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import SetupView from '@/components/layout/SetupView.vue'
import TableView from '@/components/layout/TableView.vue'
import ColumnConfigDrawer from '@/components/table-config/ColumnConfigDrawer.vue'
import { BONUS_SEPARATE_VALID_UNTIL, POLICY_VERSION } from '@/config/policy'
import { useExport } from '@/composables/useExport'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import type { BonusMode, TaxpayerType } from '@/types'

/** 视图标识：先录入设置，再进入月度明细 */
type AppView = 'setup' | 'table'

const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()
const schemaStore = useTableSchemaStore()
const { result } = useSalaryCalculator()
const { exportJson, readJsonFile } = useExport()

const view = ref<AppView>('setup')
const drawerVisible = ref(false)
const activeSchemeId = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

/**
 * 补全旧版本 localStorage 存档缺失的字段
 * 必须在任何子组件读取数据之前执行，否则内核会读到 undefined 而抛错
 */
salaryStore.normalize()
settingsStore.normalize()

/**
 * 收入项增删时同步表格动态列
 * 只监听 id 与名称，避免金额微调触发无意义的列重建
 */
watch(
  () => salaryStore.incomes.map((item) => `${item.id}:${item.name}`),
  () => schemaStore.syncDynamicColumns(salaryStore.incomes),
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
      incomes?: Parameters<typeof salaryStore.importSnapshot>[0]['incomes']
      insurance?: Parameters<typeof salaryStore.importSnapshot>[0]['insurance']
      deductions?: Parameters<typeof salaryStore.importSnapshot>[0]['deductions']
      stages?: Parameters<typeof salaryStore.importSnapshot>[0]['stages']
      monthOverrides?: Parameters<typeof salaryStore.importSnapshot>[0]['monthOverrides']
      tableSchema?: Parameters<typeof schemaStore.importSchema>[0]
    }>(rawFile)

    salaryStore.importSnapshot(payload)
    schemaStore.importSchema(payload.tableSchema)
    settingsStore.updateSettings({
      year: payload.year,
      startMonth: payload.startMonth,
      endMonth: payload.endMonth,
      monthCount: payload.monthCount,
      bonusMode: payload.bonusMode,
      taxpayerType: payload.taxpayerType,
      taxReductionMonthly: payload.taxReductionMonthly,
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
    <header class="app__header">
      <div class="app__brand">
        <span class="app__mark" aria-hidden="true">薪</span>
        <div class="app__identity">
          <h1 class="app__title">薪资计算器</h1>
          <span class="app__subtitle">税前税后 · 五险一金 · 年度汇算</span>
        </div>
        <el-tooltip
          :content="`年终奖单独计税有效期至 ${BONUS_SEPARATE_VALID_UNTIL}`"
          placement="bottom"
        >
          <el-tag size="small" effect="plain" class="app__policy">
            政策版本 {{ POLICY_VERSION }}
          </el-tag>
        </el-tooltip>
      </div>

      <nav class="app__nav" aria-label="视图切换">
        <button
          type="button"
          class="app__nav-item"
          :class="{ 'is-active': view === 'setup' }"
          :aria-current="view === 'setup' ? 'page' : undefined"
          @click="view = 'setup'"
        >
          <span class="app__nav-index">1</span>
          <span>录入设置</span>
        </button>
        <span class="app__nav-link" aria-hidden="true"></span>
        <button
          type="button"
          class="app__nav-item"
          :class="{ 'is-active': view === 'table' }"
          :aria-current="view === 'table' ? 'page' : undefined"
          @click="view = 'table'"
        >
          <span class="app__nav-index">2</span>
          <span>月度明细</span>
        </button>
      </nav>

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

    <main class="app__body">
      <SetupView v-if="view === 'setup'" @next="view = 'table'" />
      <TableView v-else @back="view = 'setup'" @config-columns="drawerVisible = true" />
    </main>

    <footer class="app__footer">
      <span>数据仅保存在本机浏览器，不上传服务器</span>
      <span>年终奖单独计税有效期至 {{ BONUS_SEPARATE_VALID_UNTIL }}</span>
    </footer>

    <ColumnConfigDrawer v-model="drawerVisible" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app__header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px clamp(16px, 3vw, 28px);
  background: rgb(255 255 255 / 88%);
  border-bottom: 1px solid var(--app-line);
  backdrop-filter: blur(12px);
  flex-wrap: wrap;
}

.app__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.app__mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, var(--app-jade-600), var(--app-jade-700));
  box-shadow: 0 10px 20px -12px rgb(15 118 110 / 90%);
  font-size: 19px;
  font-weight: 700;
}

.app__identity {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.app__title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--app-ink-900);
}

.app__subtitle {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--app-ink-500);
}

.app__nav {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--app-line);
  border-radius: 999px;
  background: #fff;
}

.app__nav-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--app-ink-500);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s;
}

.app__nav-item:hover {
  color: var(--app-ink-900);
  background: #f3f6fa;
}

.app__nav-item.is-active {
  color: #fff;
  background: var(--app-ink-900);
}

.app__nav-index {
  display: grid;
  place-items: center;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: var(--app-jade-100);
  color: var(--app-jade-700);
  font-family: var(--app-font-num);
  font-size: 11px;
}

.app__nav-item.is-active .app__nav-index {
  color: #fff;
  background: rgb(255 255 255 / 18%);
}

.app__nav-link {
  width: 16px;
  height: 1px;
  background: var(--app-line-strong);
}

.app__actions {
  display: flex;
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

.app__body {
  flex: 1;
  padding: 16px clamp(16px, 3vw, 28px) 8px;
}

.app__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 20px;
  padding: 22px 20px 28px;
  font-size: 11px;
  color: var(--app-ink-300);
}

@media (max-width: 860px) {
  .app__header {
    position: static;
    gap: 10px;
    padding: 8px 14px;
  }

  .app__subtitle,
  .app__policy {
    display: none;
  }

  .app__nav {
    order: 3;
    width: 100%;
    justify-content: center;
  }

  .app__actions {
    margin-left: auto;
  }

  .app__net {
    display: none;
  }
}
</style>
