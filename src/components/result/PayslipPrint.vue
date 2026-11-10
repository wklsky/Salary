<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/result/PayslipPrint.vue
 * @Description: 打印专用工资条：屏幕上隐藏，仅在 body.print-payslip 时随 window.print() 输出
 */
import { computed } from 'vue'
import { formatMoney } from '@/utils/format'
import type { AnnualSummary, MonthlyResult } from '@/types'

const props = defineProps<{
  year: number
  startMonth: number
  endMonth: number
  rows: MonthlyResult[]
  annual: AnnualSummary
}>()

const totals = computed(() => {
  const sum = (pick: (row: MonthlyResult) => number) =>
    props.rows.reduce((acc, row) => acc + pick(row), 0)
  return {
    gross: sum((row) => row.gross),
    insurance: sum((row) => row.insurancePersonal),
    deduction: sum((row) => row.deductionTotal),
    tax: sum((row) => row.taxTotal),
    postTax: sum((row) => row.postTaxDeduction),
    totalDeduction: sum((row) => row.totalDeduction),
    net: sum((row) => row.net),
  }
})

const generatedAt = computed(() => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
})
</script>

<template>
  <div class="payslip-print">
    <header class="payslip-print__head">
      <div>
        <h1 class="payslip-print__title">月度工资条</h1>
        <p class="payslip-print__sub">
          {{ year }} 年 · {{ startMonth }}–{{ endMonth }} 月 · 共 {{ rows.length }} 个月
        </p>
      </div>
      <div class="payslip-print__meta">
        <span>薪资计算器</span>
        <span>生成于 {{ generatedAt }}</span>
      </div>
    </header>

    <table class="payslip-print__table">
      <colgroup>
        <col style="width: 9%" />
        <col style="width: 13%" />
        <col style="width: 13%" />
        <col style="width: 15%" />
        <col style="width: 11%" />
        <col style="width: 13%" />
        <col style="width: 13%" />
        <col style="width: 13%" />
      </colgroup>
      <thead>
        <tr>
          <th>月份</th>
          <th>应发工资</th>
          <th>五险一金</th>
          <th>专项附加扣除</th>
          <th>个税</th>
          <th>税后扣款</th>
          <th>总扣款</th>
          <th>实发工资</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.month">
          <td>{{ row.month }} 月</td>
          <td>{{ formatMoney(row.gross) }}</td>
          <td>{{ formatMoney(row.insurancePersonal) }}</td>
          <td>{{ formatMoney(row.deductionTotal) }}</td>
          <td>{{ formatMoney(row.taxTotal) }}</td>
          <td>{{ formatMoney(row.postTaxDeduction) }}</td>
          <td>{{ formatMoney(row.totalDeduction) }}</td>
          <td class="is-strong">{{ formatMoney(row.net) }}</td>
        </tr>
        <tr class="is-total">
          <td>合计</td>
          <td>{{ formatMoney(totals.gross) }}</td>
          <td>{{ formatMoney(totals.insurance) }}</td>
          <td>{{ formatMoney(totals.deduction) }}</td>
          <td>{{ formatMoney(totals.tax) }}</td>
          <td>{{ formatMoney(totals.postTax) }}</td>
          <td>{{ formatMoney(totals.totalDeduction) }}</td>
          <td class="is-strong">{{ formatMoney(totals.net) }}</td>
        </tr>
      </tbody>
    </table>

    <section class="payslip-print__summary">
      <div class="payslip-print__cell">
        <span>年度应发</span>
        <strong>¥{{ formatMoney(annual.gross) }}</strong>
      </div>
      <div class="payslip-print__cell">
        <span>五险一金（个人）</span>
        <strong>¥{{ formatMoney(annual.insurancePersonal) }}</strong>
      </div>
      <div class="payslip-print__cell">
        <span>全年个税</span>
        <strong>¥{{ formatMoney(annual.tax) }}</strong>
      </div>
      <div class="payslip-print__cell">
        <span>年度到手</span>
        <strong>¥{{ formatMoney(annual.net) }}</strong>
      </div>
    </section>

    <footer class="payslip-print__foot">
      数据仅存于本机浏览器，不上传服务器；结果按当前税率与社保政策口径计算，仅供参考。
    </footer>
  </div>
</template>

<style scoped>
/* 屏幕与普通打印都不显示，只有按钮主动加上 body.print-payslip 时才输出 */
.payslip-print {
  display: none;
  color: #111;
  background: #fff;
  font-family: var(--app-font-num), 'Microsoft YaHei', sans-serif;
}

.payslip-print__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid #111;
}

.payslip-print__title {
  margin: 0;
  font-size: 19px;
  letter-spacing: 0.06em;
}

.payslip-print__sub {
  margin: 4px 0 0;
  font-size: 11px;
  color: #444;
}

.payslip-print__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 10px;
  color: #555;
}

.payslip-print__table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 10.5px;
}

.payslip-print__table th,
.payslip-print__table td {
  padding: 5px 6px;
  border: 1px solid #bbb;
  text-align: right;
  white-space: nowrap;
}

.payslip-print__table th:first-child,
.payslip-print__table td:first-child {
  text-align: left;
}

.payslip-print__table thead th {
  background: #f1f3f5;
  font-weight: 600;
}

.payslip-print__table .is-strong {
  font-weight: 700;
}

.payslip-print__table .is-total td {
  background: #f7f8fa;
  font-weight: 700;
  border-top: 2px solid #666;
}

.payslip-print__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #bbb;
}

.payslip-print__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: #555;
}

.payslip-print__cell strong {
  font-size: 13px;
  font-weight: 700;
  color: #111;
}

.payslip-print__foot {
  margin-top: 10px;
  font-size: 9px;
  color: #777;
}
</style>
