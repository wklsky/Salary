<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/views/CompareView.vue
 * @Description: 方案对比视图：把已保存方案与当前录入并排比较关键指标
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Download, Plus } from '@element-plus/icons-vue'
import { calculateSalary } from '@/core'
import { useExport } from '@/composables/useExport'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore, type SalaryScheme } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import { formatMoney, formatPercent } from '@/utils/format'
import type { SalaryInput } from '@/types'

const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()
const schemaStore = useTableSchemaStore()
const { input, result } = useSalaryCalculator()
const { exportCompareCsv } = useExport()

const APPLIED_LABEL: Record<string, string> = {
  separate: '单独计税',
  merged: '并入综合所得',
  split: '部分单独计税',
}

/** 存档方案快照还原为计算入参；缺失字段按当前默认口径补齐 */
function schemeInput(scheme: SalaryScheme): SalaryInput {
  return {
    year: scheme.year,
    startMonth: scheme.startMonth,
    endMonth: scheme.endMonth ?? 12,
    incomes: scheme.incomes,
    insurance: scheme.insurance,
    deductions: scheme.deductions,
    bonusMode: scheme.bonusMode,
    stages: scheme.stages ?? [],
    taxpayerType: scheme.taxpayerType ?? 'resident',
    taxReductionMonthly: scheme.taxReductionMonthly ?? 0,
    monthOverrides: scheme.monthOverrides ?? {},
    customColumns: schemaStore.customColumnItems,
    postTaxDeductions: scheme.postTaxDeductions ?? [],
    customCities: settingsStore.customCities,
    payTiming: settingsStore.payTiming,
  }
}

interface CompareColumn {
  id: string
  name: string
  current: boolean
  months: number
  input: SalaryInput
  result: ReturnType<typeof calculateSalary>
}

/** 被临时隐藏的方案；方案较多时可只保留关心的几套同表对比 */
const hiddenIds = ref<string[]>([])

/** 第一列永远是当前录入，便于把存档方案和正在编辑的这套对照 */
const columns = computed<CompareColumn[]>(() => {
  const list: CompareColumn[] = [
    {
      id: 'current',
      name: '当前录入',
      current: true,
      months: settingsStore.monthCount,
      input: input.value,
      result: result.value,
    },
  ]
  for (const scheme of salaryStore.schemes) {
    if (hiddenIds.value.includes(scheme.id)) continue
    const input = schemeInput(scheme)
    list.push({
      id: scheme.id,
      name: scheme.name,
      current: false,
      months: input.endMonth - input.startMonth + 1,
      input,
      result: calculateSalary(input),
    })
  }
  return list
})

/** 顶栏计数：当前录入不算「方案」，避免未存方案时显示 1 套 */
const visibleSchemeCount = computed(() => columns.value.length - 1)
const metaText = computed(() =>
  salaryStore.schemes.length ? `当前录入 + ${visibleSchemeCount.value} 套存档` : '仅当前录入',
)

const emptyText = computed(() =>
  salaryStore.schemes.length
    ? '所有存档方案都已隐藏，勾选上方方案即可加入对比'
    : '还没有保存任何方案，先保存当前录入，再添加另一套对照',
)

function toggleScheme(id: string) {
  if (hiddenIds.value.includes(id)) {
    hiddenIds.value = hiddenIds.value.filter((item) => item !== id)
  } else {
    hiddenIds.value = [...hiddenIds.value, id]
  }
}

const currentColumn = computed(() => columns.value[0])

/** 年度到手最高的方案，突出「哪套更划算」 */
const bestId = computed(() => {
  let best = ''
  let bestNet = Number.NEGATIVE_INFINITY
  for (const column of columns.value) {
    if (column.result.annual.net > bestNet) {
      bestNet = column.result.annual.net
      best = column.id
    }
  }
  return best
})

function monthlyNetOf(column: CompareColumn): number {
  return column.months > 0 ? column.result.annual.net / column.months : 0
}

/** 相对当前录入的差额文案，用于表格内的小字对比 */
function diffText(value: number, base: number): string {
  const diff = value - base
  if (Math.abs(diff) < 0.01) return '持平'
  return `${diff > 0 ? '+' : '-'}¥${formatMoney(Math.abs(diff))}`
}

function diffClass(value: number, base: number): string {
  const diff = value - base
  if (Math.abs(diff) < 0.01) return 'is-flat'
  return diff > 0 ? 'is-up' : 'is-down'
}

async function saveCurrent() {
  try {
    const { value } = await ElMessageBox.prompt('给这套录入取个名字，之后可以并排对比', '保存当前方案', {
      inputValue: `方案 ${salaryStore.schemes.length + 1}`,
      inputPlaceholder: '如：2026 年 Offer A',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (input: string) => (input.trim() ? true : '名称不能为空'),
    })
    const name = value?.trim()
    if (!name) return
    salaryStore.saveScheme(name, {
      year: settingsStore.year,
      startMonth: settingsStore.startMonth,
      endMonth: settingsStore.endMonth,
      bonusMode: settingsStore.bonusMode,
      taxpayerType: settingsStore.taxpayerType,
      taxReductionMonthly: settingsStore.taxReductionMonthly,
    })
    ElMessage.success(`已保存方案「${name}」`)
  } catch {
    // 取消保存时无需提示
  }
}

function applyScheme(column: CompareColumn) {
  if (column.current) return
  const meta = salaryStore.applyScheme(column.id)
  if (!meta) return
  settingsStore.updateSettings(meta)
  ElMessage.success(`已应用方案「${column.name}」`)
}

async function removeScheme(column: CompareColumn) {
  if (column.current) return
  try {
    await ElMessageBox.confirm(`删除方案「${column.name}」？该操作不可撤销。`, '删除方案', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    salaryStore.removeScheme(column.id)
    ElMessage.success('已删除')
  } catch {
    // 取消删除
  }
}

/** 导出当前对比矩阵为 CSV：行是指标，列是方案，与页面看到的口径一致 */
function onExportCompare() {
  const list = columns.value
  const money = (value: number) => formatMoney(value)
  const rows = [
    {
      label: '计算区间',
      values: list.map(
        (column) =>
          `${column.input.year} 年 ${column.input.startMonth}-${column.input.endMonth} 月`,
      ),
    },
    { label: '年度应发', values: list.map((column) => money(column.result.annual.gross)) },
    {
      label: '五险一金（个人）',
      values: list.map((column) => money(column.result.annual.insurancePersonal)),
    },
    { label: '全年个税', values: list.map((column) => money(column.result.annual.tax)) },
    {
      label: '年终奖计税',
      values: list.map(
        (column) => APPLIED_LABEL[column.result.appliedBonusMode] ?? '并入综合所得',
      ),
    },
    { label: '年度到手', values: list.map((column) => money(column.result.annual.net)) },
    { label: '月均到手', values: list.map((column) => money(monthlyNetOf(column))) },
    {
      label: '实际税负率',
      values: list.map((column) => formatPercent(column.result.annual.taxRate)),
    },
    {
      label: '到手率',
      values: list.map((column) => formatPercent(column.result.annual.netRate)),
    },
    {
      label: '汇算差异',
      values: list.map((column) => {
        const diff = column.result.annual.settlementDiff
        if (Math.abs(diff) < 0.01) return '持平'
        return diff > 0 ? `应补 ${money(diff)}` : `应退 ${money(-diff)}`
      }),
    },
  ]
  exportCompareCsv({
    columns: list.map((column) => ({ name: column.name })),
    rows,
    filename: `方案对比_${settingsStore.year}.csv`,
  })
}
</script>

<template>
  <section class="compare-view">
    <header class="compare-view__head">
      <span class="compare-view__index" aria-hidden="true">≈</span>
      <div class="compare-view__titles">
        <div class="compare-view__title-row">
          <h2 class="compare-view__title">方案对比</h2>
          <span class="compare-view__meta">{{ metaText }}</span>
        </div>
        <p class="compare-view__desc">把已保存方案与当前录入并排比较，看哪一套到手更多</p>
      </div>
      <div class="compare-view__actions">
        <el-button
          v-if="columns.length > 1"
          size="small"
          :icon="Download"
          @click="onExportCompare"
        >
          导出对比
        </el-button>
        <el-button size="small" type="primary" plain :icon="Plus" @click="saveCurrent">
          保存当前方案
        </el-button>
      </div>
    </header>

    <div v-if="salaryStore.schemes.length" class="compare-view__picks">
      <span class="compare-view__picks-label">参与对比</span>
      <el-check-tag
        v-for="scheme in salaryStore.schemes"
        :key="scheme.id"
        :checked="!hiddenIds.includes(scheme.id)"
        @change="toggleScheme(scheme.id)"
      >
        {{ scheme.name }}
      </el-check-tag>
      <span class="compare-view__picks-hint">未勾选的方案不参与并排计算与导出</span>
    </div>

    <div v-if="columns.length <= 1" class="compare-view__empty">
      <el-empty :description="emptyText">
        <el-button type="primary" plain :icon="Plus" @click="saveCurrent">保存当前方案</el-button>
      </el-empty>
    </div>

    <template v-else>
      <div class="compare-cards">
        <article
          v-for="column in columns"
          :key="column.id"
          class="compare-card"
          :class="{ 'is-current': column.current, 'is-best': column.id === bestId }"
        >
          <header class="compare-card__head">
            <span class="compare-card__name">{{ column.name }}</span>
            <span v-if="column.id === bestId" class="compare-card__badge">到手最高</span>
          </header>
          <p class="compare-card__net">¥{{ formatMoney(column.result.annual.net) }}</p>
          <p class="compare-card__sub">
            年度到手 · 月均 ¥{{ formatMoney(monthlyNetOf(column)) }}
          </p>
          <footer v-if="!column.current" class="compare-card__ops">
            <el-button size="small" @click="applyScheme(column)">应用</el-button>
            <el-button size="small" text type="danger" :icon="Delete" @click="removeScheme(column)">
              删除
            </el-button>
          </footer>
        </article>
      </div>

      <el-card shadow="never" class="compare-view__panel ledger-card">
        <template #header>
          <div class="compare-view__panel-head">
            <span class="compare-view__panel-title">指标对照</span>
            <span class="compare-view__panel-hint">括号内为相对「当前录入」的差额</span>
          </div>
        </template>
        <div class="compare-table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th class="compare-table__label" scope="col">指标</th>
                <th
                  v-for="column in columns"
                  :key="column.id"
                  scope="col"
                  :class="{ 'is-best': column.id === bestId }"
                >
                  {{ column.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">计算区间</th>
                <td v-for="column in columns" :key="column.id">
                  {{ column.input.year }} 年 · {{ column.input.startMonth }}–{{ column.input.endMonth }} 月
                </td>
              </tr>
              <tr>
                <th scope="row">年度应发</th>
                <td v-for="column in columns" :key="column.id">
                  ¥{{ formatMoney(column.result.annual.gross) }}
                </td>
              </tr>
              <tr>
                <th scope="row">五险一金（个人）</th>
                <td v-for="column in columns" :key="column.id">
                  ¥{{ formatMoney(column.result.annual.insurancePersonal) }}
                </td>
              </tr>
              <tr>
                <th scope="row">全年个税</th>
                <td v-for="column in columns" :key="column.id">
                  ¥{{ formatMoney(column.result.annual.tax) }}
                </td>
              </tr>
              <tr>
                <th scope="row">年终奖计税</th>
                <td v-for="column in columns" :key="column.id">
                  {{ APPLIED_LABEL[column.result.appliedBonusMode] ?? '并入综合所得' }}
                </td>
              </tr>
              <tr class="is-emphasis">
                <th scope="row">年度到手</th>
                <td
                  v-for="column in columns"
                  :key="column.id"
                  :class="{ 'is-best': column.id === bestId }"
                >
                  ¥{{ formatMoney(column.result.annual.net) }}
                  <template v-if="!column.current">
                    <span class="compare-table__diff" :class="diffClass(column.result.annual.net, currentColumn.result.annual.net)">
                      （{{ diffText(column.result.annual.net, currentColumn.result.annual.net) }}）
                    </span>
                  </template>
                </td>
              </tr>
              <tr>
                <th scope="row">月均到手</th>
                <td v-for="column in columns" :key="column.id">
                  ¥{{ formatMoney(monthlyNetOf(column)) }}
                  <template v-if="!column.current">
                    <span class="compare-table__diff" :class="diffClass(monthlyNetOf(column), monthlyNetOf(currentColumn))">
                      （{{ diffText(monthlyNetOf(column), monthlyNetOf(currentColumn)) }}）
                    </span>
                  </template>
                </td>
              </tr>
              <tr>
                <th scope="row">实际税负率</th>
                <td v-for="column in columns" :key="column.id">
                  {{ formatPercent(column.result.annual.taxRate) }}
                </td>
              </tr>
              <tr>
                <th scope="row">到手率</th>
                <td v-for="column in columns" :key="column.id">
                  {{ formatPercent(column.result.annual.netRate) }}
                </td>
              </tr>
              <tr>
                <th scope="row">汇算差异</th>
                <td v-for="column in columns" :key="column.id">
                  <template v-if="Math.abs(column.result.annual.settlementDiff) < 0.01">持平</template>
                  <template v-else-if="column.result.annual.settlementDiff > 0">
                    应补 ¥{{ formatMoney(column.result.annual.settlementDiff) }}
                  </template>
                  <template v-else>
                    应退 ¥{{ formatMoney(-column.result.annual.settlementDiff) }}
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </el-card>
    </template>
  </section>
</template>

<style scoped>
.compare-view {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.compare-view__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 16px 20px 14px;
  background: var(--app-surface);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-sm);
}

.compare-view__index {
  font-family: var(--app-font-ledger), serif;
  font-size: var(--app-display);
  line-height: 1;
  color: var(--app-jade-700);
}

.compare-view__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.compare-view__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.compare-view__title {
  margin: 0;
  font-size: var(--app-text-lg);
  font-weight: 700;
  color: var(--app-ink-900);
}

.compare-view__meta {
  padding: 3px 10px;
  border: 1px solid var(--app-line);
  border-radius: 999px;
  background: var(--app-sunken-2);
  font-size: var(--app-text-sm);
  color: var(--app-ink-500);
}

.compare-view__desc {
  margin: 0;
  font-size: var(--app-text-base);
  color: var(--app-ink-500);
}

.compare-view__actions {
  display: flex;
  gap: 8px;
}

.compare-view__empty {
  padding: 24px;
  background: var(--app-surface);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-sm);
}

.compare-view__picks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 10px 14px;
  background: var(--app-surface);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
}

.compare-view__picks-label {
  font-size: var(--app-text-sm);
  font-weight: 600;
  color: var(--app-ink-500);
}

.compare-view__picks-hint {
  margin-left: auto;
  font-size: var(--app-text-sm);
  color: var(--app-ink-300);
}

.compare-view__picks :deep(.el-check-tag) {
  border: 1px solid var(--app-line);
  background: var(--app-sunken-2);
  color: var(--app-ink-700);
}

.compare-view__picks :deep(.el-check-tag.is-checked) {
  border-color: var(--app-jade-600);
  background: var(--app-jade-100);
  color: var(--app-jade-700);
}

.compare-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.compare-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  background: var(--app-surface);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-sm);
}

.compare-card.is-current {
  border-color: var(--app-line-strong);
  background: linear-gradient(180deg, var(--app-sunken), var(--app-surface));
}

.compare-card.is-best {
  border-color: var(--app-jade-600);
  box-shadow: 0 10px 24px -16px rgb(15 118 110 / 35%);
}

.compare-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.compare-card__name {
  font-size: var(--app-text-base);
  font-weight: 600;
  color: var(--app-ink-900);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.compare-card__badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--app-jade-100);
  color: var(--app-jade-700);
  font-size: 11px;
  font-weight: 600;
}

.compare-card__net {
  margin: 2px 0 0;
  font-family: var(--app-font-num);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--app-ink-900);
}

.compare-card__sub {
  margin: 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-500);
}

.compare-card__ops {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.compare-view__panel {
  border-radius: var(--app-radius-md);
}

.compare-view__panel-head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: baseline;
  justify-content: space-between;
}

.compare-view__panel-title {
  font-size: var(--app-text-md);
  font-weight: 600;
  color: var(--app-ink-900);
}

.compare-view__panel-hint {
  font-size: var(--app-text-sm);
  color: var(--app-ink-300);
}

.compare-table-wrap {
  overflow-x: auto;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--app-text-base);
}

.compare-table th,
.compare-table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--app-line);
  text-align: right;
  white-space: nowrap;
}

.compare-table thead th {
  font-size: var(--app-text-sm);
  font-weight: 600;
  color: var(--app-ink-500);
  background: var(--app-sunken);
}

.compare-table thead th.is-best {
  color: var(--app-jade-700);
}

.compare-table tbody th {
  text-align: left;
  font-weight: 500;
  color: var(--app-ink-700);
  background: var(--app-table-head);
}

.compare-table tbody td {
  color: var(--app-ink-900);
  font-variant-numeric: tabular-nums;
}

.compare-table tbody tr:last-child th,
.compare-table tbody tr:last-child td {
  border-bottom: 0;
}

.compare-table tr.is-emphasis td {
  font-weight: 600;
}

.compare-table td.is-best {
  color: var(--app-jade-700);
  background: rgb(231 242 240 / 55%);
}

.compare-table__diff {
  font-size: 11px;
  font-weight: 500;
}

.compare-table__diff.is-up {
  color: var(--app-jade-700);
}

.compare-table__diff.is-down {
  color: var(--app-amber-700);
}

.compare-table__diff.is-flat {
  color: var(--app-ink-300);
}

@media (max-width: 640px) {
  .compare-view__head {
    grid-template-columns: auto minmax(0, 1fr);
    padding: 14px 16px 12px;
  }

  .compare-view__index {
    font-size: 24px;
  }

  .compare-view__actions {
    grid-column: 1 / -1;
  }
}
</style>
