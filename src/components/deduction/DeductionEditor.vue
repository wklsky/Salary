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
import MoneyInput from '@/components/common/MoneyInput.vue'
import { formatMoney } from '@/utils/format'
import { round2 } from '@/core'
import type { DeductionKey, DeductionMeta } from '@/types'

const store = useSalaryStore()
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

const annualOnceTotal = computed(() =>
  DEDUCTION_LIST.filter((meta) => meta.period === 'annual').reduce(
    (acc, meta) => acc + effectiveAmount(meta),
    0,
  ),
)

/** 年度可扣总额：按月项目 × 12 + 一次性项目 */
const annualTotal = computed(() => round2(monthlyTotal.value * 12 + annualOnceTotal.value))

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
      <span>月度可扣 <strong>¥{{ formatMoney(monthlyTotal) }}</strong></span>
      <span>年度可扣 <strong>¥{{ formatMoney(annualTotal) }}</strong></span>
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
            size="small"
            class="deduction-item__amount"
            @update:model-value="(value: number) => store.updateDeduction(meta.key, { amount: value })"
          />
          <span class="unit">{{ meta.period === 'monthly' ? '元/月' : '元/年' }}</span>

          <el-select
            v-if="meta.splittable"
            :model-value="store.deductions[meta.key]?.share ?? 1"
            size="small"
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
            size="small"
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

          <span v-else class="unit">按月扣除</span>
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
  display: flex;
  justify-content: space-around;
  padding: 8px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  font-size: 13px;
}

.deduction-editor__summary strong {
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
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
  margin-top: 8px;
}

.deduction-item__amount {
  width: 130px;
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
