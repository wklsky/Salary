<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/AnnualTable.vue
 * @Description: 年度汇总：收入构成、五险一金年度缴纳与扣除税额明细
 */
import { computed } from 'vue'
import { INSURANCE_LABELS } from '@/config/columns'
import { BASIC_DEDUCTION_MONTHLY } from '@/config/policy'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatMoney, formatPercent } from '@/utils/format'
import { round2 } from '@/core'

const { result } = useSalaryCalculator()
const salaryStore = useSalaryStore()
const settingsStore = useSettingsStore()

/**
 * 各收入项的年度发放额：直接累加月度明细，天然包含实习期/试用期的阶段差异
 */
const incomeRows = computed(() => {
  const annualByItem = result.value.monthly.reduce<Record<string, number>>((acc, month) => {
    Object.entries(month.incomeBreakdown).forEach(([id, value]) => {
      acc[id] = round2((acc[id] ?? 0) + value)
    })
    return acc
  }, {})

  return salaryStore.incomes
    .filter((item) => item.enabled)
    .map((item) => {
      const annual = annualByItem[item.id] ?? 0
      return {
        name: item.name,
        cycle: item.cycle === 'monthly' ? '逐月' : `${item.month} 月一次性`,
        annual,
        ratio: round2(annual / (result.value.annual.gross || 1)),
      }
    })
})

const insuranceRows = computed(() =>
  result.value.insuranceAnnual
    .filter((item) => item.personal > 0 || item.company > 0)
    .map((item) => ({
      name: INSURANCE_LABELS[item.type],
      personal: item.personal,
      company: item.company,
      total: round2(item.personal + item.company),
    })),
)

/** 全年专项附加扣除直接由逐月结果累加，避免用应纳税所得额倒推在封顶为 0 时失真 */
const specialDeductionAnnual = computed(() =>
  round2(result.value.monthly.reduce((acc, month) => acc + month.deductionTotal, 0)),
)

const deductionRows = computed(() => {
  const annual = result.value.annual
  const monthsWorked = 12 - settingsStore.startMonth + 1
  return [
    {
      name: '基本减除费用',
      amount: BASIC_DEDUCTION_MONTHLY * monthsWorked,
      note: `${BASIC_DEDUCTION_MONTHLY} 元/月 × ${monthsWorked} 个月`,
    },
    {
      name: '五险一金（个人部分）',
      amount: annual.insurancePersonal,
      note: '税前扣除',
    },
    {
      name: '专项附加扣除与其他扣除',
      amount: specialDeductionAnnual.value,
      note: '逐月累加，不含公益捐赠',
    },
    ...(annual.settlementOnlyDeduction > 0
      ? [
          {
            name: '仅汇算扣除项',
            amount: annual.settlementOnlyDeduction,
            note: '如大病医疗，已扣 15000 元起付线',
          },
        ]
      : []),
    ...(annual.donationApplied > 0
      ? [
          {
            name: '公益捐赠（可扣除部分）',
            amount: annual.donationApplied,
            note: '不超过应纳税所得额的 30%',
          },
        ]
      : []),
    {
      name: '应纳税所得额',
      amount: annual.taxableIncome,
      note: '累计预扣口径',
    },
    {
      name: '全年个人所得税',
      amount: annual.tax,
      note: `预扣预缴口径，实际税负 ${formatPercent(annual.taxRate)}`,
    },
    ...(Math.abs(annual.settlementDiff) >= 0.01
      ? [
          {
            name: annual.settlementDiff >= 0 ? '汇算应补税' : '汇算应退税',
            amount: Math.abs(annual.settlementDiff),
            note: `汇算口径全年应纳税额 ¥${formatMoney(annual.settlementTax)}`,
          },
        ]
      : []),
  ]
})
</script>

<template>
  <div class="annual-table">
    <div class="annual-block">
      <h4 class="annual-block__title">收入构成</h4>
      <el-table :data="incomeRows" size="small" :border="true">
        <el-table-column prop="name" label="项目" min-width="120" />
        <el-table-column prop="cycle" label="发放方式" width="110" />
        <el-table-column label="年度金额" width="130" align="right">
          <template #default="{ row }">¥{{ formatMoney(row.annual) }}</template>
        </el-table-column>
        <el-table-column label="占应发" width="90" align="right">
          <template #default="{ row }">{{ formatPercent(row.ratio) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div class="annual-block">
      <h4 class="annual-block__title">五险一金年度缴纳</h4>
      <el-table :data="insuranceRows" size="small" :border="true">
        <el-table-column prop="name" label="险种" min-width="110" />
        <el-table-column label="个人" width="120" align="right">
          <template #default="{ row }">¥{{ formatMoney(row.personal) }}</template>
        </el-table-column>
        <el-table-column label="单位" width="120" align="right">
          <template #default="{ row }">¥{{ formatMoney(row.company) }}</template>
        </el-table-column>
        <el-table-column label="合计" width="120" align="right">
          <template #default="{ row }">¥{{ formatMoney(row.total) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div class="annual-block">
      <h4 class="annual-block__title">扣除与税额</h4>
      <el-table :data="deductionRows" size="small" :border="true">
        <el-table-column prop="name" label="项目" min-width="150" />
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">¥{{ formatMoney(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="note" label="说明" min-width="150" />
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.annual-table {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  align-items: start;
}

.annual-block__title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
</style>
