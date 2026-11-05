<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/SetupView.vue
 * @Description: 录入设置视图：按分页组合章节面板与实时工资条
 */
import { computed, watch } from 'vue'
import PagePager from '@/components/common/PagePager.vue'
import SectionPanel from '@/components/common/SectionPanel.vue'
import AdvancedForm from '@/components/setup/AdvancedForm.vue'
import PeriodForm from '@/components/setup/PeriodForm.vue'
import PayslipCard from '@/components/setup/PayslipCard.vue'
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
    <div class="setup__grid">
      <div class="setup__main">
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

      <aside class="setup__aside" aria-label="实时结果">
        <PayslipCard @next="emit('next')" />
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

/* 侧边栏占用约 220px，较窄的桌面也需要把结果卡移到主表单下方 */
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
