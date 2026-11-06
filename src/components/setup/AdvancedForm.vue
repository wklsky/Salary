<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/setup/AdvancedForm.vue
 * @Description: 高级设置表单：纳税人身份、减免税额与年终奖计税口径
 */
import { computed } from 'vue'
import { POLICY_DISCLAIMER } from '@/config/policy'
import { useSettingsStore } from '@/stores/useSettingsStore'
import MoneyInput from '@/components/common/MoneyInput.vue'
import type { BonusMode } from '@/types'

const settingsStore = useSettingsStore()

const BONUS_MODE_OPTIONS: { value: BonusMode; label: string }[] = [
  { value: 'auto', label: '自动择优' },
  { value: 'separate', label: '单独计税' },
  { value: 'merged', label: '并入综合所得' },
]

const currentBonusMode = computed({
  get: () => settingsStore.bonusMode,
  set: (value: BonusMode) => settingsStore.updateSettings({ bonusMode: value }),
})

/** 次月发放开关：只影响工资到账时间提示，明细仍按工资所属月展示 */
const nextMonthPay = computed({
  get: () => settingsStore.payTiming === 'next',
  set: (value: boolean) =>
    settingsStore.updateSettings({ payTiming: value ? 'next' : 'same' }),
})
</script>

<template>
  <div class="advanced-form">
    <el-form label-width="96px">
      <el-form-item label="纳税人身份">
        <el-radio-group v-model="settingsStore.taxpayerType">
          <el-radio value="resident">居民个人（累计预扣）</el-radio>
          <el-radio value="nonResident">非居民个人（按月计税）</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="每月减免税额">
        <MoneyInput
          :model-value="settingsStore.taxReductionMonthly"
          :step="100"
          class="advanced-form__field"
          @update:model-value="
            (value: number) => settingsStore.updateSettings({ taxReductionMonthly: value })
          "
        />
        <span class="advanced-form__unit">元/月</span>
      </el-form-item>
      <el-form-item label="工资发放">
        <el-switch
          v-model="nextMonthPay"
          active-text="次月发放"
          inactive-text="当月发放"
        />
        <span class="advanced-form__unit">次月发放：工资与五险一金在次月一并到账</span>
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
</template>

<style scoped>
.advanced-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.advanced-form__field {
  width: 160px;
}

.advanced-form__unit {
  margin-left: 8px;
  font-size: 12px;
  color: var(--app-ink-500);
}

/* 宽屏双列：身份与计税口径独占整行，减免税额与工资发放并排 */
@media (min-width: 900px) {
  .advanced-form :deep(.el-form) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 24px;
  }

  .advanced-form :deep(.el-form-item:nth-child(1)),
  .advanced-form :deep(.el-form-item:nth-child(4)) {
    grid-column: 1 / -1;
  }
}
</style>
