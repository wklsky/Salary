<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/ResultCards.vue
 * @Description: 年度结果概览：到手主卡 + 收入构成条 + 关键指标网格
 */
import { computed } from 'vue'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatMoney, formatPercent } from '@/utils/format'
import { round2 } from '@/core'

const { result } = useSalaryCalculator()
const settingsStore = useSettingsStore()

const annual = computed(() => result.value.annual)

/** 在职月份数，用于月均口径换算；必须按实际区间计算，不能默认算到年末 */
const monthsWorked = computed(
  () => Math.max(1, settingsStore.endMonth - settingsStore.startMonth + 1),
)

/** 非居民个人按月分项计税，不办理居民个人的年度汇算 */
const isResident = computed(() => settingsStore.taxpayerType === 'resident')

/** 收入构成：四项相加等于应发，用于堆叠条与图例 */
const segments = computed(() => {
  const gross = annual.value.gross || 1
  return [
    { key: 'net', label: '到手', value: annual.value.net, ratio: annual.value.net / gross },
    {
      key: 'insurance',
      label: '五险一金',
      value: annual.value.insurancePersonal,
      ratio: annual.value.insurancePersonal / gross,
    },
    { key: 'tax', label: '个税', value: annual.value.tax, ratio: annual.value.tax / gross },
    {
      key: 'postTax',
      label: '税后扣款',
      value: annual.value.postTaxDeduction,
      ratio: annual.value.postTaxDeduction / gross,
    },
    {
      key: 'nonCash',
      label: '非现金福利',
      value: annual.value.nonCashIncome,
      ratio: annual.value.nonCashIncome / gross,
    },
  ]
})

const visibleSegments = computed(() => segments.value.filter((segment) => segment.value > 0))

const stats = computed(() => {
  const months = monthsWorked.value || 1
  return [
    {
      key: 'gross',
      label: '年度应发',
      value: annual.value.gross,
      sub: `月均 ¥${formatMoney(round2(annual.value.gross / months))}`,
    },
    {
      key: 'insurance',
      label: '五险一金（个人）',
      value: annual.value.insurancePersonal,
      sub: `占应发 ${formatPercent(annual.value.insurancePersonal / (annual.value.gross || 1))}`,
    },
    {
      key: 'tax',
      label: '年度个税',
      value: annual.value.tax,
      sub: `实际税负 ${formatPercent(annual.value.taxRate)}`,
    },
    {
      key: 'company',
      label: '单位用工成本',
      value: annual.value.companyCost,
      sub: `含单位缴纳 ¥${formatMoney(annual.value.insuranceCompany)}`,
    },
  ]
})

/** 汇算差额：负数表示可退税 */
const settlementText = computed(() => {
  if (!isResident.value) return '不适用年度汇算'
  const diff = annual.value.settlementDiff
  if (Math.abs(diff) < 0.01) return '汇算无差额'
  return diff < 0
    ? `预计退税 ¥${formatMoney(Math.abs(diff))}`
    : `预计补税 ¥${formatMoney(diff)}`
})
</script>

<template>
  <section class="result-summary">
    <article class="summary-hero">
      <div class="summary-hero__head">
        <span class="summary-hero__eyebrow">年度到手</span>
        <span class="summary-hero__pill">
          {{ isResident ? `到手占比 ${formatPercent(annual.netRate)}` : '非居民个人' }}
        </span>
      </div>

      <div class="summary-hero__value num">
        <span class="summary-hero__currency">¥</span>{{ formatMoney(annual.net) }}
      </div>
      <p class="summary-hero__sub">
        月均 ¥{{ formatMoney(round2(annual.net / monthsWorked)) }}
        <span aria-hidden="true">·</span>
        应纳税所得额 ¥{{ formatMoney(annual.taxableIncome) }}
      </p>

      <div class="summary-hero__bar" role="img" aria-label="年度收入构成比例">
        <span
          v-for="segment in visibleSegments"
          :key="segment.key"
          class="summary-hero__bar-seg"
          :class="`is-${segment.key}`"
          :style="{ width: `${segment.ratio * 100}%` }"
        />
      </div>

      <ul class="summary-hero__legend">
        <li v-for="segment in visibleSegments" :key="segment.key">
          <i class="summary-hero__dot" :class="`is-${segment.key}`" />
          <span class="summary-hero__legend-label">{{ segment.label }}</span>
          <strong class="summary-hero__legend-value num">
            ¥{{ formatMoney(segment.value) }}
          </strong>
          <span class="summary-hero__legend-ratio num">{{ formatPercent(segment.ratio) }}</span>
        </li>
      </ul>
    </article>

    <div class="stat-grid">
      <article v-for="stat in stats" :key="stat.key" class="stat">
        <span class="stat__label">{{ stat.label }}</span>
        <strong class="stat__value num">¥{{ formatMoney(stat.value) }}</strong>
        <span class="stat__sub">{{ stat.sub }}</span>
      </article>

      <article class="stat stat--settlement">
        <span class="stat__label">年度汇算</span>
        <strong class="stat__value stat__value--text">{{ settlementText }}</strong>
        <span class="stat__sub">
          {{
            isResident
              ? `汇算应纳税额 ¥${formatMoney(annual.settlementTax)}`
              : '按月分项计税，无需年度汇算'
          }}
        </span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.result-summary {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.summary-hero {
  position: relative;
  overflow: hidden;
  padding: 18px 20px;
  border-radius: var(--app-radius-lg);
  color: #e8eef6;
  background:
    radial-gradient(circle at 88% 0%, rgb(15 118 110 / 60%), transparent 48%),
    linear-gradient(155deg, #16233a, #1b2c45 58%, #123b38);
  box-shadow: var(--app-shadow-md);
}

.summary-hero::before {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    0deg,
    rgb(255 255 255 / 4%) 0 1px,
    transparent 1px 28px
  );
  content: '';
  pointer-events: none;
}

.summary-hero > * {
  position: relative;
}

.summary-hero__head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.summary-hero__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: #7dd3c7;
  text-transform: uppercase;
}

.summary-hero__pill {
  padding: 3px 9px;
  border: 1px solid rgb(125 211 199 / 35%);
  border-radius: 999px;
  font-size: 11px;
  color: #9ee3d9;
}

.summary-hero__value {
  margin-top: 12px;
  font-size: 34px;
  font-weight: 600;
  line-height: 1.1;
  color: #fff;
}

.summary-hero__currency {
  margin-right: 3px;
  font-size: 18px;
  color: #7dd3c7;
}

.summary-hero__sub {
  margin-top: 5px;
  font-size: 12px;
  color: #9fb0c6;
}

.summary-hero__bar {
  display: flex;
  height: 9px;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 10%);
}

.summary-hero__bar-seg {
  height: 100%;
}

.summary-hero__bar-seg.is-net,
.summary-hero__dot.is-net {
  background: #7dd3c7;
}

.summary-hero__bar-seg.is-insurance,
.summary-hero__dot.is-insurance {
  background: #8fa3ba;
}

.summary-hero__bar-seg.is-tax,
.summary-hero__dot.is-tax {
  background: #e9a23b;
}

.summary-hero__bar-seg.is-postTax,
.summary-hero__dot.is-postTax {
  background: #c86b8a;
}

.summary-hero__bar-seg.is-nonCash,
.summary-hero__dot.is-nonCash {
  background: #4b5b72;
}

.summary-hero__legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 16px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.summary-hero__legend li {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 11px;
  color: #c3cfdf;
}

.summary-hero__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.summary-hero__legend-label {
  flex: 1;
}

.summary-hero__legend-value {
  color: #eef3f9;
  font-size: 11px;
}

.summary-hero__legend-ratio {
  width: 38px;
  color: #8496ad;
  font-size: 10.5px;
  text-align: right;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
  padding: 13px 15px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
}

.stat__label {
  font-size: 11.5px;
  color: var(--app-ink-500);
}

.stat__value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--app-ink-900);
}

.stat__value--text {
  font-family: var(--app-font-sans);
  font-size: 15px;
  font-weight: 700;
  color: var(--app-jade-700);
}

.stat__sub {
  font-size: 11px;
  color: var(--app-ink-500);
}

.stat--settlement {
  border-color: var(--app-jade-100);
  background: linear-gradient(180deg, #f5fbfa, #fff);
}

@media (max-width: 1080px) {
  .result-summary {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .stat-grid,
  .summary-hero__legend {
    grid-template-columns: 1fr;
  }

  .summary-hero__value {
    font-size: 28px;
  }
}
</style>
