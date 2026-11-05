<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/TableView.vue
 * @Description: 月度明细视图：结果概览、可自定义表头的明细表与单月数据编辑
 */
import { computed, defineAsyncComponent, ref } from 'vue'
import { ArrowLeft, Download, Setting } from '@element-plus/icons-vue'
import AnnualTable from '@/components/result/AnnualTable.vue'
import BonusAdvice from '@/components/result/BonusAdvice.vue'
import MonthlyTable from '@/components/result/MonthlyTable.vue'
import ResultCards from '@/components/result/ResultCards.vue'
import MonthEditorDrawer from '@/components/month/MonthEditorDrawer.vue'
import { useExport } from '@/composables/useExport'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import type { MonthlyResult } from '@/types'

/**
 * 对外事件
 * @event back 返回录入设置视图
 * @event config-columns 打开表格列配置
 */
const emit = defineEmits<{
  back: []
  'config-columns': []
}>()

// 图表依赖 ECharts 且非首屏必需，走异步组件避免拖慢首屏渲染
const ChartPanel = defineAsyncComponent(() => import('@/components/chart/ChartPanel.vue'))

const settingsStore = useSettingsStore()
const schemaStore = useTableSchemaStore()
const { result } = useSalaryCalculator()
const { exportMonthlyCsv } = useExport()

const resultTab = ref('monthly')
const editorVisible = ref(false)
const editingMonth = ref(1)

/** 计算区间内才有意义，超出区间的月份不提供编辑入口 */
const isWithinRange = computed(
  () => (month: number) =>
    month >= settingsStore.startMonth && month <= settingsStore.endMonth,
)

function onRowClick(row: MonthlyResult) {
  if (!isWithinRange.value(row.month)) return
  editingMonth.value = row.month
  editorVisible.value = true
}

function onExportCsv() {
  exportMonthlyCsv({
    columns: schemaStore.visibleColumns,
    rows: result.value.monthly,
    insuranceMonthly: result.value.insuranceMonthly,
    filename: `薪资明细_${settingsStore.year}.csv`,
  })
}
</script>

<template>
  <section class="table-view">
    <header class="table-view__head">
      <el-button :icon="ArrowLeft" size="small" text @click="emit('back')">返回录入</el-button>
      <div class="table-view__titles">
        <h2 class="table-view__title">月度明细</h2>
        <p class="table-view__range">
          {{ settingsStore.year }} 年 · {{ settingsStore.rangeText }}
        </p>
      </div>
      <div class="table-view__actions">
        <el-button size="small" :icon="Setting" @click="emit('config-columns')">表格列</el-button>
        <el-button size="small" type="primary" plain :icon="Download" @click="onExportCsv">
          导出明细
        </el-button>
      </div>
    </header>

    <ResultCards />
    <BonusAdvice />

    <el-card shadow="never" class="table-view__card">
      <template #header>
        <div class="table-view__card-head">
          <span class="table-view__card-title">逐月发放与扣缴</span>
          <span class="table-view__card-hint">
            点击月份单元格打开单月编辑；表格中的金额、分数、备注可直接编辑并自动联动
          </span>
        </div>
      </template>
      <MonthlyTable @row-click="onRowClick" @config-columns="emit('config-columns')" />
    </el-card>

    <el-card shadow="never">
      <el-tabs v-model="resultTab">
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

    <MonthEditorDrawer v-model="editorVisible" :month="editingMonth" />
  </section>
</template>

<style scoped>
.table-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
}

.table-view__head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--app-surface);
  border: 1px solid var(--app-line);
  border-radius: 14px;
  box-shadow: var(--app-shadow-sm);
}

.table-view__titles {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.table-view__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--app-ink-900);
}

.table-view__range {
  font-size: 12px;
  color: var(--app-ink-500);
}

.table-view__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-view__card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  justify-content: space-between;
}

.table-view__card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--app-ink-900);
}

.table-view__card-hint {
  font-size: 12px;
  color: var(--app-ink-500);
}

.chart-loading {
  padding: 40px;
  text-align: center;
  color: var(--el-text-color-secondary);
}

@media (max-width: 640px) {
  /* 窄屏下标题独占一行，避免被操作按钮挤压成竖排文字 */
  .table-view__head {
    gap: 8px 10px;
    align-items: flex-start;
  }

  .table-view__titles {
    order: 3;
    flex-basis: 100%;
  }

  .table-view__title {
    white-space: nowrap;
  }

  .table-view__actions {
    margin-left: auto;
  }
}
</style>
