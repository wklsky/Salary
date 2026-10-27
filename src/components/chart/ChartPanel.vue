<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/chart/ChartPanel.vue
 * @Description: 结果可视化：月度到手趋势、年度收入结构与五险一金占比（异步加载）
 */
import { computed } from 'vue'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { INSURANCE_LABELS } from '@/config/columns'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'

// 按需注册 ECharts 模块，避免把整个图表库打进首屏
use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent])

const { result } = useSalaryCalculator()

const months = computed(() => result.value.monthly.map((item) => `${item.month} 月`))

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['应发', '到手', '个税'] },
  grid: { left: 60, right: 24, top: 40, bottom: 30 },
  xAxis: { type: 'category', data: months.value },
  yAxis: { type: 'value', name: '元' },
  series: [
    {
      name: '应发',
      type: 'bar',
      data: result.value.monthly.map((item) => item.gross),
      itemStyle: { color: '#a3c4f3' },
    },
    {
      name: '到手',
      type: 'bar',
      data: result.value.monthly.map((item) => item.net),
      itemStyle: { color: '#409eff' },
    },
    {
      name: '个税',
      type: 'line',
      smooth: true,
      data: result.value.monthly.map((item) => item.taxTotal),
      itemStyle: { color: '#f56c6c' },
    },
  ],
}))

const structureOption = computed(() => {
  const annual = result.value.annual
  return {
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: true,
        label: { formatter: '{b}\n{d}%' },
        data: [
          { name: '到手工资', value: annual.net },
          { name: '五险一金(个人)', value: annual.insurancePersonal },
          { name: '个人所得税', value: annual.tax },
        ],
      },
    ],
  }
})

const insuranceOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: '65%',
      label: { formatter: '{b}\n{d}%' },
      data: result.value.insuranceAnnual
        .filter((item) => item.personal > 0)
        .map((item) => ({ name: INSURANCE_LABELS[item.type], value: item.personal })),
    },
  ],
}))
</script>

<template>
  <div class="chart-panel">
    <el-card shadow="never" class="chart-card">
      <template #header>月度应发 / 到手 / 个税趋势</template>
      <v-chart class="chart" :option="trendOption" autoresize />
    </el-card>
    <el-card shadow="never" class="chart-card">
      <template #header>年度收入去向</template>
      <v-chart class="chart" :option="structureOption" autoresize />
    </el-card>
    <el-card shadow="never" class="chart-card">
      <template #header>五险一金个人缴纳占比</template>
      <v-chart class="chart" :option="insuranceOption" autoresize />
    </el-card>
  </div>
</template>

<style scoped>
.chart-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.chart-card :deep(.el-card__header) {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
}

.chart {
  height: 300px;
  width: 100%;
}
</style>
