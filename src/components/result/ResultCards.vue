<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/ResultCards.vue
 * @Description: 年度核心指标卡片：应发、五险一金、个税、到手与单位用工成本
 */
import { computed } from 'vue'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatMoney, formatPercent } from '@/utils/format'
import { round2 } from '@/core'

const { result } = useSalaryCalculator()
const settingsStore = useSettingsStore()

/** 在职月份数，用于月均口径换算 */
const monthsWorked = computed(() => 12 - settingsStore.startMonth + 1)

const cards = computed(() => {
  const annual = result.value.annual
  const months = monthsWorked.value || 1
  return [
    {
      key: 'net',
      label: '年度到手',
      value: formatMoney(annual.net),
      sub: `月均 ¥${formatMoney(round2(annual.net / months))}`,
      type: 'primary' as const,
    },
    {
      key: 'gross',
      label: '年度应发',
      value: formatMoney(annual.gross),
      sub: `月均 ¥${formatMoney(round2(annual.gross / months))}`,
      type: 'default' as const,
    },
    {
      key: 'insurance',
      label: '五险一金(个人)',
      value: formatMoney(annual.insurancePersonal),
      sub: `占应发 ${formatPercent(round2(annual.insurancePersonal / (annual.gross || 1)))}`,
      type: 'default' as const,
    },
    {
      key: 'tax',
      label: '年度个税',
      value: formatMoney(annual.tax),
      sub: `实际税负 ${formatPercent(annual.taxRate)}`,
      type: 'default' as const,
    },
    {
      key: 'company',
      label: '单位用工成本',
      value: formatMoney(annual.companyCost),
      sub: `含单位缴纳 ¥${formatMoney(annual.insuranceCompany)}`,
      type: 'default' as const,
    },
    {
      key: 'netRate',
      label: '到手占比',
      value: formatPercent(annual.netRate),
      sub: `应纳税所得额 ¥${formatMoney(annual.taxableIncome)}`,
      type: 'success' as const,
    },
  ]
})

/** 汇算差额：负数表示可退税 */
const settlementText = computed(() => {
  const diff = result.value.annual.settlementDiff
  if (Math.abs(diff) < 0.01) return '汇算无差额'
  return diff < 0
    ? `汇算预计退税 ¥${formatMoney(Math.abs(diff))}`
    : `汇算预计补税 ¥${formatMoney(diff)}`
})
</script>

<template>
  <div class="result-cards">
    <el-card
      v-for="card in cards"
      :key="card.key"
      shadow="never"
      class="result-card"
      :class="{ 'result-card--primary': card.type === 'primary' }"
    >
      <div class="result-card__label">{{ card.label }}</div>
      <div class="result-card__value">¥{{ card.value }}</div>
      <div class="result-card__sub">{{ card.sub }}</div>
    </el-card>

    <el-card shadow="never" class="result-card result-card--settlement">
      <div class="result-card__label">年度汇算</div>
      <div class="result-card__value small">{{ settlementText }}</div>
      <div class="result-card__sub">
        汇算应纳税额 ¥{{ formatMoney(result.annual.settlementTax) }}
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.result-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.result-card {
  border-radius: 10px;
}

.result-card--primary {
  background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-fill-color-blank));
  border-color: var(--el-color-primary-light-7);
}

.result-card--settlement {
  background: var(--el-fill-color-light);
}

.result-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.result-card__value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.result-card__value.small {
  font-size: 16px;
}

.result-card--primary .result-card__value {
  color: var(--el-color-primary);
}

.result-card__sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
