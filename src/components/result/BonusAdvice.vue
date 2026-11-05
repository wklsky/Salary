<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/BonusAdvice.vue
 * @Description: 年终奖计税方式对比与临界无效区间提示
 */
import { computed } from 'vue'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatMoney } from '@/utils/format'
import { round2 } from '@/core'
import type { BonusMode } from '@/types'

const { result } = useSalaryCalculator()
const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()

const MODE_OPTIONS: { value: BonusMode; label: string }[] = [
  { value: 'auto', label: '自动择优' },
  { value: 'separate', label: '单独计税' },
  { value: 'merged', label: '并入综合所得' },
]

const comparison = computed(() => result.value.bonusComparison)

/**
 * 奖金实际发放额：从月度明细回算，包含阶段差异与单月覆盖
 * 直接读收入项的 amount 会在阶段/单月调整后与计算结果对不上
 */
const bonusTotal = computed(() => {
  const bonusIds = new Set(
    salaryStore.incomes.filter((item) => item.enabled && item.kind === 'bonus').map((item) => item.id),
  )
  return round2(
    result.value.monthly.reduce(
      (acc, month) =>
        acc +
        Object.entries(month.incomeBreakdown).reduce(
          (sum, [id, value]) => (bonusIds.has(id) ? sum + value : sum),
          0,
        ),
      0,
    ),
  )
})

/** 当前采用口径的展示文案，split 表示部分奖金单独计税 */
const APPLIED_LABEL: Record<string, string> = {
  separate: '单独计税',
  merged: '并入综合所得',
  split: '部分单独计税',
}

/**
 * 拆分方案的节省额 = 两种纯口径中较优者 − 拆分后税额
 * 纯口径之间的差额放在 diff 中单独展示，避免两个数字口径混淆
 */
const splitSaving = computed(() => {
  const item = comparison.value
  if (!item || item.better !== 'split' || item.splitTax === undefined) return 0
  const pureBest = Math.min(item.separateTax, item.mergedTax)
  return Math.max(0, pureBest - item.splitTax)
})

const adviceText = computed(() => {
  const item = comparison.value
  if (!item) return ''
  if (item.better === 'split') {
    return `建议将 ¥${formatMoney(item.splitAmount ?? 0)} 单独计税、其余并入综合所得，较最优纯口径再省 ¥${formatMoney(splitSaving.value)}`
  }
  const betterLabel = item.better === 'separate' ? '单独计税' : '并入综合所得'
  return `建议采用「${betterLabel}」，全年可少缴个税 ¥${formatMoney(item.diff)}`
})

/** 落在无效区间时，多发奖金反而降低到手，需显式提醒 */
const invalidRangeText = computed(() => {
  const range = comparison.value?.invalidRange
  if (!range) return ''
  return `当前年终奖落在 ¥${formatMoney(range.from)} ~ ¥${formatMoney(range.to)} 的无效区间内，此区间内多发奖金会导致到手减少，建议调整发放金额`
})
</script>

<template>
  <section
    v-if="comparison"
    class="bonus-advice"
    :class="comparison.invalidRange ? 'is-warning' : 'is-good'"
  >
    <span class="bonus-advice__badge" aria-hidden="true">%</span>
    <div class="bonus-advice__body">
      <div class="bonus-advice__top">
        <div class="bonus-advice__intro">
          <span class="bonus-advice__eyebrow">年终奖计税建议</span>
          <p class="bonus-advice__title">
            年终奖 ¥{{ formatMoney(bonusTotal) }} · {{ adviceText }}
          </p>
        </div>
        <el-radio-group
          :model-value="settingsStore.bonusMode"
          size="small"
          @update:model-value="
            (value: string | number | boolean) =>
              settingsStore.updateSettings({ bonusMode: value as BonusMode })
          "
        >
          <el-radio
            v-for="option in MODE_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </el-radio>
        </el-radio-group>
      </div>

      <div class="bonus-advice__detail">
        单独计税全年个税 ¥{{ formatMoney(comparison.separateTax) }}（其中奖金税额 ¥{{ formatMoney(comparison.bonusTax) }}）
        ｜并入综合所得全年个税 ¥{{ formatMoney(comparison.mergedTax) }}
        <template v-if="comparison.better === 'split'">
          ｜拆分方案全年个税 ¥{{ formatMoney(comparison.splitTax ?? 0) }}
        </template>
        ｜当前采用：{{ APPLIED_LABEL[result.appliedBonusMode] ?? '并入综合所得' }}
      </div>
      <div class="bonus-advice__detail">
        一个纳税年度内只允许一笔奖金单独计税，其余奖金并入综合所得
      </div>
      <div v-if="invalidRangeText" class="bonus-advice__warn">{{ invalidRangeText }}</div>
    </div>
  </section>
</template>

<style scoped>
.bonus-advice {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding: 14px 16px;
  border: 1px solid var(--app-line);
  border-left: 4px solid var(--app-jade-600);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
}

.bonus-advice.is-warning {
  border-left-color: var(--app-amber-600);
  background: linear-gradient(180deg, #fffaf2, #fff);
}

.bonus-advice__badge {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--app-jade-700);
  background: var(--app-jade-100);
  font-family: var(--app-font-num);
  font-size: 15px;
  font-weight: 600;
}

.bonus-advice.is-warning .bonus-advice__badge {
  color: var(--app-amber-700);
  background: var(--app-amber-100);
}

.bonus-advice__body {
  flex: 1;
  min-width: 0;
}

.bonus-advice__top {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.bonus-advice__intro {
  min-width: 0;
}

.bonus-advice__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--app-jade-700);
}

.bonus-advice.is-warning .bonus-advice__eyebrow {
  color: var(--app-amber-700);
}

.bonus-advice__title {
  margin-top: 2px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--app-ink-900);
}

.bonus-advice__detail {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-ink-700);
}

.bonus-advice__warn {
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-amber-700);
  background: var(--app-amber-100);
}
</style>
