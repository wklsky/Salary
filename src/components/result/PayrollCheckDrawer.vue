<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/PayrollCheckDrawer.vue
 * @Description: 工资单核对抽屉：录入实际个税/实发，与系统结果逐月对账
 */
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatMoney } from '@/utils/format'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:model-value': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:model-value', value),
})

const { result } = useSalaryCalculator()
const settingsStore = useSettingsStore()

/** 实际工资单录入值：按「年度-月份」存档，跨年切换互不影响 */
interface CheckEntry {
  tax?: number
  net?: number
}
const stored = useStorage<Record<string, CheckEntry>>('salary-calc:payroll-check', {})

function keyOf(month: number): string {
  return `${settingsStore.year}-${month}`
}

function actualOf(month: number, field: keyof CheckEntry): number | undefined {
  const value = stored.value[keyOf(month)]?.[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function setActual(month: number, field: keyof CheckEntry, value: number | undefined) {
  const key = keyOf(month)
  const entry = { ...(stored.value[key] ?? {}) }
  if (value === undefined || !Number.isFinite(value)) {
    delete entry[field]
  } else {
    entry[field] = value
  }
  stored.value = { ...stored.value, [key]: entry }
}

interface CheckRow {
  month: number
  systemTax: number
  systemNet: number
  actualTax?: number
  actualNet?: number
  taxDiff?: number
  netDiff?: number
}

const rows = computed<CheckRow[]>(() => {
  const start = Math.min(settingsStore.startMonth, settingsStore.endMonth)
  const end = Math.max(settingsStore.startMonth, settingsStore.endMonth)
  return result.value.monthly
    .filter((item) => item.month >= start && item.month <= end)
    .map((item) => {
      const actualTax = actualOf(item.month, 'tax')
      const actualNet = actualOf(item.month, 'net')
      return {
        month: item.month,
        systemTax: item.taxTotal,
        systemNet: item.net,
        actualTax,
        actualNet,
        taxDiff: actualTax === undefined ? undefined : round(actualTax - item.taxTotal),
        netDiff: actualNet === undefined ? undefined : round(actualNet - item.net),
      }
    })
})

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** 差异超过 1 分钱才提示，避免四舍五入带来的噪声 */
function diffClass(diff?: number): string {
  if (diff === undefined) return ''
  if (Math.abs(diff) < 0.01) return 'is-match'
  return diff > 0 ? 'is-more' : 'is-less'
}

function diffText(diff?: number): string {
  if (diff === undefined) return '未录入'
  if (Math.abs(diff) < 0.01) return '一致'
  return `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`
}

const taxChecked = computed(() => rows.value.filter((row) => row.actualTax !== undefined))
const netChecked = computed(() => rows.value.filter((row) => row.actualNet !== undefined))
const taxDiffTotal = computed(() => round(taxChecked.value.reduce((acc, row) => acc + (row.taxDiff ?? 0), 0)))
const netDiffTotal = computed(() => round(netChecked.value.reduce((acc, row) => acc + (row.netDiff ?? 0), 0)))

const hasDifference = computed(
  () =>
    taxChecked.value.some((row) => Math.abs(row.taxDiff ?? 0) >= 0.01) ||
    netChecked.value.some((row) => Math.abs(row.netDiff ?? 0) >= 0.01),
)

function clearAll() {
  stored.value = {}
}
</script>

<template>
  <el-drawer v-model="visible" title="工资单核对" size="720px" class="payroll-check">
    <section class="payroll-check__body">
      <p class="payroll-check__hint">
        录入工资单上的「实际个税」与「实际实发」，系统会逐月对比。差异在 1 分钱以内视为一致。
        系统按累计预扣法计算；若工资单按单月独立计税，差异会从跳档月起放大，多扣部分可在年度汇算退回。
      </p>

      <el-table :data="rows" size="small" border max-height="420" class="payroll-check__table">
        <el-table-column prop="month" label="月份" width="54" align="center" />
        <el-table-column label="实际个税" width="112">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.actualTax"
              :min="0"
              :step="0.01"
              :precision="2"
              size="small"
              controls-position="right"
              placeholder="工资单"
              @update:model-value="(value: number | undefined) => setActual(row.month, 'tax', value)"
            />
          </template>
        </el-table-column>
        <el-table-column label="系统个税" width="92" align="right">
          <template #default="{ row }">{{ formatMoney(row.systemTax) }}</template>
        </el-table-column>
        <el-table-column label="税差" width="78" align="right">
          <template #default="{ row }">
            <span :class="diffClass(row.taxDiff)">{{ diffText(row.taxDiff) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="实际实发" width="112">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.actualNet"
              :min="0"
              :step="0.01"
              :precision="2"
              size="small"
              controls-position="right"
              placeholder="工资单"
              @update:model-value="(value: number | undefined) => setActual(row.month, 'net', value)"
            />
          </template>
        </el-table-column>
        <el-table-column label="系统实发" width="92" align="right">
          <template #default="{ row }">{{ formatMoney(row.systemNet) }}</template>
        </el-table-column>
        <el-table-column label="实发差" width="78" align="right">
          <template #default="{ row }">
            <span :class="diffClass(row.netDiff)">{{ diffText(row.netDiff) }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="payroll-check__summary">
        <div class="payroll-check__item">
          <span>已核对个税</span>
          <strong>{{ taxChecked.length }} 个月</strong>
          <em :class="diffClass(taxDiffTotal)">合计差 {{ taxDiffTotal > 0 ? '+' : '' }}{{ taxDiffTotal.toFixed(2) }}</em>
        </div>
        <div class="payroll-check__item">
          <span>已核对实发</span>
          <strong>{{ netChecked.length }} 个月</strong>
          <em :class="diffClass(netDiffTotal)">合计差 {{ netDiffTotal > 0 ? '+' : '' }}{{ netDiffTotal.toFixed(2) }}</em>
        </div>
        <div class="payroll-check__item payroll-check__item--action">
          <el-button size="small" text type="primary" :disabled="!taxChecked.length && !netChecked.length" @click="clearAll">
            清空录入
          </el-button>
        </div>
      </div>

      <p v-if="hasDifference" class="payroll-check__note">
        存在差异：先确认工资单的应发是否已包含绩效等浮动项，再确认是否按累计预扣法计税；
        若工资单多扣，年度汇算会退回多缴部分。
      </p>
      <p v-else class="payroll-check__note is-match-note">
        当前录入与系统结果一致（1 分钱以内）。录入更多月份后可继续核对。
      </p>
    </section>
  </el-drawer>
</template>

<style scoped>
.payroll-check__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.payroll-check__hint {
  margin: 0;
  font-size: var(--app-text-xs);
  line-height: 1.7;
  color: var(--app-ink-500);
}

.payroll-check__table :deep(.el-table__cell) {
  padding: 5px 0;
}

.payroll-check__table :deep(.el-input-number) {
  width: 100%;
}

.is-match {
  color: var(--app-jade-700);
}

.is-more {
  color: var(--app-amber-700);
  font-weight: 600;
}

.is-less {
  color: var(--app-rose-600);
  font-weight: 600;
}

.payroll-check__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 10px 12px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  background: var(--app-sunken);
}

.payroll-check__item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: var(--app-text-xs);
  color: var(--app-ink-500);
}

.payroll-check__item strong {
  font-family: var(--app-font-num);
  font-size: var(--app-text-md);
  color: var(--app-ink-900);
}

.payroll-check__item em {
  font-style: normal;
}

.payroll-check__item--action {
  margin-left: auto;
}

.payroll-check__note {
  margin: 0;
  font-size: var(--app-text-xs);
  line-height: 1.7;
  color: var(--app-amber-700);
}

.payroll-check__note.is-match-note {
  color: var(--app-ink-500);
}
</style>
