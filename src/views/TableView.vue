<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/views/TableView.vue
 * @Description: 月度明细视图：结果概览、可自定义表头的明细表与单月数据编辑
 */
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ArrowLeft, Download, Setting } from '@element-plus/icons-vue'
import PagePager from '@/components/common/PagePager.vue'
import AnnualTable from '@/components/result/AnnualTable.vue'
import MonthlyTable from '@/components/result/MonthlyTable.vue'
import ResultCards from '@/components/result/ResultCards.vue'
import MonthEditorDrawer from '@/components/month/MonthEditorDrawer.vue'
import ExplainDrawer from '@/components/result/ExplainDrawer.vue'
import PayrollCheckDrawer from '@/components/result/PayrollCheckDrawer.vue'
import { INSURANCE_LABELS } from '@/config/columns'
import { useExport } from '@/composables/useExport'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import type { InsuranceType, MonthlyResult, NavItem, TableSectionKey } from '@/types'

interface Props {
  /** 当前展示的月度明细分页 */
  section: TableSectionKey
}

const props = defineProps<Props>()

/**
 * 对外事件
 * @event back 返回录入设置视图
 * @event config-columns 打开表格列配置
 * @event sections 分区目录变化，同步给侧边栏
 * @event select-section 切换到上一个/下一个明细分页
 */
const emit = defineEmits<{
  back: []
  'config-columns': []
  sections: [items: NavItem[]]
  'select-section': [key: TableSectionKey]
}>()

// 图表依赖 ECharts 且非首屏必需，走异步组件避免拖慢首屏渲染
const ChartPanel = defineAsyncComponent(() => import('@/components/chart/ChartPanel.vue'))

const settingsStore = useSettingsStore()
const salaryStore = useSalaryStore()
const schemaStore = useTableSchemaStore()
const { result } = useSalaryCalculator()
const { exportMonthlyCsv, exportAnnualCsv, exportMatrixCsv } = useExport()

const editorVisible = ref(false)
const editingMonth = ref(1)
/** 计算明细抽屉：逐月税额分解与汇算差异解释 */
const explainVisible = ref(false)
/** 工资单核对抽屉：录入实际个税/实发后逐月对比 */
const payrollVisible = ref(false)

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

/** 年度汇总导出：只导出年度页真正展示的口径，不做二次计算 */
function onExportAnnual() {
  const annual = result.value.annual
  const months = Math.max(1, monthsWorked.value)
  const rows = [
    { label: '计算年度', value: `${settingsStore.year} 年` },
    { label: '计算区间', value: settingsStore.rangeText },
    { label: '年度应发', value: annual.gross.toFixed(2) },
    { label: '月均应发', value: (annual.gross / months).toFixed(2) },
    { label: '五险一金（个人）', value: annual.insurancePersonal.toFixed(2) },
    { label: '五险一金（单位）', value: annual.insuranceCompany.toFixed(2) },
    { label: '全年个人所得税', value: annual.tax.toFixed(2) },
    { label: '年度到手', value: annual.net.toFixed(2) },
    { label: '月均到手', value: (annual.net / months).toFixed(2) },
    { label: '到手率', value: `${(annual.netRate * 100).toFixed(2)}%` },
    { label: '实际税负率', value: `${(annual.taxRate * 100).toFixed(2)}%` },
    { label: '非现金收入', value: annual.nonCashIncome.toFixed(2) },
    { label: '税后扣款', value: annual.postTaxDeduction.toFixed(2) },
    { label: '汇算应补（退）', value: annual.settlementDiff.toFixed(2) },
  ]
  exportAnnualCsv({ rows, filename: `年度汇总_${settingsStore.year}.csv` })
}

/** 工资单导出：列序对齐常见工资单，方便直接和 HR 的表逐列核对 */
function onExportPayroll() {
  const start = Math.min(settingsStore.startMonth, settingsStore.endMonth)
  const end = Math.max(settingsStore.startMonth, settingsStore.endMonth)
  const monthlyRange = result.value.monthly.filter(
    (item) => item.month >= start && item.month <= end,
  )
  const incomes = salaryStore.incomes.filter((item) => item.enabled)
  const postTaxItems = salaryStore.postTaxDeductions.filter((item) => item.enabled)
  const personalTypes: InsuranceType[] = [
    'pension',
    'medical',
    'unemployment',
    'injury',
    'maternity',
    'housingFund',
  ]
  const insuranceOf = (month: number) =>
    result.value.insuranceMonthly.find((detail) => detail.month === month)
  // 只导出实际有个人缴纳的险种，避免整列 0 干扰核对
  const activeTypes = personalTypes.filter((type) =>
    monthlyRange.some((item) => (insuranceOf(item.month)?.personal[type] ?? 0) > 0),
  )

  const header = ['月份', '应发工资']
  incomes.forEach((item) => {
    if (item.scoreBased) header.push(`${item.name}(分)`)
    header.push(item.name)
  })
  activeTypes.forEach((type) => header.push(`${INSURANCE_LABELS[type]}(个人)`))
  header.push('缴纳共计', '个税')
  postTaxItems.forEach((item) => header.push(item.name))
  header.push('税后扣款合计', '总扣款', '实发工资', '备注')

  const rows = monthlyRange.map((item) => {
    const insurance = insuranceOf(item.month)
    const cells: string[] = [String(item.month), item.gross.toFixed(2)]
    incomes.forEach((income) => {
      if (income.scoreBased) cells.push(String(item.incomeScores?.[income.id] ?? 0))
      cells.push((item.incomeBreakdown[income.id] ?? 0).toFixed(2))
    })
    activeTypes.forEach((type) =>
      cells.push((insurance?.personal[type] ?? 0).toFixed(2)),
    )
    cells.push(
      item.insurancePersonal.toFixed(2),
      item.taxTotal.toFixed(2),
    )
    postTaxItems.forEach((entry) =>
      cells.push((item.postTaxDeductionBreakdown?.[entry.id] ?? 0).toFixed(2)),
    )
    cells.push(
      (item.postTaxDeduction ?? 0).toFixed(2),
      (item.totalDeduction ?? 0).toFixed(2),
      item.net.toFixed(2),
      item.note ?? '',
    )
    return cells
  })

  exportMatrixCsv({
    header,
    rows,
    filename: `工资单_${settingsStore.year}.csv`,
    successText: '工资单已导出为 CSV',
  })
}

/** 概览页结论带：把全年结果先摊成三句话，用户不用自己算 */
const monthsWorked = computed(() => settingsStore.endMonth - settingsStore.startMonth + 1)

interface Insight {
  label: string
  value: string
  hint: string
}

const insights = computed<Insight[]>(() => {
  const annual = result.value.annual
  const months = Math.max(1, monthsWorked.value)
  return [
    {
      label: '月均到手',
      value: `¥${(annual.net / months).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`,
      hint: `按 ${months} 个月计`,
    },
    {
      label: '到手率',
      value: `${(annual.netRate * 100).toFixed(1)}%`,
      hint: '年度到手 / 年度应发',
    },
    {
      label: '实际税负率',
      value: `${(annual.taxRate * 100).toFixed(1)}%`,
      hint: '年度个税 / 年度应发',
    },
  ]
})

const insightNote = computed(() => {
  const comparison = result.value.bonusComparison
  if (comparison) {
    const label =
      comparison.better === 'separate'
        ? '单独计税'
        : comparison.better === 'merged'
          ? '并入综合所得'
          : '拆分计税'
    const split =
      comparison.better === 'split' && comparison.splitAmount
        ? `（单独计税部分 ¥${comparison.splitAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}）`
        : ''
    return `年终奖建议${label}${split}`
  }
  const nonCash = result.value.annual.nonCashIncome
  return nonCash > 0
    ? `非现金福利 ¥${nonCash.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 计入应发，但不计入到手`
    : '以上口径按当前录入数据实时计算'
})

/** 月度明细分区目录，编号与元信息随列配置和奖金项实时变化 */
const sections = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { key: 'overview', label: '结果概览', meta: '到手 / 税负' },
    { key: 'monthly', label: '逐月明细', meta: `${schemaStore.visibleColumns.length} 列` },
    { key: 'annual', label: '年度汇总与图表', meta: '汇总 / 图表' },
  ]
  return items.map((item, index) => ({
    ...item,
    index: String(index + 1).padStart(2, '0'),
  }))
})

watch(sections, (items) => emit('sections', items), { immediate: true, deep: true })

const currentIndex = computed(() =>
  sections.value.findIndex((item) => item.key === props.section),
)
const prevSection = computed(() =>
  currentIndex.value > 0 ? sections.value[currentIndex.value - 1] : undefined,
)
const nextSection = computed(() => {
  const index = currentIndex.value
  return index >= 0 && index < sections.value.length - 1
    ? sections.value[index + 1]
    : undefined
})

const currentSection = computed(() => sections.value[currentIndex.value])
const currentSectionLabel = computed(() => currentSection.value?.label ?? '结果概览')
const pageProgress = computed(() => {
  const total = sections.value.length
  const current = Math.max(currentIndex.value + 1, 1)
  return `${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
})

/** 各分区的账本式头部说明 */
const SECTION_DESCS: Record<TableSectionKey, string> = {
  overview: '计算后的年度到手、税负与收入构成总览',
  monthly: '逐月发放与扣缴明细，点击月份可编辑单月数据，表格金额可直接修改',
  annual: '全年收入、五险一金与个税的年度汇总和可视化图表',
}
const currentSectionDesc = computed(() => SECTION_DESCS[props.section])

function goToSection(item: NavItem | undefined) {
  if (!item) return
  emit('select-section', item.key as TableSectionKey)
}
</script>

<template>
  <section class="table-view">
    <header class="table-view__head">
      <span class="table-view__index">{{ currentSection?.index }}</span>
      <div class="table-view__titles">
        <div class="table-view__title-row">
          <h2 class="table-view__title">{{ currentSectionLabel }}</h2>
          <span v-if="currentSection?.meta" class="table-view__meta">
            {{ currentSection.meta }}
          </span>
        </div>
        <p class="table-view__desc">{{ currentSectionDesc }}</p>
        <p class="table-view__range">
          {{ settingsStore.year }} 年 · {{ settingsStore.rangeText }}
        </p>
      </div>
      <div class="table-view__actions">
        <el-button :icon="ArrowLeft" size="small" text @click="emit('back')">返回录入</el-button>
        <el-button size="small" @click="explainVisible = true">计算说明</el-button>
        <template v-if="section === 'monthly'">
          <el-button size="small" :icon="Setting" @click="emit('config-columns')">表格列</el-button>
          <el-button size="small" type="primary" plain :icon="Download" @click="onExportCsv">
            导出明细
          </el-button>
          <el-button size="small" type="primary" plain :icon="Download" @click="onExportPayroll">
            导出工资单
          </el-button>
        </template>
        <el-button
          v-if="section === 'annual'"
          size="small"
          type="primary"
          plain
          :icon="Download"
          @click="onExportAnnual"
        >
          导出汇总
        </el-button>
      </div>
    </header>

    <section v-if="section === 'overview'" class="table-view__section">
      <div class="table-view__overview">
        <!-- 先给结论，再看细项：月均到手 / 到手率 / 税负率 / 年终奖建议 -->
        <div class="table-view__insights">
          <div v-for="item in insights" :key="item.label" class="insight">
            <span class="insight__label">{{ item.label }}</span>
            <strong class="insight__value num">{{ item.value }}</strong>
            <span class="insight__hint">{{ item.hint }}</span>
          </div>
          <p class="insight__note">{{ insightNote }}</p>
        </div>
        <ResultCards />
        <!-- 概览页直接挂趋势图，不必再切到年度页签 -->
        <Suspense>
          <ChartPanel mode="trend" />
          <template #fallback>
            <div class="chart-loading">图表加载中…</div>
          </template>
        </Suspense>
      </div>
    </section>

    <section v-if="section === 'monthly'" class="table-view__section">
      <el-card shadow="never" class="table-view__card">
        <template #header>
          <div class="table-view__card-head">
            <span class="table-view__card-title">逐月发放与扣缴</span>
            <span class="table-view__card-hint">
              {{ settingsStore.payTiming === 'next' ? '次月发放：工资于次月到账，明细按工资所属月展示；' : '' }}点击月份单元格打开单月编辑；表格中的金额、分数、备注可直接编辑并自动联动
            </span>
          </div>
        </template>
        <MonthlyTable
          @row-click="onRowClick"
          @config-columns="emit('config-columns')"
          @payroll-check="payrollVisible = true"
        />
      </el-card>
    </section>

    <section v-if="section === 'annual'" class="table-view__section">
      <!-- 宽屏并排：左边汇总表，右边图表；窄屏自动堆叠 -->
      <div class="table-view__annual">
        <el-card shadow="never" class="table-view__card">
          <template #header>
            <div class="table-view__card-head">
              <span class="table-view__card-title">年度汇总</span>
              <span class="table-view__card-hint">收入构成、五险一金与税额的全年口径</span>
            </div>
          </template>
          <AnnualTable />
        </el-card>
        <div class="table-view__charts">
          <Suspense>
            <ChartPanel mode="all" />
            <template #fallback>
              <div class="chart-loading">图表加载中…</div>
            </template>
          </Suspense>
        </div>
      </div>
    </section>

    <PagePager
      :progress="pageProgress"
      :prev-label="prevSection?.label"
      :next-label="nextSection?.label"
      last-label="返回录入设置"
      @prev="goToSection(prevSection)"
      @next="goToSection(nextSection)"
      @last="emit('back')"
    />

    <MonthEditorDrawer v-model="editorVisible" :month="editingMonth" />
    <ExplainDrawer v-model="explainVisible" />
    <PayrollCheckDrawer v-model="payrollVisible" />
  </section>
</template>

<style scoped>
.table-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
}

.table-view__section {
  animation: table-page-in 0.18s ease;
}

.table-view__overview {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 结论带：三个数字 + 一句提示，先看结论再看细项 */
.table-view__insights {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px 18px;
  padding: 12px 16px 10px;
  background: var(--app-surface);
  border: 1px solid var(--app-line);
  border-left: 3px solid var(--app-jade-600);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-sm);
}

.insight {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.insight__label {
  font-size: var(--app-text-sm);
  color: var(--app-ink-500);
}

.insight__value {
  font-family: var(--app-font-num);
  font-size: var(--app-text-xl);
  font-weight: 600;
  line-height: 1.25;
  color: var(--app-jade-700);
}

.insight__hint {
  font-size: var(--app-text-xs);
  color: var(--app-ink-300);
}

.insight__note {
  grid-column: 1 / -1;
  margin: 2px 0 0;
  padding-top: 6px;
  border-top: 1px dashed var(--app-line);
  font-size: var(--app-text-sm);
  color: var(--app-ink-500);
}

/* 年度页：汇总表与图表并排，窄屏堆叠 */
.table-view__annual {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 14px;
  align-items: start;
}

.table-view__charts {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

@media (max-width: 1200px) {
  .table-view__annual {
    grid-template-columns: minmax(0, 1fr);
  }
}

@keyframes table-page-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .table-view__section {
    animation: none;
  }
}

.table-view__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  padding: 16px 20px 14px;
  background: var(--app-surface);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-sm);
}

/* 与 SectionPanel 一致的账本式页眉：大号衬线序号 + 竖线 + 标题说明 + meta 胶囊 */
.table-view__index {
  min-width: 36px;
  padding: 0 2px 0 0;
  color: var(--app-ink-900);
  font-family: var(--app-font-ledger);
  font-size: var(--app-display);
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.03em;
}

.table-view__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-left: 14px;
  border-left: 1px solid var(--app-line);
}

.table-view__title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.table-view__title {
  margin: 0;
  font-size: var(--app-text-lg);
  font-weight: 700;
  color: var(--app-ink-900);
}

.table-view__meta {
  padding: 3px 10px;
  border: 1px solid var(--app-line);
  border-radius: 999px;
  color: var(--app-ink-700);
  background: var(--app-sunken-2);
  font-size: var(--app-text-sm);
  white-space: nowrap;
}

.table-view__desc {
  margin: 0;
  font-size: var(--app-text-base);
  line-height: 1.55;
  color: var(--app-ink-500);
}

.table-view__range {
  margin: 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-300);
}

.table-view__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.table-view__card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  justify-content: space-between;
}

.table-view__card-title {
  font-size: var(--app-text-md);
  font-weight: 700;
  color: var(--app-ink-900);
}

.table-view__card-hint {
  font-size: var(--app-text-sm);
  color: var(--app-ink-500);
}

.chart-loading {
  padding: 40px;
  text-align: center;
  color: var(--el-text-color-secondary);
}

@media (max-width: 640px) {
  /* 窄屏下操作区独占一行，标题区保持可读 */
  .table-view__head {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    padding: 15px 16px 13px;
  }

  .table-view__index {
    min-width: 30px;
    font-size: 24px;
  }

  .table-view__actions {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }
}
</style>
