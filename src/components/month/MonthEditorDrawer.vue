<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/month/MonthEditorDrawer.vue
 * @Description: 单月数据编辑抽屉：逐项调整该月金额与缴费基数，系统实时重算该月工资
 */
import { computed } from 'vue'
import { RefreshLeft } from '@element-plus/icons-vue'
import { STAGE_LABELS } from '@/config/stages'
import { amountOfMonth, stageTypeOfMonth } from '@/core'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import MoneyInput from '@/components/common/MoneyInput.vue'
import { formatMoney } from '@/utils/format'
import type { IncomeItem } from '@/types'

interface Props {
  modelValue: boolean
  /** 当前编辑的月份，取值 1-12 */
  month: number
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  month: 1,
})

/**
 * 对外事件
 * @event update:model-value 抽屉展开状态变化，回传 { value: boolean }
 */
const emit = defineEmits<{
  'update:model-value': [value: boolean]
}>()

const store = useSalaryStore()
const schemaStore = useTableSchemaStore()
const { result } = useSalaryCalculator()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:model-value', value),
})

const month = computed(() => props.month)
const stage = computed(() => stageTypeOfMonth(store.stages, month.value))
const override = computed(() => store.monthOverrides[month.value])
const monthResult = computed(() => result.value.monthly[month.value - 1])
const insurance = computed(() =>
  result.value.insuranceMonthly.find((item) => item.month === month.value),
)

/**
 * 本月可编辑的收入项
 * 一次性收入只在其发放当月出现，在其他月份编辑不会改变计算结果
 */
const editableIncomes = computed(() =>
  store.incomes.filter(
    (item) => item.enabled && (item.cycle === 'monthly' || item.month === month.value),
  ),
)

/** 未覆盖时按收入项自身口径（阶段/逐月）自动算出的金额 */
function autoAmountOf(item: IncomeItem): number {
  return amountOfMonth(item, month.value, stage.value)
}

function amountOf(item: IncomeItem): number {
  const value = override.value?.amounts?.[item.id]
  return typeof value === 'number' ? value : autoAmountOf(item)
}

function isOverridden(item: IncomeItem): boolean {
  return typeof override.value?.amounts?.[item.id] === 'number'
}

function onAmountChange(item: IncomeItem, value: number) {
  // 与自动值一致时清除覆盖，避免留下无意义的差异标记
  if (value === autoAmountOf(item)) {
    store.setMonthAmount(month.value, item.id, undefined)
    return
  }
  store.setMonthAmount(month.value, item.id, value)
}

function onRestore(item: IncomeItem) {
  store.setMonthAmount(month.value, item.id, undefined)
}

/** 自定义列的本月值直接写在列定义上，与收入项的覆盖机制区分 */
function customValueOf(key: string): number {
  const column = schemaStore.customColumns.find((item) => item.key === key)
  return column?.custom?.values[month.value - 1] ?? 0
}

function onCustomValueChange(key: string, value: number) {
  schemaStore.setCustomValue(key, month.value, value)
}

const insuranceBase = computed(() => ({
  auto: insurance.value?.base ?? 0,
  value: override.value?.insuranceBase,
}))

function onBaseChange(value: number | undefined) {
  store.setMonthInsuranceBase(month.value, value)
}

const summary = computed(() => {
  const item = monthResult.value
  if (!item) return []
  return [
    { label: '应发合计', value: item.gross },
    { label: '五险一金（个人）', value: item.insurancePersonal },
    { label: '个人所得税', value: item.taxTotal },
    { label: '到手', value: item.net, accent: true },
  ]
})

function onResetMonth() {
  store.resetMonth(month.value)
}
</script>

<template>
  <el-drawer v-model="visible" :title="`${month} 月数据`" size="46%">
    <div class="month-editor">
      <header class="month-editor__head">
        <el-tag size="small" effect="plain">{{ STAGE_LABELS[stage] }}</el-tag>
        <span class="month-editor__hint">
          修改后自动重算该月工资，未修改的项按收入项自身的阶段/逐月口径取值
        </span>
      </header>

      <section class="month-editor__summary">
        <div
          v-for="cell in summary"
          :key="cell.label"
          class="summary-cell"
          :class="{ 'summary-cell--accent': cell.accent }"
        >
          <span class="summary-cell__label">{{ cell.label }}</span>
          <strong class="summary-cell__value">¥{{ formatMoney(cell.value) }}</strong>
        </div>
      </section>

      <section class="month-editor__block">
        <h4 class="block-title">收入项</h4>
        <ul class="item-list">
          <li v-for="item in editableIncomes" :key="item.id" class="item-row">
            <span class="item-row__name">
              {{ item.name }}
              <em v-if="item.cycle === 'once'">（{{ item.month }} 月一次性）</em>
              <el-tag v-if="isOverridden(item)" size="small" type="warning" effect="plain">
                已单独设置
              </el-tag>
            </span>
            <MoneyInput
              :model-value="amountOf(item)"
              size="small"
              class="item-row__input"
              @update:model-value="(value: number) => onAmountChange(item, value)"
            />
            <span class="item-row__auto">自动 ¥{{ formatMoney(autoAmountOf(item)) }}</span>
            <el-button
              size="small"
              text
              :icon="RefreshLeft"
              :disabled="!isOverridden(item)"
              @click="onRestore(item)"
            >
              还原
            </el-button>
          </li>
        </ul>
        <el-empty
          v-if="editableIncomes.length === 0"
          description="本月没有可编辑的收入项"
          :image-size="60"
        />
      </section>

      <section v-if="schemaStore.customColumns.length > 0" class="month-editor__block">
        <h4 class="block-title">自定义列</h4>
        <ul class="item-list">
          <li
            v-for="column in schemaStore.customColumns"
            :key="column.key"
            class="item-row"
          >
            <span class="item-row__name">{{ column.customLabel || column.label }}</span>
            <MoneyInput
              :model-value="customValueOf(column.key)"
              size="small"
              class="item-row__input"
              @update:model-value="(value: number) => onCustomValueChange(column.key, value)"
            />
            <span class="item-row__auto">
              {{ column.custom?.intoGross ? '计入应发' : '仅展示' }}
            </span>
          </li>
        </ul>
      </section>

      <section class="month-editor__block">
        <h4 class="block-title">社保缴费基数</h4>
        <div class="base-row">
          <!-- 清空表示恢复自动解析，故直接用 el-input-number 承载 undefined -->
          <el-input-number
            :model-value="insuranceBase.value"
            :min="0"
            :max="99999999"
            :step="100"
            :precision="2"
            size="small"
            controls-position="right"
            placeholder="按规则自动解析"
            class="item-row__input"
            @update:model-value="onBaseChange"
          />
          <span class="item-row__auto">自动 ¥{{ formatMoney(insuranceBase.auto) }}</span>
          <el-button
            size="small"
            text
            :icon="RefreshLeft"
            :disabled="insuranceBase.value === undefined"
            @click="onBaseChange(undefined)"
          >
            还原
          </el-button>
        </div>
      </section>

      <section class="month-editor__block">
        <h4 class="block-title">备注</h4>
        <el-input
          :model-value="override?.note ?? ''"
          size="small"
          type="textarea"
          :rows="2"
          placeholder="记录该月的特殊情况，如调薪、补发"
          @update:model-value="(value: string) => store.setMonthNote(month, value)"
        />
      </section>
    </div>

    <template #footer>
      <div class="month-editor__footer">
        <el-button :icon="RefreshLeft" @click="onResetMonth">清除本月所有调整</el-button>
        <el-button type="primary" @click="visible = false">完成</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.month-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.month-editor__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.month-editor__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.month-editor__summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.summary-cell--accent {
  background: var(--el-color-primary-light-9);
}

.summary-cell__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-cell__value {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.month-editor__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.block-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-row__name {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  font-size: 13px;
}

.item-row__name em {
  font-style: normal;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.item-row__input {
  width: 140px;
}

.item-row__auto {
  width: 130px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.base-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.month-editor__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
