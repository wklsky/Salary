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
  <el-alert
    v-if="comparison"
    :closable="false"
    class="bonus-advice"
    :type="comparison.invalidRange ? 'warning' : 'success'"
  >
    <template #title>
      <div class="bonus-advice__title">
        <span>年终奖 ¥{{ formatMoney(salaryStore.bonusTotal) }} · {{ adviceText }}</span>
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
    </template>
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
  </el-alert>
</template>

<style scoped>
.bonus-advice__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.bonus-advice__detail {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.bonus-advice__warn {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-warning);
}
</style>
