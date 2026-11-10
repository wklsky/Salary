<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/ResultCards.vue
 * @Description: 年度结果概览：到手主卡 + 收入构成条 + 关键指标网格
 */
import { computed } from 'vue'
import { OfficeBuilding, Stamp, Tickets, Umbrella, Wallet } from '@element-plus/icons-vue'
import { useCountUp } from '@/composables/useCountUp'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatMoney, formatPercent } from '@/utils/format'
import { round2 } from '@/core'

const { result } = useSalaryCalculator()
const settingsStore = useSettingsStore()

const annual = computed(() => result.value.annual)

/** 主卡到手金额：进入结果视图时滚动一次 */
const animatedNet = useCountUp(computed(() => annual.value.net))

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
      label: '非现金收入',
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
      icon: Wallet,
      label: '年度应发',
      value: annual.value.gross,
      sub: `月均 ¥${formatMoney(round2(annual.value.gross / months))}`,
    },
    {
      key: 'insurance',
      icon: Umbrella,
      label: '五险一金（个人）',
      value: annual.value.insurancePersonal,
      sub: `占应发 ${formatPercent(annual.value.insurancePersonal / (annual.value.gross || 1))}`,
    },
    {
      key: 'tax',
      icon: Tickets,
      label: '年度个税',
      value: annual.value.tax,
      sub: `实际税负 ${formatPercent(annual.value.taxRate)}`,
    },
    {
      key: 'company',
      icon: OfficeBuilding,
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

/** 主卡结论行：月均到手 / 到手率 / 税负率，三格一眼读完 */
const heroInsights = computed(() => {
  const months = monthsWorked.value
  return [
    {
      label: '月均到手',
      value: `¥${(annual.value.net / months).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`,
    },
    { label: '到手率', value: `${(annual.value.netRate * 100).toFixed(1)}%` },
    { label: '税负率', value: `${(annual.value.taxRate * 100).toFixed(1)}%` },
  ]
})

/** 主卡脚注：年终奖建议口径 / 非现金提示 */
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
  const nonCash = annual.value.nonCashIncome
  return nonCash > 0
    ? `非现金福利 ¥${nonCash.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 计入应发，但不计入到手`
    : '以上口径按当前录入数据实时计算'
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
        <span class="summary-hero__currency">¥</span>{{ formatMoney(animatedNet) }}
      </div>
      <p class="summary-hero__sub">
        月均 ¥{{ formatMoney(round2(annual.net / monthsWorked)) }}
        <span aria-hidden="true">·</span>
        应纳税所得额 ¥{{ formatMoney(annual.taxableIncome) }}
      </p>

      <ul class="summary-hero__insights">
        <li v-for="item in heroInsights" :key="item.label">
          <span class="summary-hero__insight-label">{{ item.label }}</span>
          <strong class="summary-hero__insight-value num">{{ item.value }}</strong>
        </li>
      </ul>
      <p class="summary-hero__note">{{ insightNote }}</p>

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
      <article v-for="stat in stats" :key="stat.key" class="stat ledger-card">
        <span class="stat__label">
          <el-icon class="stat__icon"><component :is="stat.icon" /></el-icon>
          {{ stat.label }}
        </span>
        <strong class="stat__value num">¥{{ formatMoney(stat.value) }}</strong>
        <span class="stat__sub">{{ stat.sub }}</span>
      </article>

      <article class="stat stat--settlement">
        <span class="stat__label">
          <el-icon class="stat__icon"><Stamp /></el-icon>
          年度汇算
        </span>
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
  border: 1px solid rgb(34 211 238 / 20%);
  border-radius: var(--app-radius-lg);
  color: #e8f4ff;
  background:
    radial-gradient(circle at 88% 0%, rgb(34 211 238 / 26%), transparent 48%),
    radial-gradient(circle at 0% 100%, rgb(124 92 246 / 16%), transparent 50%),
    linear-gradient(155deg, #050c16, #071522 58%, #04121c);
  box-shadow:
    0 0 0 1px rgb(34 211 238 / 6%),
    0 24px 60px -34px rgb(0 0 0 / 90%),
    0 0 60px -30px rgb(34 211 238 / 45%);
}

.summary-hero::before {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgb(56 189 248 / 5%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(56 189 248 / 5%) 1px, transparent 1px);
  background-size: 28px 28px;
  content: '';
  pointer-events: none;
  mask-image: radial-gradient(circle at 70% 0%, #000, transparent 75%);
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
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: #22d3ee;
  text-transform: uppercase;
}

.summary-hero__pill {
  padding: 3px 10px;
  border: 1px solid rgb(34 211 238 / 35%);
  border-radius: 999px;
  font-size: 12px;
  color: #7dd3fc;
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
  color: #22d3ee;
}

.summary-hero__sub {
  margin-top: 5px;
  font-size: 13px;
  color: #93a9c2;
}

/* 结论行：三格小数字，直接落在主卡上，不再单开一条白色结论带 */
.summary-hero__insights {
  display: flex;
  gap: 20px;
  margin: 14px 0 0;
  padding: 10px 14px;
  border: 1px solid rgb(34 211 238 / 14%);
  border-radius: var(--app-radius-sm);
  background: rgb(34 211 238 / 6%);
  list-style: none;
}

.summary-hero__insights li {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.summary-hero__insight-label {
  font-size: 11px;
  color: #7e95b2;
}

.summary-hero__insight-value {
  font-size: 15px;
  font-weight: 600;
  color: #e7f4ff;
}

.summary-hero__note {
  margin-top: 8px;
  font-size: 12px;
  color: #7e95b2;
}

.summary-hero__bar {
  display: flex;
  height: 9px;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  box-shadow: 0 0 14px rgb(34 211 238 / 20%);
}

.summary-hero__bar-seg {
  height: 100%;
}

.summary-hero__bar-seg.is-net,
.summary-hero__dot.is-net {
  background: #22d3ee;
}

.summary-hero__bar-seg.is-insurance,
.summary-hero__dot.is-insurance {
  background: #5b7fa6;
}

.summary-hero__bar-seg.is-tax,
.summary-hero__dot.is-tax {
  background: #fbbf24;
}

.summary-hero__bar-seg.is-postTax,
.summary-hero__dot.is-postTax {
  background: #f472b6;
}

.summary-hero__bar-seg.is-nonCash,
.summary-hero__dot.is-nonCash {
  background: #33465c;
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
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: #b3c9e2;
}

.summary-hero__dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.summary-hero__legend-label {
  flex: 1;
}

.summary-hero__legend-value {
  color: #e7f4ff;
  font-size: 12.5px;
}

.summary-hero__legend-ratio {
  width: 42px;
  color: #7e95b2;
  font-size: 12px;
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
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--app-ink-500);
}

.stat__icon {
  font-size: 14px;
  color: var(--app-jade-600);
}

.stat__value {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--app-ink-900);
}

.stat__value--text {
  font-family: var(--app-font-sans);
  font-size: 16px;
  font-weight: 700;
  color: var(--app-jade-700);
}

.stat__sub {
  font-size: 12px;
  color: var(--app-ink-500);
}

.stat--settlement {
  border-color: var(--app-jade-100);
  background: linear-gradient(180deg, var(--app-jade-100), var(--app-surface));
}

/* 指标卡悬停微反馈：轻微上浮 + 玉色描边，减少动效时直接关闭过渡 */
@media (prefers-reduced-motion: no-preference) {
  .stat {
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;
  }

  .stat:hover {
    border-color: var(--app-bracket);
    box-shadow: 0 10px 24px -14px var(--app-glow);
    transform: translateY(-2px);
  }
}

/* 侧边栏占用约 250px，1200px 以下先让概览卡纵向排列，避免两栏被压缩 */
@media (max-width: 1200px) {
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
