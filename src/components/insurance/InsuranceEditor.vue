<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/insurance/InsuranceEditor.vue
 * @Description: 五险一金配置：城市政策、缴费基数口径、各险种比例与封顶托底
 */
import { computed } from 'vue'
import { CITIES } from '@/config/cities'
import { INSURANCE_LABELS } from '@/config/columns'
import { HOUSING_FUND_RATE_OPTIONS } from '@/config/policy'
import { resolveCity } from '@/core'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatMoney } from '@/utils/format'
import { round2 } from '@/core'
import { INSURANCE_TYPES } from '@/types'
import type { HousingFundBaseMode, InsuranceType, RatePair } from '@/types'

const store = useSalaryStore()
const settingsStore = useSettingsStore()
const { result } = useSalaryCalculator()

const city = computed(() => resolveCity(store.insurance.cityCode))

/** 以入职当月为例展示生效基数与缴纳额，入职前的月份基数为 0 */
const sampleDetail = computed(
  () =>
    result.value.insuranceMonthly.find((item) => item.month === settingsStore.startMonth) ??
    result.value.insuranceMonthly[0],
)

/** 手动指定/上年度月均口径下才需要填写基数 */
const needManualBase = computed(
  () => store.insurance.baseMode === 'manual' || store.insurance.baseMode === 'lastYearAvg',
)

/**
 * 社保缴费基数的法定口径是职工本人上年度月平均工资
 * 「按当年应发」只是没有历史数据时的近似值，故在选项文案上明确标注
 */
const BASE_MODE_OPTIONS = [
  { value: 'gross', label: '按当年应发（近似）' },
  { value: 'lastYearAvg', label: '按上年度月均（法定）' },
  { value: 'manual', label: '手动指定' },
  { value: 'lowerLimit', label: '按下限托底' },
] as const

/** 公积金基数可与社保基数不同，故单独提供一套口径选择 */
const HOUSING_FUND_BASE_MODE_OPTIONS: { value: HousingFundBaseMode; label: string }[] = [
  { value: 'same', label: '同社保基数' },
  { value: 'gross', label: '按当年应发（近似）' },
  { value: 'lastYearAvg', label: '按上年度月均（法定）' },
  { value: 'manual', label: '手动指定' },
  { value: 'lowerLimit', label: '按下限托底' },
]

/** 手动指定/上年度月均口径下公积金也需要填写基数 */
const needHousingManualBase = computed(
  () =>
    store.insurance.housingFundBaseMode === 'manual' ||
    store.insurance.housingFundBaseMode === 'lastYearAvg',
)

/** 公积金基数上下限缺省时沿用社保基数上下限 */
const housingFundRange = computed(() => city.value.housingFundBase ?? city.value.base)

/** 生效费率：优先取用户覆盖值，缺省回落到城市政策 */
function rateOf(type: InsuranceType): RatePair {
  return store.insurance.items[type]?.rate ?? city.value.rates[type] ?? { personal: 0, company: 0 }
}

function isOverridden(type: InsuranceType): boolean {
  return Boolean(store.insurance.items[type]?.rate)
}

function isMerged(type: InsuranceType): boolean {
  // 该险种在本市已并入医疗，不再单独征收
  return !city.value.rates[type]
}

function percentOf(value: number): number {
  return round2(value * 100)
}

function setRate(type: InsuranceType, side: 'personal' | 'company', percent: number) {
  const current = rateOf(type)
  store.updateInsuranceItem(type, {
    rate: side === 'personal'
      ? { ...current, personal: round2(percent / 100) }
      : { ...current, company: round2(percent / 100) },
  })
}

function resetRate(type: InsuranceType) {
  store.updateInsuranceItem(type, { rate: undefined })
}

/** 公积金比例快捷档位：个人与单位同比例 */
function applyHousingFundPreset(percent: number) {
  store.updateInsuranceItem('housingFund', {
    rate: { personal: round2(percent / 100), company: round2(percent / 100) },
  })
}
</script>

<template>
  <section class="insurance-editor">
    <el-form label-width="96px" size="small">
      <el-form-item label="参保城市">
        <el-select v-model="store.insurance.cityCode" filterable class="full-width">
          <el-option
            v-for="item in CITIES"
            :key="item.code"
            :label="item.name"
            :value="item.code"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="缴费基数">
        <el-radio-group v-model="store.insurance.baseMode">
          <el-radio
            v-for="option in BASE_MODE_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label=" ">
        <span class="inline-tip">
          法定口径为本人上年度月平均工资；选「按当年应发」时基数会随当年调薪波动，仅作近似
        </span>
      </el-form-item>

      <el-form-item v-if="needManualBase" label="基数值">
        <el-input-number
          v-model="store.insurance.manualBase"
          :min="0"
          :step="500"
          :precision="0"
          controls-position="right"
          class="full-width"
        />
      </el-form-item>

      <el-form-item label="封顶托底">
        <el-switch v-model="store.insurance.clampEnabled" />
        <span class="inline-tip">
          社保基数上下限 {{ formatMoney(city.base.lower) }} ~ {{ formatMoney(city.base.upper) }}
          （{{ city.referenceYear }} 年参考值）
        </span>
      </el-form-item>

      <el-form-item label="公积金基数">
        <el-select v-model="store.insurance.housingFundBaseMode" class="full-width">
          <el-option
            v-for="option in HOUSING_FUND_BASE_MODE_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item v-if="needHousingManualBase" label="公积金基数">
        <el-input-number
          v-model="store.insurance.housingFundManualBase"
          :min="0"
          :step="500"
          :precision="0"
          controls-position="right"
          class="full-width"
        />
      </el-form-item>

      <el-form-item label="公积金托底">
        <el-switch v-model="store.insurance.housingFundClampEnabled" />
        <span class="inline-tip">
          公积金基数上下限 {{ formatMoney(housingFundRange.lower) }} ~
          {{ formatMoney(housingFundRange.upper) }}，缴费额按元取整
        </span>
      </el-form-item>

      <el-form-item label="大病医疗">
        <el-input-number
          v-model="store.insurance.medicalFixed"
          :min="0"
          :step="1"
          :precision="0"
          size="small"
          controls-position="right"
          class="full-width"
        />
        <span class="inline-tip">
          元/月，叠加到个人医疗；默认 0 不计入{{
            city.medicalFixed ? `，本市参考 ${city.medicalFixed} 元` : ''
          }}
        </span>
      </el-form-item>
    </el-form>

    <el-alert
      :closable="false"
      type="info"
      class="insurance-editor__tip"
      :title="`入职当月社保基数 ¥${formatMoney(sampleDetail?.base ?? 0)}，公积金基数 ¥${formatMoney(sampleDetail?.housingFundBase ?? 0)}；处于不同雇佣阶段时基数会随当月工资变化`"
    />

    <div class="housing-fund">
      <span class="housing-fund__label">公积金比例</span>
      <el-button
        v-for="percent in HOUSING_FUND_RATE_OPTIONS"
        :key="percent"
        size="small"
        :type="percentOf(rateOf('housingFund').personal) === percent ? 'primary' : 'default'"
        plain
        @click="applyHousingFundPreset(percent)"
      >
        {{ percent }}%
      </el-button>
    </div>

    <el-table :data="INSURANCE_TYPES" size="small" class="insurance-table">
      <el-table-column label="险种" min-width="80">
        <template #default="{ row }">
          <span>{{ INSURANCE_LABELS[row as InsuranceType] }}</span>
          <el-tag v-if="isMerged(row as InsuranceType)" size="small" type="info" effect="plain">
            已并入医疗
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="52" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="store.insurance.items[row as InsuranceType]?.enabled ?? false"
            size="small"
            @update:model-value="
              (value: boolean) => store.updateInsuranceItem(row as InsuranceType, { enabled: value })
            "
          />
        </template>
      </el-table-column>
      <el-table-column label="个人 %" width="84">
        <template #default="{ row }">
          <el-input-number
            :model-value="percentOf(rateOf(row as InsuranceType).personal)"
            :min="0"
            :max="100"
            :step="0.5"
            :precision="2"
            size="small"
            controls-position="right"
            @update:model-value="
              (value: number) => setRate(row as InsuranceType, 'personal', value ?? 0)
            "
          />
        </template>
      </el-table-column>
      <el-table-column label="单位 %" width="84">
        <template #default="{ row }">
          <el-input-number
            :model-value="percentOf(rateOf(row as InsuranceType).company)"
            :min="0"
            :max="100"
            :step="0.5"
            :precision="2"
            size="small"
            controls-position="right"
            @update:model-value="
              (value: number) => setRate(row as InsuranceType, 'company', value ?? 0)
            "
          />
        </template>
      </el-table-column>
      <el-table-column label="月缴纳(个人)" width="100" align="right">
        <template #default="{ row }">
          {{ formatMoney(sampleDetail?.personal[row as InsuranceType] ?? 0) }}
        </template>
      </el-table-column>
      <el-table-column label="月缴纳(单位)" width="100" align="right">
        <template #default="{ row }">
          {{ formatMoney(sampleDetail?.company[row as InsuranceType] ?? 0) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="64" align="center">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            size="small"
            :disabled="!isOverridden(row as InsuranceType)"
            @click="resetRate(row as InsuranceType)"
          >
            复原
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="insurance-editor__total">
      <span>个人月缴 <strong>¥{{ formatMoney(sampleDetail?.personalTotal ?? 0) }}</strong></span>
      <span>单位月缴 <strong>¥{{ formatMoney(sampleDetail?.companyTotal ?? 0) }}</strong></span>
    </div>
  </section>
</template>

<style scoped>
.insurance-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.full-width {
  width: 100%;
}

.inline-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.insurance-editor__tip :deep(.el-alert__title) {
  font-size: 12px;
}

.housing-fund {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.housing-fund__label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.insurance-table :deep(.el-table__cell) {
  padding: 4px 0;
}

.insurance-editor__total {
  display: flex;
  justify-content: space-around;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.insurance-editor__total strong {
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}
</style>
