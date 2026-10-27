<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/App.vue
 * @Description: 应用外壳：视图切换（录入设置 / 月度明细）、方案存档与导入导出
 */
import { computed, ref, watch } from 'vue'
import { Download, Refresh, Upload } from '@element-plus/icons-vue'
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
import type { BonusMode } from '@/types'

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
      ...salaryStore.exportSnapshot(),
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
      incomes?: Parameters<typeof salaryStore.importSnapshot>[0]['incomes']
      insurance?: Parameters<typeof salaryStore.importSnapshot>[0]['insurance']
      deductions?: Parameters<typeof salaryStore.importSnapshot>[0]['deductions']
      stages?: Parameters<typeof salaryStore.importSnapshot>[0]['stages']
      monthOverrides?: Parameters<typeof salaryStore.importSnapshot>[0]['monthOverrides']
    }>(rawFile)

    salaryStore.importSnapshot(payload)
    settingsStore.updateSettings({
      year: payload.year,
      startMonth: payload.startMonth,
      endMonth: payload.endMonth,
      monthCount: payload.monthCount,
      bonusMode: payload.bonusMode,
    })
    ElMessage.success('配置已导入')
  } catch (error) {
    console.error('[salary] 导入配置失败', error)
    ElMessage.error('导入失败，请检查 JSON 文件格式')
  }
  // 阻止 el-upload 的默认上传行为
  return false
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
      bonusMode: settingsStore.bonusMode,
    })
    activeSchemeId.value = scheme.id
    ElMessage.success('方案已保存')
  } catch (error) {
    if (error !== 'cancel') console.error('[salary] 保存方案失败', error)
  }
}

function onApplyScheme() {
  const meta = salaryStore.applyScheme(activeSchemeId.value)
  if (!meta) {
    ElMessage.warning('请先选择方案')
    return
  }
  settingsStore.updateSettings(meta)
  ElMessage.success('方案已应用')
}

function onRemoveScheme() {
  if (!activeSchemeId.value) return
  salaryStore.removeScheme(activeSchemeId.value)
  activeSchemeId.value = ''
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
</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="app__brand">
        <h1 class="app__title">薪资计算器</h1>
        <el-tag size="small" effect="plain">政策版本 {{ POLICY_VERSION }}</el-tag>
      </div>

      <el-radio-group v-model="view" size="small" class="app__switch">
        <el-radio-button value="setup">录入设置</el-radio-button>
        <el-radio-button value="table">月度明细</el-radio-button>
      </el-radio-group>

      <div class="app__actions">
        <span class="app__net">年度到手 ¥{{ annualNet.toLocaleString('zh-CN') }}</span>
        <el-select
          v-model="activeSchemeId"
          size="small"
          placeholder="方案存档"
          class="scheme-select"
        >
          <el-option
            v-for="scheme in salaryStore.schemes"
            :key="scheme.id"
            :label="scheme.name"
            :value="scheme.id"
          />
        </el-select>
        <el-button size="small" :disabled="!activeSchemeId" @click="onApplyScheme">应用</el-button>
        <el-button size="small" @click="onSaveScheme">保存当前</el-button>
        <el-button size="small" plain :disabled="!activeSchemeId" @click="onRemoveScheme">
          删除
        </el-button>
        <el-divider direction="vertical" />
        <el-upload :show-file-list="false" accept=".json" :before-upload="onImportJson">
          <el-button size="small" :icon="Upload">导入</el-button>
        </el-upload>
        <el-button size="small" :icon="Download" @click="onExportJson">导出配置</el-button>
        <el-button size="small" :icon="Refresh" @click="onReset">重置</el-button>
      </div>

      <p class="app__policy-tip">年终奖单独计税有效期至 {{ BONUS_SEPARATE_VALID_UNTIL }}</p>
    </header>

    <main class="app__body">
      <SetupView v-if="view === 'setup'" @next="view = 'table'" />
      <TableView v-else @back="view = 'setup'" @config-columns="drawerVisible = true" />
    </main>

    <ColumnConfigDrawer v-model="drawerVisible" />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--el-bg-color-page);
}

.app__header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.app__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.app__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}

.app__net {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}

.app__policy-tip {
  width: 100%;
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.scheme-select {
  width: 140px;
}

.app__body {
  padding: 16px 20px 32px;
}
</style>
