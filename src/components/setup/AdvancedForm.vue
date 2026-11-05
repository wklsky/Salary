<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/setup/AdvancedForm.vue
 * @Description: 高级设置表单：纳税人身份、减免税额与年终奖计税口径
 */
import { computed } from 'vue'
import { POLICY_DISCLAIMER } from '@/config/policy'
import { useSettingsStore } from '@/stores/useSettingsStore'
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
</script>

<template>
  <div class="advanced-form">
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
          class="advanced-form__field"
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
</style>
