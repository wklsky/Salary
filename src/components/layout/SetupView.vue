<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/SetupView.vue
 * @Description: 录入设置视图：按分页组合章节面板与实时工资条
 */
import { computed, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import PagePager from '@/components/common/PagePager.vue'
import SectionPanel from '@/components/common/SectionPanel.vue'
import AdvancedForm from '@/components/setup/AdvancedForm.vue'
import PeriodForm from '@/components/setup/PeriodForm.vue'
import PayslipCard from '@/components/setup/PayslipCard.vue'
import TargetReverseCard from '@/components/setup/TargetReverseCard.vue'
import DeductionEditor from '@/components/deduction/DeductionEditor.vue'
import PostTaxDeductionEditor from '@/components/deduction/PostTaxDeductionEditor.vue'
import IncomeEditor from '@/components/income/IncomeEditor.vue'
import InsuranceEditor from '@/components/insurance/InsuranceEditor.vue'
import StageEditor from '@/components/stage/StageEditor.vue'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { resolveCity } from '@/core'
import type { NavItem, SetupSectionKey } from '@/types'

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

/** 窗口较窄（结果卡下移的断点）时，改在目录条下方插一张横向紧凑结果卡 */
const { width: windowWidth } = useWindowSize()
const isCompact = computed(() => windowWidth.value <= 1200)
/**
 * 桌面端侧边栏已提供「本页目录」，页内目录条只在窄屏（侧边栏收进抽屉）时出现，
 * 避免同一份 01–07 目录在两处重复出现
 */
const showStepper = computed(() => windowWidth.value <= 960)

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
</script>

<template>
  <section class="setup">
    <div class="setup__grid" :class="{ 'setup__grid--single': isCompact }">
      <div class="setup__main">
        <nav v-if="showStepper" class="setup__stepper" aria-label="录入分区目录">
          <button
            v-for="(item, index) in navItems"
            :key="item.key"
            type="button"
            class="stepper-item"
            :class="{
              'is-active': item.key === section,
              'is-done': index < currentIndex,
            }"
            @click="goToSection(item)"
          >
            <span class="stepper-item__state" aria-hidden="true">
              <template v-if="index < currentIndex">✓</template>
              <template v-else>{{ item.index }}</template>
            </span>
            <span class="stepper-item__label">{{ item.label }}</span>
          </button>
        </nav>
        <!-- 窄屏时结果卡落不进右栏，改在目录条下方放一张横向紧凑版，保证录入时看得到结果 -->
        <PayslipCard v-if="isCompact" compact @next="emit('next')" />
        <TargetReverseCard v-if="isCompact" />
        <SectionPanel
          v-if="section === 'period'"
          index="01"
          title="计算周期"
          desc="以起始月 + 计算月数定义区间，区间不跨自然年"
          :meta="settingsStore.rangeText"
        >
          <PeriodForm />
        </SectionPanel>

        <SectionPanel
          v-if="section === 'income'"
          index="02"
          title="工资与其他收入"
          desc="收入项会自动成为月度明细表的一列，可配置计税与计基口径"
          :meta="`${salaryStore.activeIncomes.length} 项参与计算`"
        >
          <IncomeEditor />
        </SectionPanel>

        <SectionPanel
          v-if="section === 'insurance'"
          index="03"
          title="五险一金基数与比例"
          desc="选择参保城市，按当地上下限与费率计算个人与单位缴纳额"
          :meta="cityName"
        >
          <InsuranceEditor />
        </SectionPanel>

        <SectionPanel
          v-if="section === 'stage'"
          index="04"
          title="雇佣阶段"
          desc="按月份划分实习期 / 试用期 / 转正后，分别设置发放金额与社保缴纳"
          :meta="`${salaryStore.stages.length} 段`"
        >
          <StageEditor />
        </SectionPanel>

        <SectionPanel
          v-if="section === 'deduction'"
          index="05"
          title="专项附加扣除与其他扣除"
          desc="11 个项目，自动处理起付线、年度限额与互斥校验"
          :meta="`${enabledDeductionCount} 项已启用`"
        >
          <DeductionEditor />
        </SectionPanel>

        <SectionPanel
          v-if="section === 'posttax'"
          index="06"
          title="税后扣款"
          desc="宿舍水电费、管理费等，在个税与五险一金之后从实发工资中扣除"
          :meta="`${enabledPostTaxCount} 项已启用`"
        >
          <PostTaxDeductionEditor />
        </SectionPanel>

        <SectionPanel
          v-if="section === 'advanced'"
          index="07"
          title="高级设置"
          desc="纳税人身份、每月减免税额与年终奖计税口径"
          :meta="taxpayerLabel"
        >
          <AdvancedForm />
        </SectionPanel>

        <PagePager
          :progress="sectionProgress"
          :prev-label="prevSection?.label"
          :next-label="nextSection?.label"
          last-label="查看月度明细 →"
          @prev="goToSection(prevSection)"
          @next="goToSection(nextSection)"
          @last="emit('next')"
        />
      </div>

      <aside v-if="!isCompact" class="setup__aside" aria-label="实时结果">
        <PayslipCard @next="emit('next')" />
        <TargetReverseCard />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.setup {
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
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 窗口较窄时右侧结果卡不存在，主表单独占一行 */
.setup__grid--single {
  grid-template-columns: minmax(0, 1fr);
}

/* 分区目录条：贴顶、可直达任意分区，已完成打勾、当前高亮 */
.setup__stepper {
  position: sticky;
  top: 12px;
  z-index: 10;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 8px;
  background: var(--app-surface);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  box-shadow: 0 6px 18px -14px rgb(22 35 58 / 22%);
}

.stepper-item {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--app-ink-500);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.stepper-item:hover {
  background: var(--app-paper);
  border-color: var(--app-line-strong);
  color: var(--app-ink-700);
}

.stepper-item__state {
  min-width: 20px;
  text-align: center;
  font-family: var(--app-font-ledger), serif;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--app-ink-300);
}

.stepper-item.is-active {
  background: var(--app-jade-100);
  border-color: var(--app-jade-600);
  color: var(--app-jade-700);
  font-weight: 600;
}

.stepper-item.is-active .stepper-item__state {
  color: var(--app-jade-600);
}

.stepper-item.is-done {
  color: var(--app-ink-500);
}

.stepper-item.is-done .stepper-item__state {
  color: var(--app-jade-600);
}

/* 分页切换时给内容一个轻微入场，强化「换了一页」的感觉 */
.setup__main > .section-panel {
  animation: setup-page-in 0.18s ease;
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

@media (max-width: 640px) {
  .setup__main {
    gap: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .setup__main > .section-panel {
    animation: none;
  }
}
</style>
