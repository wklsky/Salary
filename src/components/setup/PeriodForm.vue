<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/setup/PeriodForm.vue
 * @Description: 计算周期表单：年度、起始月份与计算月数
 */
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/useSettingsStore'

const settingsStore = useSettingsStore()

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 月`,
}))

/** 起始月变化后月数可能超出年末，取两者较小值保证不跨年 */
const monthCount = computed({
  get: () => Math.min(settingsStore.monthCount, settingsStore.maxMonthCount),
  set: (value: number) => settingsStore.updateSettings({ monthCount: value }),
})
</script>

<template>
  <div class="period-form">
    <el-form label-width="96px" class="period-form__grid">
      <el-form-item label="计算年度">
        <el-input-number
          v-model="settingsStore.year"
          :min="2000"
          :max="2099"
          controls-position="right"
          class="period-form__field"
        />
      </el-form-item>
      <el-form-item label="起始月份">
        <el-select v-model="settingsStore.startMonth" class="period-form__field">
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
          class="period-form__field"
        />
        <span class="period-form__unit">个月，最长 12 个月</span>
      </el-form-item>
    </el-form>
    <el-alert
      :closable="false"
      type="info"
      title="按自然年计算，起始月 + 计算月数不得跨年。跨年周期（如 2025 年 7 月至 2026 年 6 月）请分两段录入后自行合计。"
    />
  </div>
</template>

<style scoped>
.period-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.period-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0 16px;
}

.period-form__field {
  width: 160px;
}

.period-form__unit {
  margin-left: 8px;
  font-size: 12px;
  color: var(--app-ink-500);
}

@media (max-width: 640px) {
  .period-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
