<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/setup/TargetReverseCard.vue
 * @Description: 期望到手倒推应发工资——回答「想拿这么多，税前该开多少」
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { eligibleAdjustIncomes, reverseMonthlyNet, type ReversePlan } from '@/core'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { formatMoney } from '@/utils/format'

const salaryStore = useSalaryStore()
const { input } = useSalaryCalculator()

/** 可参与反推的固定工资项：逐月发放、应税、非现金、非绩效计价 */
const options = computed(() => eligibleAdjustIncomes(salaryStore.incomes))

const targetMonthly = ref<number>()
const adjustId = ref<string>('')
const plan = ref<ReversePlan | null>(null)

function effectiveAdjustId(): string | undefined {
  if (adjustId.value) return adjustId.value
  return options.value[0]?.id
}

function run() {
  if (!targetMonthly.value || targetMonthly.value <= 0) {
    ElMessage.warning('先填写一个期望的税后月到手金额')
    return
  }
  const adjustIncomeId = effectiveAdjustId()
  if (!adjustIncomeId) {
    ElMessage.warning('没有可反推的固定工资项，请先在收入项里添加一项逐月工资')
    return
  }
  plan.value = reverseMonthlyNet({
    input: input.value,
    targetMonthlyNet: targetMonthly.value,
    adjustIncomeId,
  })
}

function apply() {
  const current = plan.value
  if (!current?.reachable) return
  // 与反推时的归一化保持一致：清掉阶段/逐月浮动/绩效覆盖，避免「算得出、填不对」
  salaryStore.updateIncome(current.adjustIncomeId, {
    amount: current.monthlyIncome,
    staged: false,
    stageAmounts: {},
    stageEnabled: {},
    variableByMonth: false,
    monthlyAmounts: undefined,
    scoreBased: false,
  })
  for (const override of Object.values(salaryStore.monthOverrides)) {
    if (override.amounts && current.adjustIncomeId in override.amounts) {
      delete override.amounts[current.adjustIncomeId]
    }
  }
  ElMessage.success(`已把「${current.adjustIncomeName}」调整为 ¥${formatMoney(current.monthlyIncome)} / 月`)
}
</script>

<template>
  <section class="reverse-card">
    <header class="reverse-card__head">
      <div>
        <p class="reverse-card__eyebrow">目标倒推</p>
        <h3 class="reverse-card__title">我想每月到手</h3>
      </div>
      <span class="reverse-card__unit">元 / 月</span>
    </header>

    <div class="reverse-card__controls">
      <el-input-number
        v-model="targetMonthly"
        :min="0"
        :max="500000"
        :step="500"
        :precision="0"
        controls-position="right"
        placeholder="期望到手"
        class="reverse-card__target"
      />
      <el-select v-model="adjustId" placeholder="可调收入项" class="reverse-card__select">
        <el-option v-for="item in options" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-button type="primary" plain :disabled="!targetMonthly" @click="run">反推</el-button>
    </div>

    <div v-if="plan" class="reverse-card__result">
      <template v-if="plan.reachable">
        <p class="reverse-card__line">
          「{{ plan.adjustIncomeName }}」应发约
          <strong>¥{{ formatMoney(plan.monthlyIncome) }}</strong> / 月
        </p>
        <p class="reverse-card__sub">
          年度到手 ¥{{ formatMoney(plan.annualNet) }}，月均到手 ¥{{ formatMoney(plan.monthlyNet) }}
        </p>
        <el-button size="small" @click="apply">填入工资项</el-button>
      </template>
      <p v-else-if="plan.minMonthlyNet !== undefined" class="reverse-card__line">
        即便该项不计收入，月均到手也有
        <strong>¥{{ formatMoney(plan.minMonthlyNet) }}</strong>，已经高于目标
      </p>
      <p v-else class="reverse-card__line">目标超出可反推上限，请检查是否填了过大的金额</p>
    </div>

    <p class="reverse-card__hint">以当前参保、扣除与年终奖设置为基准；改动录入后请重新反推。</p>
  </section>
</template>

<style scoped>
.reverse-card {
  padding: 14px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
}

.reverse-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.reverse-card__eyebrow {
  margin: 0;
  font-family: var(--app-font-ledger);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--app-ink-500);
}

.reverse-card__title {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-ink-900);
}

.reverse-card__unit {
  font-size: 12px;
  color: var(--app-ink-300);
}

.reverse-card__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reverse-card__target {
  width: 118px;
}

.reverse-card__select {
  flex: 1 1 120px;
}

.reverse-card__result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--app-jade-100);
  border-radius: var(--app-radius-sm);
  background: linear-gradient(160deg, var(--app-jade-100), var(--app-surface) 70%);
}

.reverse-card__line {
  margin: 0;
  font-size: 12.5px;
  color: var(--app-ink-700);
}

.reverse-card__line strong {
  font-family: var(--app-font-num);
  font-size: 14px;
  color: var(--app-jade-700);
}

.reverse-card__sub {
  margin: 0;
  font-size: 11.5px;
  color: var(--app-ink-500);
}

.reverse-card__result .el-button {
  margin-top: 4px;
}

.reverse-card__hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--app-ink-300);
}
</style>
