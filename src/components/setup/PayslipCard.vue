<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/setup/PayslipCard.vue
 * @Description: 录入设置右侧实时工资条：年度到手、收入构成与关键金额
 */
import { computed } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { useCountUp } from '@/composables/useCountUp'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { round2 } from '@/core'
import { formatMoney, formatPercent } from '@/utils/format'

interface Props {
  /** 紧凑横向模式：窄屏下插在分区目录条下方使用 */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
})

const emit = defineEmits<{
  next: []
}>()

const settingsStore = useSettingsStore()
const { result } = useSalaryCalculator()

const annual = computed(() => result.value.annual)

/** 工资条主数字：每次进入录入视图时滚动一次 */
const animatedNet = useCountUp(computed(() => annual.value.net))
const monthsWorked = computed(
  () => Math.max(1, settingsStore.endMonth - settingsStore.startMonth + 1),
)

/** 结果构成：到手 / 五险一金 / 个税 / 税后扣款 / 非现金收入，合计等于应发 */
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
</script>

<template>
  <div class="payslip" :class="{ 'payslip--compact': props.compact }">
    <div class="payslip__head">
      <span class="payslip__eyebrow">年度工资条</span>
      <span class="payslip__range">{{ settingsStore.rangeText }}</span>
    </div>

    <div class="payslip__hero">
      <span class="payslip__label">年度到手</span>
      <div class="payslip__value num">
        <span class="payslip__currency">¥</span>{{ formatMoney(animatedNet) }}
      </div>
      <span class="payslip__sub">
        月均 ¥{{ formatMoney(round2(annual.net / monthsWorked)) }} · 到手占比
        {{ formatPercent(annual.netRate) }}
      </span>
    </div>

    <div class="payslip__bar" role="img" aria-label="年度收入构成比例">
      <span
        v-for="segment in visibleSegments"
        :key="segment.key"
        class="payslip__bar-seg"
        :class="`is-${segment.key}`"
        :style="{ width: `${segment.ratio * 100}%` }"
      />
    </div>

    <ul class="payslip__legend">
      <li v-for="segment in visibleSegments" :key="segment.key">
        <i class="payslip__dot" :class="`is-${segment.key}`" />
        <span class="payslip__legend-label">{{ segment.label }}</span>
        <strong class="payslip__legend-value num">
          {{ formatPercent(segment.ratio) }}
        </strong>
      </li>
    </ul>

    <dl class="payslip__ledger">
      <div>
        <dt>年度应发</dt>
        <dd class="num">¥{{ formatMoney(annual.gross) }}</dd>
      </div>
      <div>
        <dt>五险一金（个人）</dt>
        <dd class="num">¥{{ formatMoney(annual.insurancePersonal) }}</dd>
      </div>
      <div>
        <dt>年度个税</dt>
        <dd class="num">¥{{ formatMoney(annual.tax) }}</dd>
      </div>
      <div v-if="annual.postTaxDeduction > 0">
        <dt>税后扣款</dt>
        <dd class="num">¥{{ formatMoney(annual.postTaxDeduction) }}</dd>
      </div>
      <div v-if="annual.nonCashIncome > 0">
        <dt>非现金收入</dt>
        <dd class="num">¥{{ formatMoney(annual.nonCashIncome) }}</dd>
      </div>
      <div class="payslip__ledger-total">
        <dt>单位用工成本</dt>
        <dd class="num">¥{{ formatMoney(annual.companyCost) }}</dd>
      </div>
    </dl>

    <el-button
      type="primary"
      class="payslip__cta"
      :size="props.compact ? 'small' : 'default'"
      @click="emit('next')"
    >
      查看月度明细
      <el-icon class="payslip__cta-icon"><ArrowRight /></el-icon>
    </el-button>
    <p class="payslip__hint">数据仅保存在本机浏览器，不上传服务器</p>
  </div>
</template>

<style scoped>
/* 右栏结果卡：深空底 + 青色光晕 + 网格，像一块实时 HUD 面板 */
.payslip {
  position: relative;
  overflow: hidden;
  padding: 18px;
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

.payslip::before {
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

.payslip > * {
  position: relative;
}

.payslip__head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.payslip__eyebrow {
  color: #22d3ee;
  font-family: var(--app-font-ledger);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.payslip__range {
  font-size: 12px;
  color: #93a9c2;
}

.payslip__hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 16px;
}

.payslip__label {
  font-size: 12px;
  color: #93a9c2;
}

.payslip__value {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.15;
  color: #fff;
  text-shadow: 0 0 26px rgb(34 211 238 / 35%);
}

.payslip__currency {
  margin-right: 3px;
  font-size: 17px;
  color: #22d3ee;
}

.payslip__sub {
  font-size: 12px;
  color: #93a9c2;
}

.payslip__bar {
  display: flex;
  height: 9px;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  box-shadow: 0 0 14px rgb(34 211 238 / 20%);
}

.payslip__bar-seg {
  height: 100%;
}

.payslip__bar-seg.is-net,
.payslip__dot.is-net {
  background: #22d3ee;
}

.payslip__bar-seg.is-insurance,
.payslip__dot.is-insurance {
  background: #5b7fa6;
}

.payslip__bar-seg.is-tax,
.payslip__dot.is-tax {
  background: #fbbf24;
}

.payslip__bar-seg.is-postTax,
.payslip__dot.is-postTax {
  background: #f472b6;
}

.payslip__bar-seg.is-nonCash,
.payslip__dot.is-nonCash {
  background: #33465c;
}

.payslip__legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 14px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.payslip__legend li {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 12px;
  color: #b3c9e2;
}

.payslip__dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.payslip__legend-label {
  flex: 1;
}

.payslip__legend-value {
  color: #e7f4ff;
  font-size: 12px;
}

.payslip__ledger {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 14px 0 0;
  padding-top: 12px;
  border-top: 1px dashed rgb(34 211 238 / 22%);
}

.payslip__ledger div {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
  color: #a9bdd6;
}

.payslip__ledger dt,
.payslip__ledger dd {
  margin: 0;
}

.payslip__ledger dd {
  color: #e7f4ff;
}

.payslip__ledger-total {
  margin-top: 6px;
  padding-top: 9px !important;
  border-top: 1px dashed rgb(34 211 238 / 22%);
  color: #fff !important;
  font-weight: 600;
}

.payslip__ledger-total dd {
  color: #22d3ee !important;
  font-size: 14px;
}

.payslip__cta {
  width: 100%;
  margin-top: 16px;
  border-color: #22d3ee;
  color: #04070d;
  background: linear-gradient(135deg, #22d3ee, #0891b2);
  font-weight: 600;
  box-shadow: 0 10px 30px -12px rgb(34 211 238 / 70%);
}

.payslip__cta:hover,
.payslip__cta:focus {
  border-color: #67e8f9;
  color: #04070d;
  background: linear-gradient(135deg, #67e8f9, #22d3ee);
}

.payslip__cta-icon {
  margin-left: 4px;
}

.payslip__hint {
  margin-top: 8px;
  font-size: 11.5px;
  color: #7e95b2;
  text-align: center;
}

/* 紧凑横向变体：窄屏下作为录入页顶部的实时结果条，隐藏明细只留核心数字 */
.payslip--compact {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'head head'
    'hero bar'
    'hero cta';
  gap: 3px 18px;
  align-items: center;
  padding: 12px 16px;
}

.payslip--compact .payslip__head {
  grid-area: head;
}

.payslip--compact .payslip__hero {
  grid-area: hero;
  margin-top: 0;
  gap: 1px;
}

.payslip--compact .payslip__value {
  font-size: 24px;
}

.payslip--compact .payslip__bar {
  grid-area: bar;
  align-self: end;
  min-width: 140px;
  margin-top: 0;
}

.payslip--compact .payslip__cta {
  grid-area: cta;
  align-self: end;
  width: auto;
  margin-top: 0;
}

.payslip--compact .payslip__legend,
.payslip--compact .payslip__ledger,
.payslip--compact .payslip__hint {
  display: none;
}

@media (max-width: 640px) {
  .payslip__legend {
    grid-template-columns: 1fr;
  }

  /* 更窄时结果条退化为两行：数值一行、比例条与按钮一行 */
  .payslip--compact {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'head head'
      'hero hero'
      'bar cta';
  }

  .payslip--compact .payslip__bar {
    min-width: 0;
  }
}
</style>
