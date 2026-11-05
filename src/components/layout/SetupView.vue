<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/SetupView.vue
 * @Description: 录入设置视图：左侧按「周期 → 收入 → 社保 → 阶段 → 扣除」分区录入，右侧常驻实时结果
 */
import { computed, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
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
import type { BonusMode, NavItem, SetupSectionKey } from '@/types'

interface Props {
  /** 当前展示的录入分页 */
  section: SetupSectionKey
}

const props = defineProps<Props>()

/**
 * 对外事件
 * @event next 切换到月度明细视图
 * @event sections 分区目录变化，同步给侧边栏
 * @event select-section 切换到上一个/下一个录入分页
 */
const emit = defineEmits<{
  next: []
  sections: [items: NavItem[]]
  'select-section': [key: SetupSectionKey]
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
const navItems = computed<NavItem[]>(() => [
  { key: 'period', index: '01', label: '计算周期', meta: `${settingsStore.monthCount} 个月` },
  { key: 'income', index: '02', label: '收入项', meta: `${salaryStore.activeIncomes.length} 项` },
  { key: 'insurance', index: '03', label: '五险一金', meta: cityName.value },
  { key: 'stage', index: '04', label: '雇佣阶段', meta: `${salaryStore.stages.length} 段` },
  { key: 'deduction', index: '05', label: '专项扣除', meta: `${enabledDeductionCount.value} 项` },
  { key: 'posttax', index: '06', label: '税后扣款', meta: `${enabledPostTaxCount.value} 项` },
  { key: 'advanced', index: '07', label: '高级设置', meta: taxpayerLabel.value },
])

/** 分区目录同步给应用侧边栏，编号与元信息随录入状态实时更新 */
watch(navItems, (items) => emit('sections', items), { immediate: true, deep: true })

const currentIndex = computed(() =>
  navItems.value.findIndex((item) => item.key === props.section),
)
const prevSection = computed(() =>
  currentIndex.value > 0 ? navItems.value[currentIndex.value - 1] : undefined,
)
const nextSection = computed(() => {
  const index = currentIndex.value
  return index >= 0 && index < navItems.value.length - 1
    ? navItems.value[index + 1]
    : undefined
})

const sectionProgress = computed(() => {
  const total = navItems.value.length
  const current = Math.max(currentIndex.value + 1, 1)
  return `${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
})

function goToSection(item: NavItem | undefined) {
  if (!item) return
  emit('select-section', item.key as SetupSectionKey)
}

const annual = computed(() => result.value.annual)
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
  <section class="setup">
    <div class="setup__grid">
      <div class="setup__main">
        <section v-if="section === 'period'" id="section-period" class="panel">
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

        <section v-if="section === 'income'" id="section-income" class="panel">
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

        <section v-if="section === 'insurance'" id="section-insurance" class="panel">
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

        <section v-if="section === 'stage'" id="section-stage" class="panel">
          <header class="panel__head">
            <span class="panel__index">04</span>
            <div class="panel__titles">
              <h2 class="panel__title">雇佣阶段</h2>
              <p class="panel__desc">按月份划分实习期 / 试用期 / 转正后，分别设置发放金额与社保缴纳</p>
            </div>
            <span class="panel__meta">{{ salaryStore.stages.length }} 段</span>
          </header>
          <div class="panel__body">
            <StageEditor />
          </div>
        </section>

        <section v-if="section === 'deduction'" id="section-deduction" class="panel">
          <header class="panel__head">
            <span class="panel__index">05</span>
            <div class="panel__titles">
              <h2 class="panel__title">专项附加扣除与其他扣除</h2>
              <p class="panel__desc">11 个项目，自动处理起付线、年度限额与互斥校验</p>
            </div>
            <span class="panel__meta">{{ enabledDeductionCount }} 项已启用</span>
          </header>
          <div class="panel__body">
            <DeductionEditor />
          </div>
        </section>

        <section v-if="section === 'posttax'" id="section-posttax" class="panel">
          <header class="panel__head">
            <span class="panel__index">06</span>
            <div class="panel__titles">
              <h2 class="panel__title">税后扣款</h2>
              <p class="panel__desc">
                宿舍水电费、管理费等，在个税与五险一金之后从实发工资中扣除
              </p>
            </div>
            <span class="panel__meta">{{ enabledPostTaxCount }} 项已启用</span>
          </header>
          <div class="panel__body">
            <PostTaxDeductionEditor />
          </div>
        </section>

        <section v-if="section === 'advanced'" id="section-advanced" class="panel">
          <header class="panel__head">
            <span class="panel__index">07</span>
            <div class="panel__titles">
              <h2 class="panel__title">高级设置</h2>
              <p class="panel__desc">纳税人身份、每月减免税额与年终奖计税口径</p>
            </div>
            <span class="panel__meta">{{ taxpayerLabel }}</span>
          </header>
          <div class="panel__body">
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

        <div class="setup__pager">
          <span class="setup__pager-progress">{{ sectionProgress }}</span>
          <el-button v-if="prevSection" size="small" @click="goToSection(prevSection)">
            ← {{ prevSection.label }}
          </el-button>
          <span class="setup__pager-spacer" />
          <el-button v-if="nextSection" size="small" @click="goToSection(nextSection)">
            {{ nextSection.label }} →
          </el-button>
          <el-button v-else size="small" type="primary" @click="emit('next')">
            查看月度明细 →
          </el-button>
        </div>
      </div>

      <aside class="setup__aside" aria-label="实时结果">
        <div class="payslip">
          <div class="payslip__head">
            <span class="payslip__eyebrow">年度工资条</span>
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
              <dt>非现金收入</dt>
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
  max-width: 1600px;
  margin: 0 auto;
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
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
  scroll-margin-top: 12px;
}

/* 账本式页眉：大号衬线章节号 + 竖分隔线 + 标题说明 */
.panel__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--app-line);
}

.panel__index {
  min-width: 36px;
  margin: 0;
  padding: 0 2px 0 0;
  color: var(--app-ink-900);
  font-family: var(--app-font-ledger);
  font-size: 28px;
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.03em;
}

.panel__titles {
  min-width: 0;
  padding-left: 14px;
  border-left: 1px solid var(--app-line);
}

.panel__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--app-ink-900);
}

.panel__desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--app-ink-500);
}

.panel__meta {
  margin-top: 2px;
  padding: 3px 10px;
  border: 1px solid var(--app-line);
  border-radius: 999px;
  color: var(--app-ink-700);
  background: #f5f8fb;
  font-size: 12px;
  white-space: nowrap;
}

.panel__body {
  padding: 18px 20px 20px;
}

/* 分页切换时给内容一个轻微入场，强化「换了一页」的感觉 */
.setup__main > .panel {
  animation: setup-page-in 0.18s ease;
}

/* 分页页脚：像账本页脚一样标出「第几页 / 共几页」 */
.setup__pager {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 2px 6px;
  border-top: 1px dashed var(--app-line-strong);
}

.setup__pager-progress {
  color: var(--app-ink-500);
  font-family: var(--app-font-ledger);
  font-size: 11.5px;
  letter-spacing: 0.1em;
}

.setup__pager-spacer {
  flex: 1;
}

@keyframes setup-page-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .setup__main > .panel {
    animation: none;
  }
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
  color: #7dd3c7;
  font-family: var(--app-font-ledger);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
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

/* 侧边栏占用约 250px，较窄的桌面也需要把结果卡移到主表单下方 */
@media (max-width: 1200px) {
  .setup__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .setup__aside {
    position: static;
    order: 2;
  }
}

@media (max-width: 640px) {
  .setup__period {
    grid-template-columns: 1fr;
  }

  .panel__head {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    padding: 15px 16px 13px;
  }

  .panel__index {
    min-width: 30px;
    font-size: 24px;
  }

  .panel__meta {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .panel__body {
    padding: 15px 16px 17px;
  }

  .payslip__legend {
    grid-template-columns: 1fr;
  }
}
</style>
