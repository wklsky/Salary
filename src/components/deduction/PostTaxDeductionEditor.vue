<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/deduction/PostTaxDeductionEditor.vue
 * @Description: 税后扣款录入（如宿舍水电费、管理费），逐月填写，只减少实发工资
 */
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { useSalaryStore } from '@/stores/useSalaryStore'
import MoneyInput from '@/components/common/MoneyInput.vue'
import { formatMoney } from '@/utils/format'
import { round2 } from '@/core'
import type { PostTaxDeductionItem } from '@/types'

const store = useSalaryStore()

/** 单项年度金额，停用的项目不计入 */
function annualAmountOf(item: PostTaxDeductionItem): number {
  if (!item.enabled) return 0
  return round2(item.monthlyAmounts.reduce((acc, value) => acc + (value || 0), 0))
}

/** 参与总扣款的年度金额；未勾选「计入总扣款」的项目仅展示 */
function annualOf(item: PostTaxDeductionItem): number {
  if (item.intoTotalDeduction === false) return 0
  return annualAmountOf(item)
}

const annualTotal = computed(() =>
  round2(store.postTaxDeductions.reduce((acc, item) => acc + annualOf(item), 0)),
)

const enabledCount = computed(
  () => store.postTaxDeductions.filter((item) => item.enabled).length,
)

/** 逐月金额缺失时按 0 展示，避免旧存档产生 undefined */
function monthAmountOf(item: PostTaxDeductionItem, month: number): number {
  return item.monthlyAmounts[month - 1] ?? 0
}
</script>

<template>
  <section class="posttax-editor">
    <header class="posttax-editor__summary">
      <div class="summary-cell">
        <span class="summary-cell__label">年度税后扣款</span>
        <strong class="summary-cell__value">¥{{ formatMoney(annualTotal) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-cell__label">已启用项目</span>
        <strong class="summary-cell__value">{{ enabledCount }} 项</strong>
      </div>
      <p class="summary-cell__hint">
        税后扣款在个税与五险一金之后扣除，不影响应纳税所得额与缴费基数
      </p>
    </header>

    <el-empty
      v-if="store.postTaxDeductions.length === 0"
      description="暂无税后扣款项，点击下方按钮新增"
    />

    <ul class="posttax-list">
      <li
        v-for="item in store.postTaxDeductions"
        :key="item.id"
        class="posttax-item"
        :class="{ 'posttax-item--disabled': !item.enabled }"
      >
        <div class="posttax-item__head">
          <el-switch v-model="item.enabled" size="small" />
          <el-input
            v-model="item.name"
            size="small"
            class="posttax-item__name"
            placeholder="扣款名称"
          />
          <el-checkbox
            :model-value="item.intoTotalDeduction !== false"
            size="small"
            @update:model-value="
              (value: boolean) => store.updatePostTaxDeduction(item.id, { intoTotalDeduction: value })
            "
          >
            计入总扣款
          </el-checkbox>
          <el-tag
            v-if="item.intoTotalDeduction === false"
            size="small"
            type="warning"
            effect="plain"
          >
            仅展示
          </el-tag>
          <span class="posttax-item__total">年度 ¥{{ formatMoney(annualAmountOf(item)) }}</span>
          <el-button
            :icon="Delete"
            size="small"
            text
            type="danger"
            @click="store.removePostTaxDeduction(item.id)"
          />
        </div>

        <div class="posttax-item__months">
          <div v-for="month in 12" :key="month" class="month-cell">
            <span class="month-cell__label">{{ month }} 月</span>
            <MoneyInput
              :model-value="monthAmountOf(item, month)"
              size="small"
              @update:model-value="
                (value: number) => store.setPostTaxMonthlyAmount(item.id, month, value)
              "
            />
          </div>
        </div>
      </li>
    </ul>

    <footer class="posttax-editor__actions">
      <el-button :icon="Plus" size="small" @click="store.addPostTaxDeduction()">
        新增扣款项
      </el-button>
      <span class="posttax-editor__tip">
        如宿舍水电费、管理费；取消「计入总扣款」后该列仅展示，不减少实发工资
      </span>
    </footer>
  </section>
</template>

<style scoped>
.posttax-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.posttax-editor__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.summary-cell__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-cell__value {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.summary-cell__hint {
  flex: 1 1 220px;
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.posttax-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.posttax-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  transition: border-color 0.2s;
}

.posttax-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.posttax-item--disabled {
  opacity: 0.55;
}

.posttax-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.posttax-item__name {
  flex: 1 1 160px;
  min-width: 120px;
}

.posttax-item__total {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.posttax-item__months {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 6px;
}

.month-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.month-cell__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.posttax-editor__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.posttax-editor__tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
