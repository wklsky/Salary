<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/ExplainDrawer.vue
 * @Description: 计算明细抽屉：逐月税额分解、跳档提示与汇算差异解释
 */
import { computed } from 'vue'
import { ANNUAL_TAX_BRACKETS } from '@/config/taxBrackets'
import { POLICY_DISCLAIMER } from '@/config/policy'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { formatMoney, formatPercent } from '@/utils/format'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:model-value': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:model-value', value),
})

const { result } = useSalaryCalculator()

/** 找到累计应纳税所得额所处的年度税率档 */
function bracketOf(amount: number) {
  return (
    ANNUAL_TAX_BRACKETS.find((item) => amount <= item.upper) ??
    ANNUAL_TAX_BRACKETS[ANNUAL_TAX_BRACKETS.length - 1]
  )
}

interface ExplainRow {
  month: number
  cumulative: number
  bracketLabel: string
  rate: number
  cumulativeTaxPaid: number
  tax: number
  jumped: boolean
}

const rows = computed<ExplainRow[]>(() => {
  let previousLevel = 0
  return result.value.monthly.map((item) => {
    const bracket = bracketOf(item.cumulativeTaxable)
    const jumped = previousLevel > 0 && bracket.level > previousLevel && item.tax > 0
    previousLevel = bracket.level
    const range =
      bracket.upper === Number.POSITIVE_INFINITY
        ? `超过 ${formatMoney(bracket.lower)}`
        : `${formatMoney(bracket.lower)} ~ ${formatMoney(bracket.upper)}`
    return {
      month: item.month,
      cumulative: item.cumulativeTaxable,
      bracketLabel: `第 ${bracket.level} 档 ${range}（${Math.round(bracket.rate * 100)}%）`,
      rate: bracket.rate,
      cumulativeTaxPaid: item.cumulativeTaxPaid,
      tax: item.tax,
      jumped,
    }
  })
})

const jumpMonths = computed(() => rows.value.filter((row) => row.jumped).map((row) => row.month))

const bonusText = computed(() => {
  const applied = result.value.appliedBonusMode
  if (!result.value.bonusComparison) {
    return applied === 'merged'
      ? '年终奖并入了综合所得计算'
      : '本年度没有年终奖，或单独计税政策不适用'
  }
  if (applied === 'separate') return '年终奖按全年一次性奖金单独计税（不并入综合所得）'
  if (applied === 'split') {
    const split = result.value.bonusComparison.splitAmount ?? 0
    return `年终奖拆分为两部分：${formatMoney(split)} 单独计税，其余并入综合所得（自动取全年税负最低的拆法）`
  }
  return '年终奖已并入综合所得，与工资合并计税'
})

const settlementText = computed(() => {
  const diff = result.value.annual.settlementDiff
  if (Math.abs(diff) < 0.01) return '按当前口径，年度汇算与月度预扣基本持平，无需补税或退税。'
  if (diff > 0) {
    return `年度汇算需补税 ${formatMoney(diff)}：汇算口径的应纳税额高于全年已预扣税额，差额需在次年汇算清缴时补齐。`
  }
  return `年度汇算可退税 ${formatMoney(Math.abs(diff))}：全年已预扣税额高于汇算口径的应纳税额，多缴部分可申请退还。`
})

const settlementReason = computed(() => {
  const parts: string[] = []
  if (result.value.annual.settlementOnlyDeduction > 0) {
    parts.push(
      `有 ${formatMoney(result.value.annual.settlementOnlyDeduction)} 的扣除项只能在年度汇算时扣除`,
    )
  }
  if (result.value.annual.donationApplied > 0) {
    parts.push(`公益捐赠按应纳税所得额 30% 限额扣除 ${formatMoney(result.value.annual.donationApplied)}`)
  }
  if (!parts.length) parts.push('逐月累计预扣与年度汇算采用同一套累计口径')
  return `${parts.join('；')}。`
})
</script>

<template>
  <el-drawer v-model="visible" title="计算明细" size="640px" class="explain-drawer">
    <section class="explain-drawer__body">
      <div class="explain-summary">
        <div class="explain-summary__item">
          <span>年度应纳税所得额</span>
          <strong>¥{{ formatMoney(result.annual.taxableIncome) }}</strong>
        </div>
        <div class="explain-summary__item">
          <span>全年个税</span>
          <strong>¥{{ formatMoney(result.annual.tax) }}</strong>
        </div>
        <div class="explain-summary__item">
          <span>实际税负率</span>
          <strong>{{ formatPercent(result.annual.taxRate) }}</strong>
        </div>
      </div>

      <div class="explain-block">
        <h4>逐月预扣明细</h4>
        <p class="explain-block__hint">
          工资薪金采用累计预扣法：累计应纳税所得额跨过税率档时，当月起预扣比例会提高。
          <template v-if="jumpMonths.length">
            本年度在 <strong>{{ jumpMonths.join('、') }} 月</strong>发生跳档。
          </template>
        </p>
        <el-table :data="rows" size="small" border max-height="320" class="explain-table">
          <el-table-column prop="month" label="月份" width="56" align="center" />
          <el-table-column label="累计应纳税所得额" width="130" align="right">
            <template #default="{ row }">{{ formatMoney(row.cumulative) }}</template>
          </el-table-column>
          <el-table-column prop="bracketLabel" label="适用税率档" min-width="160" />
          <el-table-column label="累计已预扣" width="100" align="right">
            <template #default="{ row }">{{ formatMoney(row.cumulativeTaxPaid) }}</template>
          </el-table-column>
          <el-table-column label="本期预扣" width="90" align="right">
            <template #default="{ row }">
              <span :class="{ 'is-jumped': row.jumped }">{{ formatMoney(row.tax) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="跳档" width="56" align="center">
            <template #default="{ row }">
              <span v-if="row.jumped" class="explain-jump">↑</span>
              <span v-else class="explain-muted">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="explain-block">
        <h4>汇算差异</h4>
        <p class="explain-block__text" :class="{ 'is-pay': result.annual.settlementDiff > 0.01 }">
          {{ settlementText }}
        </p>
        <p class="explain-block__hint">原因：{{ settlementReason }}</p>
      </div>

      <div class="explain-block">
        <h4>年终奖计税方式</h4>
        <p class="explain-block__text">{{ bonusText }}</p>
        <p v-if="result.bonusComparison" class="explain-block__hint">
          单独计税税额 ¥{{ formatMoney(result.bonusComparison.separateTax) }} · 并入综合所得税额
          ¥{{ formatMoney(result.bonusComparison.mergedTax) }}
          <template v-if="result.bonusComparison.better === 'split'">
            · 最优拆分后 ¥{{ formatMoney(result.bonusComparison.splitTax ?? 0) }}
          </template>
        </p>
      </div>

      <p class="explain-drawer__note">{{ POLICY_DISCLAIMER }}</p>
    </section>
  </el-drawer>
</template>

<style scoped>
.explain-drawer__body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.explain-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.explain-summary__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  background: var(--app-sunken);
}

.explain-summary__item span {
  font-size: var(--app-text-xs);
  color: var(--app-ink-500);
}

.explain-summary__item strong {
  font-family: var(--app-font-num);
  font-size: var(--app-text-lg);
  font-weight: 600;
  color: var(--app-ink-900);
}

.explain-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.explain-block h4 {
  margin: 0;
  font-size: var(--app-text-md);
  font-weight: 600;
  color: var(--app-ink-900);
}

.explain-block__hint {
  margin: 0;
  font-size: var(--app-text-xs);
  line-height: 1.7;
  color: var(--app-ink-500);
}

.explain-block__text {
  margin: 0;
  font-size: var(--app-text-base);
  line-height: 1.7;
  color: var(--app-ink-700);
}

.explain-block__text.is-pay {
  color: var(--app-amber-700);
}

.explain-table :deep(.el-table__cell) {
  padding: 5px 0;
}

.explain-jump {
  color: var(--app-amber-600);
  font-weight: 700;
}

.explain-muted {
  color: var(--app-ink-300);
}

.is-jumped {
  color: var(--app-amber-700);
  font-weight: 600;
}

.explain-drawer__note {
  margin: 0;
  font-size: var(--app-text-xs);
  line-height: 1.6;
  color: var(--app-ink-300);
}
</style>
