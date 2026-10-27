<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/layout/SetupView.vue
 * @Description: 录入设置视图：计算周期、工资、社保基数、其他收入与扣除项
 */
import { computed, ref } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { POLICY_DISCLAIMER } from '@/config/policy'
import DeductionEditor from '@/components/deduction/DeductionEditor.vue'
import IncomeEditor from '@/components/income/IncomeEditor.vue'
import InsuranceEditor from '@/components/insurance/InsuranceEditor.vue'
import StageEditor from '@/components/stage/StageEditor.vue'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
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

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 月`,
}))

const BONUS_MODE_OPTIONS: { value: BonusMode; label: string }[] = [
  { value: 'auto', label: '自动择优' },
  { value: 'separate', label: '单独计税' },
  { value: 'merged', label: '并入综合所得' },
]

/**
 * 次要配置默认收起，避免首屏信息过载
 * 面板内容按展开状态按需挂载：StageEditor / DeductionEditor 表单较重，
 * 同时挂载会把首屏渲染耗时翻数倍
 */
const advancedPanels = ref<string[]>([])

function isPanelOpen(name: string): boolean {
  return advancedPanels.value.includes(name)
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
</script>

<template>
  <section class="setup">
    <el-card shadow="never" class="setup__card">
      <template #header>
        <div class="setup__card-head">
          <span class="setup__card-title">计算周期</span>
          <span class="setup__card-hint">{{ settingsStore.rangeText }}</span>
        </div>
      </template>
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
    </el-card>

    <el-card shadow="never" class="setup__card">
      <template #header>
        <div class="setup__card-head">
          <span class="setup__card-title">工资与其他收入</span>
          <span class="setup__card-hint">新增的收入项会自动成为明细表的一列</span>
        </div>
      </template>
      <IncomeEditor />
    </el-card>

    <el-card shadow="never" class="setup__card">
      <template #header>
        <div class="setup__card-head">
          <span class="setup__card-title">五险一金基数与比例</span>
        </div>
      </template>
      <InsuranceEditor />
    </el-card>

    <el-collapse v-model="advancedPanels" class="setup__collapse">
      <el-collapse-item title="雇佣阶段（实习期 / 试用期 / 转正后）" name="stage">
        <StageEditor v-if="isPanelOpen('stage')" />
      </el-collapse-item>
      <el-collapse-item title="专项附加扣除与其他扣除" name="deduction">
        <DeductionEditor v-if="isPanelOpen('deduction')" />
      </el-collapse-item>
      <el-collapse-item title="高级设置（纳税人身份、减免税额、年终奖口径）" name="advanced">
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
      </el-collapse-item>
    </el-collapse>

    <footer class="setup__footer">
      <span class="setup__footer-hint">
        共 {{ salaryStore.activeIncomes.length }} 个收入项参与计算
      </span>
      <el-button type="primary" :icon="ArrowRight" @click="emit('next')">查看月度明细</el-button>
    </footer>
  </section>
</template>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1080px;
  margin: 0 auto;
}

.setup__card-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.setup__card-title {
  font-size: 15px;
  font-weight: 600;
}

.setup__card-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.setup__period {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0 16px;
}

.setup__field {
  width: 160px;
}

.setup__unit {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.setup__collapse {
  border-top: none;
}

.setup__footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  box-shadow: 0 -2px 12px rgb(0 0 0 / 6%);
}

.setup__footer-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
