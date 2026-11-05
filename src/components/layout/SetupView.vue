<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/SetupView.vue
 * @Description: 录入设置视图：左侧按「周期 → 收入 → 社保 → 阶段 → 扣除」分区录入，右侧常驻实时结果
 */
import { computed, nextTick, ref } from 'vue'
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue'
import { POLICY_DISCLAIMER } from '@/config/policy'
import DeductionEditor from '@/components/deduction/DeductionEditor.vue'
import PostTaxDeductionEditor from '@/components/deduction/PostTaxDeductionEditor.vue'
import IncomeEditor from '@/components/income/IncomeEditor.vue'
import InsuranceEditor from '@/components/insurance/InsuranceEditor.vue'
import StageEditor from '@/components/stage/StageEditor.vue'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { resolveCity, round2 } from '@/core'
import { formatMoney, formatPercent } from '@/utils/format'
import type { BonusMode } from '@/types'

/**
 * 对外事件
 * @event next 切换到月度明细视图
 */
const emit = defineEmits<{
  next: []
}>()

const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()
const { result } = useSalaryCalculator()

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 月`,
}))

const BONUS_MODE_OPTIONS: { value: BonusMode; label: string }[] = [
  { value: 'auto', label: '自动择优' },
  { value: 'separate', label: '单独计税' },
  { value: 'merged', label: '并入综合所得' },
]

type SectionKey =
  | 'period'
  | 'income'
  | 'insurance'
  | 'stage'
  | 'deduction'
  | 'posttax'
  | 'advanced'

/** 表单较重且非必填的分区默认收起，点击分区导航时自动展开 */
const COLLAPSIBLE_SECTIONS = new Set<SectionKey>([
  'stage',
  'deduction',
  'posttax',
  'advanced',
])
const openSections = ref<SectionKey[]>([])

function isOpen(key: SectionKey): boolean {
  return !COLLAPSIBLE_SECTIONS.has(key) || openSections.value.includes(key)
}

function toggleSection(key: SectionKey) {
  if (!COLLAPSIBLE_SECTIONS.has(key)) return
  openSections.value = isOpen(key)
    ? openSections.value.filter((item) => item !== key)
    : [...openSections.value, key]
}

function jumpTo(key: SectionKey) {
  if (!isOpen(key)) openSections.value = [...openSections.value, key]
  nextTick(() => {
    document.getElementById(`section-${key}`)?.scrollIntoView({ block: 'start' })
  })
}

const currentBonusMode = computed({
  get: () => settingsStore.bonusMode,
  set: (value: BonusMode) => settingsStore.updateSettings({ bonusMode: value }),
})

/** 起始月变化后月数可能超出年末，取两者较小值保证不跨年 */
const monthCount = computed({
  get: () => Math.min(settingsStore.monthCount, settingsStore.maxMonthCount),
  set: (value: number) => settingsStore.updateSettings({ monthCount: value }),
})

const cityName = computed(() => resolveCity(salaryStore.insurance.cityCode).name)
const enabledDeductionCount = computed(
  () => Object.values(salaryStore.deductions).filter((item) => item?.enabled).length,
)
const enabledPostTaxCount = computed(
  () => salaryStore.postTaxDeductions.filter((item) => item.enabled).length,
)
const taxpayerLabel = computed(() =>
  settingsStore.taxpayerType === 'resident' ? '居民个人' : '非居民个人',
)

/** 分区导航：编号对应录入顺序，元信息显示该分区的真实配置状态 */
const navItems = computed<{ key: SectionKey; index: string; label: string; meta: string }[]>(() => [
  { key: 'period', index: '01', label: '计算周期', meta: `${settingsStore.monthCount} 个月` },
  { key: 'income', index: '02', label: '收入项', meta: `${salaryStore.activeIncomes.length} 项` },
  { key: 'insurance', index: '03', label: '五险一金', meta: cityName.value },
  { key: 'stage', index: '04', label: '雇佣阶段', meta: `${salaryStore.stages.length} 段` },
  { key: 'deduction', index: '05', label: '专项扣除', meta: `${enabledDeductionCount.value} 项` },
  { key: 'posttax', index: '06', label: '税后扣款', meta: `${enabledPostTaxCount.value} 项` },
  { key: 'advanced', index: '07', label: '高级设置', meta: taxpayerLabel.value },
])

const annual = computed(() => result.value.annual)
const monthsWorked = computed(
  () => Math.max(1, settingsStore.endMonth - settingsStore.startMonth + 1),
)

/** 结果构成：到手 / 五险一金 / 个税 / 非现金福利，四者合计等于应发 */
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
</script>

<template>
  <section class="setup">
    <nav class="setup__nav" aria-label="录入分区">
      <button
        v-for="item in navItems"
        :key="item.key"
        type="button"
        class="setup__nav-item"
        @click="jumpTo(item.key)"
      >
        <span class="setup__nav-index">{{ item.index }}</span>
        <span class="setup__nav-text">
          <span class="setup__nav-label">{{ item.label }}</span>
          <span class="setup__nav-meta">{{ item.meta }}</span>
        </span>
      </button>
    </nav>

    <div class="setup__grid">
      <div class="setup__main">
        <section id="section-period" class="panel">
          <header class="panel__head">
            <span class="panel__index">01</span>
            <div class="panel__titles">
              <h2 class="panel__title">计算周期</h2>
              <p class="panel__desc">以起始月 + 计算月数定义区间，区间不跨自然年</p>
            </div>
            <span class="panel__meta">{{ settingsStore.rangeText }}</span>
          </header>
          <div class="panel__body">
            <el-form label-width="96px" size="small" class="setup__period">
              <el-form-item label="计算年度">
                <el-input-number
                  v-model="settingsStore.year"
                  :min="2000"
                  :max="2099"
                  controls-position="right"
                  class="setup__field"
                />
              </el-form-item>
              <el-form-item label="起始月份">
                <el-select v-model="settingsStore.startMonth" class="setup__field">
                  <el-option
                    v-for="option in MONTH_OPTIONS"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="计算月数">
                <el-input-number
                  v-model="monthCount"
                  :min="1"
                  :max="settingsStore.maxMonthCount"
                  controls-position="right"
                  class="setup__field"
                />
                <span class="setup__unit">个月，最长 12 个月</span>
              </el-form-item>
            </el-form>
            <el-alert
              :closable="false"
              type="info"
              title="按自然年计算，起始月 + 计算月数不得跨年。跨年周期（如 2025 年 7 月至 2026 年 6 月）请分两段录入后自行合计。"
            />
          </div>
        </section>

        <section id="section-income" class="panel">
          <header class="panel__head">
            <span class="panel__index">02</span>
            <div class="panel__titles">
              <h2 class="panel__title">工资与其他收入</h2>
              <p class="panel__desc">收入项会自动成为月度明细表的一列，可配置计税与计基口径</p>
            </div>
            <span class="panel__meta">{{ salaryStore.activeIncomes.length }} 项参与计算</span>
          </header>
          <div class="panel__body">
            <IncomeEditor />
          </div>
        </section>

        <section id="section-insurance" class="panel">
          <header class="panel__head">
            <span class="panel__index">03</span>
            <div class="panel__titles">
              <h2 class="panel__title">五险一金基数与比例</h2>
              <p class="panel__desc">选择参保城市，按当地上下限与费率计算个人与单位缴纳额</p>
            </div>
            <span class="panel__meta">{{ cityName }}</span>
          </header>
          <div class="panel__body">
            <InsuranceEditor />
          </div>
        </section>

        <section id="section-stage" class="panel">
          <header class="panel__head">
            <span class="panel__index">04</span>
            <div class="panel__titles">
              <h2 class="panel__title">雇佣阶段</h2>
              <p class="panel__desc">按月份划分实习期 / 试用期 / 转正后，分别设置发放金额与社保缴纳</p>
            </div>
            <span class="panel__meta">{{ salaryStore.stages.length }} 段</span>
            <button
              type="button"
              class="panel__toggle"
              :aria-expanded="isOpen('stage')"
              aria-controls="section-body-stage"
              @click="toggleSection('stage')"
            >
              {{ isOpen('stage') ? '收起' : '展开' }}
              <el-icon :class="{ 'is-open': isOpen('stage') }"><ArrowDown /></el-icon>
            </button>
          </header>
          <div v-if="isOpen('stage')" id="section-body-stage" class="panel__body">
            <StageEditor />
          </div>
        </section>

        <section id="section-deduction" class="panel">
          <header class="panel__head">
            <span class="panel__index">05</span>
            <div class="panel__titles">
              <h2 class="panel__title">专项附加扣除与其他扣除</h2>
              <p class="panel__desc">11 个项目，自动处理起付线、年度限额与互斥校验</p>
            </div>
            <span class="panel__meta">{{ enabledDeductionCount }} 项已启用</span>
            <button
              type="button"
              class="panel__toggle"
              :aria-expanded="isOpen('deduction')"
              aria-controls="section-body-deduction"
              @click="toggleSection('deduction')"
            >
              {{ isOpen('deduction') ? '收起' : '展开' }}
              <el-icon :class="{ 'is-open': isOpen('deduction') }"><ArrowDown /></el-icon>
            </button>
          </header>
          <div v-if="isOpen('deduction')" id="section-body-deduction" class="panel__body">
            <DeductionEditor />
          </div>
        </section>

        <section id="section-posttax" class="panel">
          <header class="panel__head">
            <span class="panel__index">06</span>
            <div class="panel__titles">
              <h2 class="panel__title">税后扣款</h2>
              <p class="panel__desc">
                宿舍水电费、管理费等，在个税与五险一金之后从实发工资中扣除
              </p>
            </div>
            <span class="panel__meta">{{ enabledPostTaxCount }} 项已启用</span>
            <button
              type="button"
              class="panel__toggle"
              :aria-expanded="isOpen('posttax')"
              aria-controls="section-body-posttax"
              @click="toggleSection('posttax')"
            >
              {{ isOpen('posttax') ? '收起' : '展开' }}
              <el-icon :class="{ 'is-open': isOpen('posttax') }"><ArrowDown /></el-icon>
            </button>
          </header>
          <div v-if="isOpen('posttax')" id="section-body-posttax" class="panel__body">
            <PostTaxDeductionEditor />
          </div>
        </section>

        <section id="section-advanced" class="panel">
          <header class="panel__head">
            <span class="panel__index">07</span>
            <div class="panel__titles">
              <h2 class="panel__title">高级设置</h2>
              <p class="panel__desc">纳税人身份、每月减免税额与年终奖计税口径</p>
            </div>
            <span class="panel__meta">{{ taxpayerLabel }}</span>
            <button
              type="button"
              class="panel__toggle"
              :aria-expanded="isOpen('advanced')"
              aria-controls="section-body-advanced"
              @click="toggleSection('advanced')"
            >
              {{ isOpen('advanced') ? '收起' : '展开' }}
              <el-icon :class="{ 'is-open': isOpen('advanced') }"><ArrowDown /></el-icon>
            </button>
          </header>
          <div v-if="isOpen('advanced')" id="section-body-advanced" class="panel__body">
            <el-form label-width="110px" size="small">
              <el-form-item label="纳税人身份">
                <el-radio-group v-model="settingsStore.taxpayerType">
                  <el-radio value="resident">居民个人（累计预扣）</el-radio>
                  <el-radio value="nonResident">非居民个人（按月计税）</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="每月减免税额">
                <el-input-number
                  v-model="settingsStore.taxReductionMonthly"
                  :min="0"
                  :step="100"
                  :precision="2"
                  controls-position="right"
                  class="setup__field"
                />
              </el-form-item>
              <el-form-item label="年终奖计税">
                <el-radio-group v-model="currentBonusMode">
                  <el-radio
                    v-for="option in BONUS_MODE_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>
            <el-alert :closable="false" type="info" :title="POLICY_DISCLAIMER" />
          </div>
        </section>
      </div>

      <aside class="setup__aside" aria-label="实时结果">
        <div class="payslip">
          <div class="payslip__head">
            <span class="payslip__eyebrow">实时结果</span>
            <span class="payslip__range">{{ settingsStore.rangeText }}</span>
          </div>

          <div class="payslip__hero">
            <span class="payslip__label">年度到手</span>
            <div class="payslip__value num">
              <span class="payslip__currency">¥</span>{{ formatMoney(annual.net) }}
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
              <dt>非现金福利</dt>
              <dd class="num">¥{{ formatMoney(annual.nonCashIncome) }}</dd>
            </div>
            <div class="payslip__ledger-total">
              <dt>单位用工成本</dt>
              <dd class="num">¥{{ formatMoney(annual.companyCost) }}</dd>
            </div>
          </dl>

          <el-button type="primary" class="payslip__cta" @click="emit('next')">
            查看月度明细
            <el-icon class="payslip__cta-icon"><ArrowRight /></el-icon>
          </el-button>
          <p class="payslip__hint">数据仅保存在本机浏览器，不上传服务器</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
}

.setup__nav {
  display: flex;
  gap: 6px;
  padding: 6px;
  overflow-x: auto;
  border: 1px solid var(--app-line);
  border-radius: 14px;
  background: rgb(255 255 255 / 72%);
  scrollbar-width: none;
}

.setup__nav::-webkit-scrollbar {
  display: none;
}

.setup__nav-item {
  display: flex;
  flex: 1 1 0;
  gap: 9px;
  align-items: center;
  min-width: 132px;
  padding: 8px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s;
}

.setup__nav-item:hover {
  background: #f3f6fa;
}

.setup__nav-index {
  padding: 2px 5px;
  border-radius: 6px;
  color: #fff;
  background: var(--app-ink-900);
  font-family: var(--app-font-num);
  font-size: 11px;
  line-height: 1.4;
}

.setup__nav-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.setup__nav-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-ink-900);
}

.setup__nav-meta {
  font-size: 10.5px;
  color: var(--app-ink-500);
}

.setup__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.setup__main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.setup__aside {
  position: sticky;
  top: 12px;
}

.panel {
  overflow: hidden;
  border: 1px solid var(--app-line);
  border-radius: 16px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
  scroll-margin-top: 12px;
}

.panel__head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 18px 13px;
  border-bottom: 1px solid var(--app-line);
}

.panel__index {
  margin-top: 1px;
  padding: 3px 6px;
  border-radius: 6px;
  color: var(--app-jade-700);
  background: var(--app-jade-100);
  font-family: var(--app-font-num);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.panel__titles {
  flex: 1;
  min-width: 0;
}

.panel__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--app-ink-900);
}

.panel__desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-ink-500);
}

.panel__meta {
  padding: 3px 10px;
  border: 1px solid var(--app-line);
  border-radius: 999px;
  color: var(--app-ink-700);
  background: #f5f8fb;
  font-size: 12px;
  white-space: nowrap;
}

.panel__toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: var(--app-jade-700);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.panel__toggle .el-icon {
  transition: transform 0.2s;
}

.panel__toggle .el-icon.is-open {
  transform: rotate(180deg);
}

.panel__body {
  padding: 16px 18px 18px;
}

.setup__period {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0 16px;
}

.panel__body :deep(.el-alert) {
  margin-top: 4px;
}

.setup__field {
  width: 160px;
}

.setup__unit {
  margin-left: 8px;
  font-size: 12px;
  color: var(--app-ink-500);
}

/* 右栏结果卡：深墨蓝底 + 玉石绿数值，像一张实时工资条 */
.payslip {
  position: relative;
  overflow: hidden;
  padding: 18px;
  border-radius: var(--app-radius-lg);
  color: #e8eef6;
  background:
    radial-gradient(circle at 90% 0%, rgb(15 118 110 / 55%), transparent 46%),
    linear-gradient(160deg, #16233a, #1b2c45 58%, #123b38);
  box-shadow: var(--app-shadow-md);
}

.payslip::before {
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
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: #7dd3c7;
  text-transform: uppercase;
}

.payslip__range {
  font-size: 11px;
  color: #9fb0c6;
}

.payslip__hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 16px;
}

.payslip__label {
  font-size: 12px;
  color: #9fb0c6;
}

.payslip__value {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.15;
  color: #fff;
}

.payslip__currency {
  margin-right: 3px;
  font-size: 17px;
  color: #7dd3c7;
}

.payslip__sub {
  font-size: 11px;
  color: #9fb0c6;
}

.payslip__bar {
  display: flex;
  height: 9px;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 10%);
}

.payslip__bar-seg {
  height: 100%;
}

.payslip__bar-seg.is-net,
.payslip__dot.is-net {
  background: #7dd3c7;
}

.payslip__bar-seg.is-insurance,
.payslip__dot.is-insurance {
  background: #8fa3ba;
}

.payslip__bar-seg.is-tax,
.payslip__dot.is-tax {
  background: #e9a23b;
}

.payslip__bar-seg.is-postTax,
.payslip__dot.is-postTax {
  background: #c86b8a;
}

.payslip__bar-seg.is-nonCash,
.payslip__dot.is-nonCash {
  background: #4b5b72;
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
  font-size: 11px;
  color: #c3cfdf;
}

.payslip__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.payslip__legend-label {
  flex: 1;
}

.payslip__legend-value {
  color: #eef3f9;
  font-size: 11px;
}

.payslip__ledger {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 14px 0 0;
  padding-top: 12px;
  border-top: 1px dashed rgb(255 255 255 / 18%);
}

.payslip__ledger div {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 12px;
  color: #a9b8cc;
}

.payslip__ledger dt,
.payslip__ledger dd {
  margin: 0;
}

.payslip__ledger dd {
  color: #eef3f9;
}

.payslip__ledger-total {
  margin-top: 6px;
  padding-top: 9px !important;
  border-top: 1px dashed rgb(255 255 255 / 18%);
  color: #fff !important;
  font-weight: 600;
}

.payslip__ledger-total dd {
  color: #7dd3c7 !important;
  font-size: 14px;
}

.payslip__cta {
  width: 100%;
  margin-top: 16px;
  border-color: #7dd3c7;
  color: #0b3b38;
  background: #7dd3c7;
  font-weight: 600;
}

.payslip__cta:hover,
.payslip__cta:focus {
  border-color: #9ee3d9;
  color: #0b3b38;
  background: #9ee3d9;
}

.payslip__cta-icon {
  margin-left: 4px;
}

.payslip__hint {
  margin-top: 8px;
  font-size: 10.5px;
  color: #8496ad;
  text-align: center;
}

@media (max-width: 1080px) {
  .setup__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .setup__aside {
    position: static;
    order: 2;
  }
}

@media (max-width: 640px) {
  .setup__nav-item {
    min-width: 118px;
  }

  .setup__period {
    grid-template-columns: 1fr;
  }

  .panel__head {
    flex-wrap: wrap;
  }

  .panel__meta {
    order: 4;
  }

  .panel__toggle {
    margin-left: auto;
  }

  .payslip__legend {
    grid-template-columns: 1fr;
  }
}
</style>
