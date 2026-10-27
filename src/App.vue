<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/App.vue
 * @Description: 应用主布局：左侧录入区、右侧结果区，含列配置、方案存档与导入导出
 */
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Download, Refresh, Setting, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import BonusAdvice from '@/components/result/BonusAdvice.vue'
import AnnualTable from '@/components/result/AnnualTable.vue'
import DeductionEditor from '@/components/deduction/DeductionEditor.vue'
import IncomeEditor from '@/components/income/IncomeEditor.vue'
import InsuranceEditor from '@/components/insurance/InsuranceEditor.vue'
import MonthlyTable from '@/components/result/MonthlyTable.vue'
import ResultCards from '@/components/result/ResultCards.vue'
import StageEditor from '@/components/stage/StageEditor.vue'
import ColumnConfigDrawer from '@/components/table-config/ColumnConfigDrawer.vue'
import { BONUS_SEPARATE_VALID_UNTIL, POLICY_DISCLAIMER, POLICY_VERSION } from '@/config/policy'
import { useExport } from '@/composables/useExport'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import type { BonusMode } from '@/types'

// 图表依赖 ECharts 且非首屏必需，走异步组件避免拖慢首屏渲染
const ChartPanel = defineAsyncComponent(() => import('@/components/chart/ChartPanel.vue'))

const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()
const schemaStore = useTableSchemaStore()
const { result } = useSalaryCalculator()
const { exportMonthlyCsv, exportJson, readJsonFile } = useExport()

const inputTab = ref('income')
const resultTab = ref('monthly')
const drawerVisible = ref(false)
const activeSchemeId = ref('')

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 月`,
}))

const BONUS_MODE_OPTIONS: { value: BonusMode; label: string }[] = [
  { value: 'auto', label: '自动择优' },
  { value: 'separate', label: '单独计税' },
  { value: 'merged', label: '并入综合所得' },
]

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

const currentBonusMode = computed({
  get: () => settingsStore.bonusMode,
  set: (value: BonusMode) => settingsStore.updateSettings({ bonusMode: value }),
})

function onExportCsv() {
  exportMonthlyCsv({
    columns: schemaStore.visibleColumns,
    rows: result.value.monthly,
    insuranceMonthly: result.value.insuranceMonthly,
    filename: `薪资明细_${settingsStore.year}.csv`,
  })
}

function onExportJson() {
  exportJson(
    {
      year: settingsStore.year,
      startMonth: settingsStore.startMonth,
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
      bonusMode?: BonusMode
      incomes?: Parameters<typeof salaryStore.importSnapshot>[0]['incomes']
      insurance?: Parameters<typeof salaryStore.importSnapshot>[0]['insurance']
      deductions?: Parameters<typeof salaryStore.importSnapshot>[0]['deductions']
      stages?: Parameters<typeof salaryStore.importSnapshot>[0]['stages']
    }>(rawFile)

    salaryStore.importSnapshot(payload)
    settingsStore.updateSettings({
      year: payload.year,
      startMonth: payload.startMonth,
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
        <span class="app__policy-tip">年终奖单独计税有效期至 {{ BONUS_SEPARATE_VALID_UNTIL }}</span>
      </div>

      <div class="app__actions">
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
        <el-button size="small" :disabled="!activeSchemeId" @click="onRemoveScheme">删除</el-button>
        <el-button size="small" @click="onSaveScheme">保存当前</el-button>
        <el-divider direction="vertical" />
        <el-upload :show-file-list="false" accept=".json" :before-upload="onImportJson">
          <el-button size="small" :icon="Upload">导入</el-button>
        </el-upload>
        <el-button size="small" :icon="Download" @click="onExportJson">导出配置</el-button>
        <el-button size="small" :icon="Download" type="primary" plain @click="onExportCsv">
          导出明细
        </el-button>
        <el-button size="small" :icon="Setting" @click="drawerVisible = true">表格列</el-button>
        <el-button size="small" :icon="Refresh" @click="onReset">重置</el-button>
      </div>
    </header>

    <main class="app__body">
      <el-card class="app__aside" shadow="never">
        <el-tabs v-model="inputTab" class="input-tabs">
          <!-- 页签全部懒加载：仅渲染当前激活面板，避免首屏同时挂载大量表单与表格 -->
          <el-tab-pane label="收入项" name="income" lazy>
            <IncomeEditor />
          </el-tab-pane>
          <el-tab-pane label="五险一金" name="insurance" lazy>
            <InsuranceEditor />
          </el-tab-pane>
          <el-tab-pane label="雇佣阶段" name="stage" lazy>
            <StageEditor />
          </el-tab-pane>
          <el-tab-pane label="扣除项" name="deduction" lazy>
            <DeductionEditor />
          </el-tab-pane>
          <el-tab-pane label="设置" name="settings" lazy>
            <el-form label-width="96px" size="small">
              <el-form-item label="计算年度">
                <el-input-number
                  v-model="settingsStore.year"
                  :min="2000"
                  :max="2099"
                  controls-position="right"
                  class="full-width"
                />
              </el-form-item>
              <el-form-item label="入职月份">
                <el-select v-model="settingsStore.startMonth" class="full-width">
                  <el-option
                    v-for="option in MONTH_OPTIONS"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="离职月份">
                <el-select v-model="settingsStore.endMonth" class="full-width">
                  <el-option
                    v-for="option in MONTH_OPTIONS"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="纳税人身份">
                <el-radio-group v-model="settingsStore.taxpayerType">
                  <el-radio value="resident">居民个人（累计预扣）</el-radio>
                  <el-radio value="nonResident">非居民个人（按月计税）</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="每月减免税额">
                <el-input-number
                  v-model="settingsStore.taxReductionMonthly"
                  :min="0"
                  :step="100"
                  :precision="2"
                  controls-position="right"
                  class="full-width"
                />
              </el-form-item>
              <el-form-item label="年终奖计税">
                <el-radio-group v-model="currentBonusMode">
                  <el-radio
                    v-for="option in BONUS_MODE_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>
            <el-alert
              :closable="false"
              type="info"
              class="app__settings-tip"
              title="本工具按自然年计算；跨年周期（如 2025 年 7 月至 2026 年 6 月）请分两个年度录入后自行合计"
            />
            <el-alert :closable="false" type="info" :title="POLICY_DISCLAIMER" />
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <section class="app__content">
        <ResultCards />
        <BonusAdvice />

        <el-card shadow="never" class="result-card-wrapper">
          <el-tabs v-model="resultTab">
            <el-tab-pane label="月度明细" name="monthly" lazy>
              <MonthlyTable />
            </el-tab-pane>
            <el-tab-pane label="年度汇总" name="annual" lazy>
              <AnnualTable />
            </el-tab-pane>
            <!-- 图表依赖 ECharts，设为懒加载，切换到该页签时才发起组件请求 -->
            <el-tab-pane label="图表" name="chart" lazy>
              <Suspense>
                <ChartPanel />
                <template #fallback>
                  <div class="chart-loading">图表加载中…</div>
                </template>
              </Suspense>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </section>
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
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
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

.app__policy-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.app__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.scheme-select {
  width: 150px;
}

.app__body {
  display: grid;
  grid-template-columns: minmax(380px, 440px) minmax(0, 1fr);
  gap: 16px;
  padding: 16px 20px;
  align-items: start;
}

.app__aside {
  position: sticky;
  top: 16px;
}

.result-card-wrapper {
  margin-top: 12px;
}

.full-width {
  width: 100%;
}

.chart-loading {
  padding: 40px;
  text-align: center;
  color: var(--el-text-color-secondary);
}

@media (max-width: 1200px) {
  .app__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .app__aside {
    position: static;
  }
}
</style>
