<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/deduction/DeductionEditor.vue
 * @Description: 专项附加扣除与其他扣除录入，含互斥校验与超限提示
 */
import { computed } from 'vue'
import { DEDUCTION_LIST } from '@/config/specialDeductions'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import MoneyInput from '@/components/common/MoneyInput.vue'
import { formatMoney } from '@/utils/format'
import { round2 } from '@/core'
import type { DeductionKey, DeductionMeta } from '@/types'

const store = useSalaryStore()
const settingsStore = useSettingsStore()
const { result } = useSalaryCalculator()

/** 住房租金按城市分档，租房人群可直接套用常见档位 */
const RENT_TIERS = [1500, 1100, 800]

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 月`,
}))

/** 分摊比例档位：全额、夫妻/兄弟姐妹各半、不扣除 */
const SHARE_OPTIONS = [
  { value: 1, label: '全额' },
  { value: 0.5, label: '50%' },
  { value: 0, label: '0%' },
]

/** 上限：非独生子女分摊时适用更低的 sharedLimit */
function capOf(meta: DeductionMeta, soleProvider?: boolean): number {
  return meta.sharedLimit && soleProvider === false ? meta.sharedLimit : meta.limit
}

/** 实际可扣金额 = 申报金额 × 分摊比例 − 起扣线，再受上限约束 */
function effectiveAmount(meta: DeductionMeta): number {
  const state = store.deductions[meta.key]
  if (!state?.enabled) return 0
  const raw = round2(state.amount * (meta.splittable ? state.share : 1))
  const afterThreshold = Math.max(0, round2(raw - (meta.threshold ?? 0)))
  const cap = capOf(meta, state.soleProvider)
  return cap > 0 ? Math.min(afterThreshold, cap) : afterThreshold
}

/** 捐赠受应纳税所得额 30% 限制时，展示实际可扣金额 */
const donationLimited = computed(() => {
  const state = store.deductions.donation
  if (!state?.enabled) return false
  return result.value.annual.donationApplied < round2(state.amount)
})

const monthlyTotal = computed(() =>
  DEDUCTION_LIST.filter((meta) => meta.period === 'monthly').reduce(
    (acc, meta) => acc + effectiveAmount(meta),
    0,
  ),
)

/** 一次性扣除项目合计，展示在年度可扣的说明里 */
const annualOnceTotal = computed(() =>
  DEDUCTION_LIST.filter((meta) => meta.period === 'annual').reduce(
    (acc, meta) => acc + effectiveAmount(meta),
    0,
  ),
)

/** 年度可扣总额：按月项目按实际生效月数累计 + 一次性项目 */
const annualTotal = computed(() =>
  round2(
    DEDUCTION_LIST.reduce((acc, meta) => {
      if (meta.period !== 'monthly') return acc + effectiveAmount(meta)
      return acc + effectiveAmount(meta) * monthSpanOf(meta.key)
    }, 0),
  ),
)

/** 起止月区间内的可选项，保证结束月不早于起始月 */
function endMonthOptions(key: DeductionKey) {
  const from = store.deductions[key]?.startMonth ?? 1
  return MONTH_OPTIONS.filter((option) => option.value >= from)
}

/** 扣除生效月数：生效区间与计算区间取交集，中途入职/离职也不会多算 */
function monthSpanOf(key: DeductionKey): number {
  const state = store.deductions[key]
  if (!state?.enabled) return 0
  const from = Math.max(state.startMonth ?? 1, settingsStore.startMonth)
  const to = Math.min(state.endMonth ?? 12, settingsStore.endMonth)
  return Math.max(0, to - from + 1)
}

/** 调整生效区间，起始月晚于结束月时同步后移结束月 */
function updateRange(key: DeductionKey, payload: { startMonth?: number; endMonth?: number }) {
  const state = store.deductions[key]
  const from = payload.startMonth ?? state?.startMonth ?? 1
  const to = payload.endMonth ?? state?.endMonth ?? 12
  store.updateDeduction(key, { startMonth: from, endMonth: Math.max(from, to) })
}

/** 超出政策限额时给出提示，但不阻断计算（部分情形存在特殊审批额度） */
function isOverLimit(meta: DeductionMeta): boolean {
  const state = store.deductions[meta.key]
  if (!state?.enabled) return false
  const cap = capOf(meta, state.soleProvider)
  if (cap <= 0) return false
  return round2(state.amount - (meta.threshold ?? 0)) > cap
}

function onToggle(key: DeductionKey, enabled: boolean) {
  // 住房贷款利息与住房租金互斥，由 store 统一关闭同组其它项
  store.toggleDeduction(key, enabled)
}
</script>

<template>
  <section class="deduction-editor">
    <div class="deduction-editor__summary">
      <div class="summary-cell">
        <span class="summary-cell__label">月度可扣</span>
        <strong class="summary-cell__value">¥{{ formatMoney(monthlyTotal) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-cell__label">年度可扣</span>
        <strong class="summary-cell__value accent">¥{{ formatMoney(annualTotal) }}</strong>
        <span v-if="annualOnceTotal > 0" class="summary-cell__hint">
          含一次性扣除 ¥{{ formatMoney(annualOnceTotal) }}
        </span>
      </div>
    </div>

    <ul class="deduction-list">
      <li v-for="meta in DEDUCTION_LIST" :key="meta.key" class="deduction-item">
        <div class="deduction-item__head">
          <el-switch
            :model-value="store.deductions[meta.key]?.enabled ?? false"
            size="small"
            @update:model-value="(value: boolean) => onToggle(meta.key, value)"
          />
          <span class="deduction-item__label">{{ meta.label }}</span>
          <el-tooltip :content="meta.hint" placement="top" :show-after="200">
            <el-tag size="small" type="info" effect="plain">说明</el-tag>
          </el-tooltip>
          <el-tag v-if="meta.settlementOnly" size="small" type="warning" effect="plain">
            仅汇算扣除
          </el-tag>
        </div>

        <div v-if="store.deductions[meta.key]?.enabled" class="deduction-item__body">
          <MoneyInput
            :model-value="store.deductions[meta.key]?.amount ?? 0"
            :step="100"
            class="deduction-item__amount"
            @update:model-value="(value: number) => store.updateDeduction(meta.key, { amount: value })"
          />
          <span class="unit">{{ meta.period === 'monthly' ? '元/月' : '元/年' }}</span>

          <el-select
            v-if="meta.splittable"
            :model-value="store.deductions[meta.key]?.share ?? 1"
            class="deduction-item__share"
            @update:model-value="(value: number) => store.updateDeduction(meta.key, { share: value })"
          >
            <el-option
              v-for="option in SHARE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>

          <el-select
            v-if="meta.period === 'annual'"
            :model-value="store.deductions[meta.key]?.month ?? 12"
            class="deduction-item__month"
            @update:model-value="(value: number) => store.updateDeduction(meta.key, { month: value })"
          >
            <el-option
              v-for="option in MONTH_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>

          <template v-else>
            <span class="unit">生效</span>
            <el-select
              :model-value="store.deductions[meta.key]?.startMonth ?? 1"
              class="deduction-item__month"
              @update:model-value="
                (value: number) => updateRange(meta.key, { startMonth: value })
              "
            >
              <el-option
                v-for="option in MONTH_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <span class="unit">至</span>
            <el-select
              :model-value="store.deductions[meta.key]?.endMonth ?? 12"
              class="deduction-item__month"
              @update:model-value="(value: number) => updateRange(meta.key, { endMonth: value })"
            >
              <el-option
                v-for="option in endMonthOptions(meta.key)"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <span class="unit">共 {{ monthSpanOf(meta.key) }} 个月</span>
          </template>
        </div>

        <div v-if="store.deductions[meta.key]?.enabled" class="deduction-item__extra">
          <el-checkbox
            v-if="meta.key === 'elderlySupport'"
            :model-value="store.deductions[meta.key]?.soleProvider ?? true"
            size="small"
            @update:model-value="
              (value: boolean) => store.updateDeduction(meta.key, { soleProvider: value })
            "
          >
            独生子女（可扣 3000 元/月）
          </el-checkbox>

          <template v-if="meta.key === 'housingRent'">
            <span class="unit">按城市档位：</span>
            <el-button
              v-for="tier in RENT_TIERS"
              :key="tier"
              size="small"
              plain
              @click="store.updateDeduction(meta.key, { amount: tier })"
            >
              {{ tier }}
            </el-button>
          </template>
        </div>

        <p v-if="isOverLimit(meta)" class="deduction-item__warn">
          申报金额超出政策限额 ¥{{ formatMoney(capOf(meta, store.deductions[meta.key]?.soleProvider)) }}，请核实后录入
        </p>

        <p v-if="meta.threshold && store.deductions[meta.key]?.enabled" class="deduction-item__tip">
          填写的是自付总额，扣除 ¥{{ formatMoney(meta.threshold) }} 起付线后可扣
          ¥{{ formatMoney(effectiveAmount(meta)) }}
        </p>

        <p v-if="meta.key === 'donation' && donationLimited" class="deduction-item__tip">
          公益捐赠扣除额不得超过应纳税所得额的 30%，按当前收入实际可扣
          ¥{{ formatMoney(result.annual.donationApplied) }}
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.deduction-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deduction-editor__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 240px));
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

.summary-cell__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-cell__value {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.summary-cell__value.accent {
  color: var(--el-color-primary);
}

.summary-cell__hint {
  font-size: 11px;
  color: var(--app-ink-500);
}

.deduction-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.deduction-item {
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.deduction-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.deduction-item__label {
  flex: 1;
  font-size: 13px;
}

.deduction-item__body {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.deduction-item__amount {
  width: 150px;
}

.deduction-item__share {
  width: 82px;
}

.deduction-item__month {
  width: 88px;
}

.unit {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.deduction-item__warn {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-color-warning);
}

.deduction-item__extra {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.deduction-item__tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
