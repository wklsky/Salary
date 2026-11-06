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
import { useSettingsStore } from '@/stores/useSettingsStore'

interface Props {
  /** 渲染哪些图表：trend 趋势 / structure 收入去向 / insurance 五险一金 / all 全部 */
  mode?: 'trend' | 'structure' | 'insurance' | 'all'
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'all',
})

// 按需注册 ECharts 模块，避免把整个图表库打进首屏
use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent])

const { result } = useSalaryCalculator()
const settingsStore = useSettingsStore()

/** 深色模式下图表要换成浅色文字与深色分隔线，否则在深底上看不清 */
const isDark = computed(() => settingsStore.theme === 'dark')

const months = computed(() => result.value.monthly.map((item) => `${item.month} 月`))

/* 图表配色：与全局「墨蓝 + 玉石绿 + 琥珀」一致，不再用 Element 默认蓝红 */
const PALETTE_LIGHT = {
  ink: '#16233a',
  jade: '#0f766e',
  slate: '#8fa3ba',
  slateDark: '#4b5b72',
  amber: '#e9a23b',
  text: '#64748b',
  line: '#dfe6ee',
  lineStrong: '#c9d4e0',
  tooltipBg: '#ffffff',
  tooltipShadow: '0 12px 32px -12px rgb(22 35 58 / 18%)',
} as const

const PALETTE_DARK = {
  ink: '#e6eef8',
  jade: '#2bb3a5',
  slate: '#8fa3ba',
  slateDark: '#5b6d86',
  amber: '#e9a23b',
  text: '#93a3b5',
  line: '#273449',
  lineStrong: '#35455e',
  tooltipBg: '#1a2435',
  tooltipShadow: '0 12px 32px -12px rgb(0 0 0 / 55%)',
} as const

const chart = computed(() => (isDark.value ? PALETTE_DARK : PALETTE_LIGHT))

const baseTooltip = computed(() => ({
  backgroundColor: chart.value.tooltipBg,
  borderColor: chart.value.lineStrong,
  borderWidth: 1,
  padding: [8, 12] as [number, number],
  textStyle: { color: chart.value.ink, fontSize: 12 },
  extraCssText: `box-shadow: ${chart.value.tooltipShadow}; border-radius: 8px;`,
}))

const baseLegend = computed(() => ({
  itemWidth: 10,
  itemHeight: 10,
  itemGap: 16,
  textStyle: { color: chart.value.text, fontSize: 12 },
}))

const trendOption = computed(() => {
  const c = chart.value
  return {
    color: [c.slate, c.jade, c.amber],
    tooltip: {
      ...baseTooltip.value,
      trigger: 'axis',
      valueFormatter: (value: unknown) => `¥${Number(value).toLocaleString('zh-CN')}`,
    },
    legend: { ...baseLegend.value, data: ['应发', '到手', '个税'] },
    grid: { left: 64, right: 24, top: 44, bottom: 28 },
    xAxis: {
      type: 'category',
      data: months.value,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: c.lineStrong } },
      axisLabel: { color: c.text, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: '元',
      axisLabel: { color: c.text, fontSize: 11 },
      splitLine: { lineStyle: { color: c.line } },
    },
    series: [
      {
        name: '应发',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: c.slate, borderRadius: [4, 4, 0, 0] },
        data: result.value.monthly.map((item) => item.gross),
      },
      {
        name: '到手',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: c.jade, borderRadius: [4, 4, 0, 0] },
        data: result.value.monthly.map((item) => item.net),
      },
      {
        name: '个税',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        itemStyle: { color: c.amber },
        lineStyle: { width: 2.5 },
        areaStyle: { color: c.amber, opacity: 0.12 },
        data: result.value.monthly.map((item) => item.taxTotal),
      },
    ],
  }
})

/* 与结算卡组成条同一套段色，图表与卡片可以互相印证 */
const structureOption = computed(() => {
  const c = chart.value
  const annual = result.value.annual
  const segmentColors = [c.jade, c.slate, c.amber, c.slateDark]
  return {
    color: segmentColors,
    tooltip: { ...baseTooltip.value, trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { ...baseLegend.value, bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: true,
        label: { formatter: '{b}\n{d}%', color: c.text, fontSize: 11 },
        labelLine: { lineStyle: { color: c.lineStrong } },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0, 0, 0, 0.28)' } },
        // 非现金收入含在应发中但不计入到手，单列一片才能让饼图合计等于应发
        data: [
          { name: '到手工资', value: annual.net },
          { name: '五险一金(个人)', value: annual.insurancePersonal },
          { name: '个人所得税', value: annual.tax },
          ...(annual.nonCashIncome > 0
            ? [{ name: '非现金收入', value: annual.nonCashIncome }]
            : []),
        ],
      },
    ],
  }
})

/* 五险一金用玉绿阶梯 + 琥珀公积金，与主色一致 */
const INSURANCE_COLORS = ['#0f766e', '#4f9a93', '#87bcb6', '#b9d8d4', '#8fa3ba', '#e9a23b']

const insuranceOption = computed(() => {
  const c = chart.value
  return {
    color: INSURANCE_COLORS,
    tooltip: { ...baseTooltip.value, trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { ...baseLegend.value, bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: '65%',
        label: { formatter: '{b}\n{d}%', color: c.text, fontSize: 11 },
        labelLine: { lineStyle: { color: c.lineStrong } },
        data: result.value.insuranceAnnual
          .filter((item) => item.personal > 0)
          .map((item) => ({ name: INSURANCE_LABELS[item.type], value: item.personal })),
      },
    ],
  }
})
</script>

<template>
  <div class="chart-panel">
    <el-card
      v-if="props.mode === 'all' || props.mode === 'trend'"
      shadow="never"
      class="chart-card"
    >
      <template #header>月度应发 / 到手 / 个税趋势</template>
      <v-chart class="chart" :option="trendOption" autoresize />
    </el-card>
    <el-card
      v-if="props.mode === 'all' || props.mode === 'structure'"
      shadow="never"
      class="chart-card"
    >
      <template #header>年度收入去向</template>
      <v-chart class="chart" :option="structureOption" autoresize />
    </el-card>
    <el-card
      v-if="props.mode === 'all' || props.mode === 'insurance'"
      shadow="never"
      class="chart-card"
    >
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
}

.chart-card :deep(.el-card__header::before) {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--app-jade-600);
  content: '';
}

.chart {
  height: 300px;
  width: 100%;
}
</style>
