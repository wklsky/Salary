<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/setup/PeriodForm.vue
 * @Description: 计算周期表单：年度、起始月份与终止月份，总月数自动计算
 */
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/useSettingsStore'

const settingsStore = useSettingsStore()

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 月`,
}))

/** 终止月份不得早于起始月份，因此只列出起始月之后的月份 */
const endMonthOptions = computed(() =>
  MONTH_OPTIONS.filter((option) => option.value >= settingsStore.startMonth),
)

/** 总月数由起始月与终止月自动推导，仅用于展示 */
const monthCount = computed(() => settingsStore.monthCount)
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
      <el-form-item label="终止月份">
        <el-select v-model="settingsStore.endMonth" class="period-form__field">
          <el-option
            v-for="option in endMonthOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="总月数">
        <span class="period-form__total num">{{ monthCount }} 个月</span>
        <span class="period-form__auto">按起止月份自动计算</span>
      </el-form-item>
    </el-form>
    <el-alert
      :closable="false"
      type="info"
      title="按自然年计算，起始月到终止月不得跨年。跨年周期（如 2025 年 7 月至 2026 年 6 月）请分两段录入后自行合计。"
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

.period-form__total {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-jade-700);
}

.period-form__auto {
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
