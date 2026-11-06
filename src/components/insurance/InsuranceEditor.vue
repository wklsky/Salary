<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/insurance/InsuranceEditor.vue
 * @Description: 五险一金配置：城市政策、缴费基数口径、各险种比例与封顶托底
 */
import { computed, ref } from 'vue'
import { CITIES } from '@/config/cities'
import { INSURANCE_LABELS } from '@/config/columns'
import { HOUSING_FUND_RATE_OPTIONS } from '@/config/policy'
import { resolveCity, skippedInsuranceTypesOfMonth } from '@/core'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatMoney } from '@/utils/format'
import { round2, round4 } from '@/core'
import { INSURANCE_TYPES } from '@/types'
import type { HousingFundBaseMode, InsuranceType, RatePair } from '@/types'
import CityPolicyDrawer from './CityPolicyDrawer.vue'

const store = useSalaryStore()
const settingsStore = useSettingsStore()
const { result } = useSalaryCalculator()

const cityDrawerVisible = ref(false)

const city = computed(() => resolveCity(store.insurance.cityCode, settingsStore.customCities))

/** 内置城市 + 自定义城市合并成一份下拉数据；同 code 时自定义版本覆盖内置 */
const cityOptions = computed(() => {
  const merged = CITIES.map(
    (item) => settingsStore.customCities.find((custom) => custom.code === item.code) ?? item,
  )
  const extra = settingsStore.customCities.filter(
    (custom) => !CITIES.some((item) => item.code === custom.code),
  )
  return [...merged, ...extra]
})

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

/** 费率面板输入模式：按比例输入，或按「基数 + 月缴金额」反推 */
const rateInputMode = ref<'percent' | 'amount'>('percent')

/** 入离职区间内的月份明细，供费率面板挑选参考月 */
const workedDetails = computed(() =>
  result.value.insuranceMonthly.filter(
    (item) => item.month >= settingsStore.startMonth && item.month <= settingsStore.endMonth,
  ),
)

/**
 * 费率面板的参考月
 * 试用期只缴五险、转正后才缴公积金时，8 月的公积金是 0；
 * 这里优先找「所有已启用险种都正常缴纳」的月份，让每行月缴额与底部合计来自同一个月
 */
const rateSample = computed(() => {
  const list = workedDetails.value
  const enabledTypes = INSURANCE_TYPES.filter((type) => {
    const item = store.insurance.items[type]
    if (!item?.enabled) return false
    const rate = item.rate ?? city.value.rates[type]
    if (!rate) return false
    return rate.personal > 0 || rate.company > 0
  })
  const fullyPaid = list.find((detail) =>
    enabledTypes.every((type) => {
      if (skippedInsuranceTypesOfMonth(store.stages, detail.month).includes(type)) return false
      const base = type === 'housingFund' ? detail.housingFundBase : detail.base
      return base > 0 && (detail.personal[type] > 0 || detail.company[type] > 0)
    }),
  )
  return fullyPaid ?? list.find((item) => item.base > 0) ?? list[0]
})

/** 反推依据的月份：与面板月缴额同源 */
const sampleMonth = computed(() => rateSample.value?.month ?? settingsStore.startMonth)

/** 反推依据的基数：社保类取参考月社保基数，公积金取公积金基数 */
function baseOf(type: InsuranceType): number {
  const detail = rateSample.value
  if (!detail) return 0
  return type === 'housingFund' ? detail.housingFundBase || detail.base : detail.base
}

/** 参考月的实际月缴额，作为「按金额反推」的输入初值 */
function amountOf(type: InsuranceType, side: 'personal' | 'company'): number {
  const detail = rateSample.value
  if (!detail) return 0
  return (side === 'personal' ? detail.personal[type] : detail.company[type]) ?? 0
}

/** 按基数与金额反推比例：rate = 金额 / 基数，保留 0.01% 精度 */
function setAmount(type: InsuranceType, side: 'personal' | 'company', amount: number) {
  const base = baseOf(type)
  if (!(base > 0)) return
  const current = rateOf(type)
  const rate = round4(Math.max(0, amount) / base)
  store.updateInsuranceItem(type, {
    rate: side === 'personal' ? { ...current, personal: rate } : { ...current, company: rate },
  })
}

/** 当月没有基数时无法按金额反推 */
const reverseDisabled = computed(() => (rateSample.value?.base ?? 0) <= 0)

function setRate(type: InsuranceType, side: 'personal' | 'company', percent: number) {
  const current = rateOf(type)
  // 费率存的是小数比例，必须保留 4 位小数：round2 会把 7.5% 进位成 8%，导致减量被吞
  store.updateInsuranceItem(type, {
    rate: side === 'personal'
      ? { ...current, personal: round4(percent / 100) }
      : { ...current, company: round4(percent / 100) },
  })
}

function resetRate(type: InsuranceType) {
  store.updateInsuranceItem(type, { rate: undefined })
}

/** 公积金比例快捷档位：个人与单位同比例 */
function applyHousingFundPreset(percent: number) {
  store.updateInsuranceItem('housingFund', {
    rate: { personal: round4(percent / 100), company: round4(percent / 100) },
  })
}

/** 当前险种是否启用，用于行级弱化与开关状态 */
function enabledOf(type: InsuranceType): boolean {
  return store.insurance.items[type]?.enabled ?? false
}

/** 存在自定义比例覆盖的险种数量，决定「恢复城市默认」按钮状态 */
const overriddenCount = computed(() => INSURANCE_TYPES.filter((type) => isOverridden(type)).length)

/**
 * 面板中展示的险种
 * 大额医疗费用补助由部分城市单独征收：城市未单列且用户未覆盖时隐藏该行，避免干扰其它城市
 */
const visibleTypes = computed(() =>
  INSURANCE_TYPES.filter(
    (type) =>
      type !== 'largeMedical' || Boolean(city.value.rates.largeMedical) || isOverridden(type),
  ),
)

/** 清掉所有险种的比例覆盖，统一回到城市政策默认值 */
function resetAllRates() {
  INSURANCE_TYPES.forEach((type) => resetRate(type))
}

</script>

<template>
  <section class="insurance-editor">
    <el-form label-width="96px">
      <el-form-item label="参保城市">
        <div class="insurance-editor__city">
          <el-select v-model="store.insurance.cityCode" filterable class="full-width">
            <el-option
              v-for="item in cityOptions"
              :key="item.code"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
          <el-button text @click="cityDrawerVisible = true">城市政策</el-button>
        </div>
      </el-form-item>

      <div class="insurance-form__columns">
        <div class="insurance-form__column">
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
              class="insurance-editor__money"
            />
          </el-form-item>

          <el-form-item label="封顶托底">
            <el-switch v-model="store.insurance.clampEnabled" />
            <span class="inline-tip">
              社保基数上下限 {{ formatMoney(city.base.lower) }} ~
              {{ formatMoney(city.base.upper) }}
              （{{ city.referenceYear }} 年参考值）
            </span>
          </el-form-item>
        </div>

        <div class="insurance-form__column">
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
              class="insurance-editor__money"
            />
          </el-form-item>

          <el-form-item label="公积金托底">
            <el-switch v-model="store.insurance.housingFundClampEnabled" />
            <span class="inline-tip">
              公积金基数上下限 {{ formatMoney(housingFundRange.lower) }} ~
              {{ formatMoney(housingFundRange.upper) }}，缴费额按元取整
            </span>
          </el-form-item>
        </div>
      </div>

      <el-form-item label="大病医疗">
        <el-input-number
          v-model="store.insurance.medicalFixed"
          :min="0"
          :step="1"
          :precision="0"
          controls-position="right"
          class="insurance-editor__money"
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


    <div class="rate-panel">
      <div class="rate-panel__head">
        <div class="rate-panel__heading">
          <h3 class="rate-panel__title">缴费比例</h3>
          <p class="rate-panel__hint">
            {{ rateInputMode === 'amount'
              ? `按 ${sampleMonth} 月基数反推：输入个人 / 单位月缴金额，自动换算为比例并应用到全年各月`
              : `个人与单位比例可直接输入（回车或点击空白生效），月缴纳额按 ${sampleMonth} 月基数实时重算` }}
          </p>
        </div>
        <div class="rate-panel__actions">
          <el-radio-group v-model="rateInputMode" size="small">
            <el-radio-button value="percent">按比例</el-radio-button>
            <el-radio-button value="amount">按金额反推</el-radio-button>
          </el-radio-group>
          <el-button
            link
            type="primary"
            size="small"
            :disabled="overriddenCount === 0"
            @click="resetAllRates"
          >
            恢复城市默认
          </el-button>
        </div>
      </div>

      <div class="rate-panel__preset">
        <span class="rate-panel__preset-label">公积金比例（个人 / 单位同比例）</span>
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

      <p
        v-if="rateInputMode === 'amount' && reverseDisabled"
        class="rate-panel__note"
      >
        当前月份没有可计算的缴费基数（收入为 0 且未指定手动基数），暂时无法按金额反推
      </p>

      <div class="rate-list">
        <div
          v-for="type in visibleTypes"
          :key="type"
          class="rate-row"
          :class="{ 'is-off': !enabledOf(type) }"
        >
          <div class="rate-row__identity">
            <span class="rate-row__name">{{ INSURANCE_LABELS[type] }}</span>
            <span
              v-if="isOverridden(type)"
              class="rate-row__dot"
              title="已自定义比例"
            />
            <el-tag v-if="isMerged(type)" size="small" type="info" effect="plain">
              {{ type === 'largeMedical' ? '本市未单列' : '已并入医疗' }}
            </el-tag>
          </div>
          <el-switch
            :model-value="enabledOf(type)"
            size="small"
            @update:model-value="
              (value: boolean) => store.updateInsuranceItem(type, { enabled: value })
            "
          />
          <div class="rate-row__field">
            <span class="rate-row__side">个人</span>
            <template v-if="rateInputMode === 'percent'">
              <el-input-number
                class="rate-row__input"
                :model-value="percentOf(rateOf(type).personal)"
                :min="0"
                :max="100"
                :step="0.5"
                :precision="2"
                controls-position="right"
                @update:model-value="
                  (value: number | undefined) => setRate(type, 'personal', value ?? 0)
                "
              />
              <span class="rate-row__unit">%</span>
            </template>
            <template v-else>
              <el-input-number
                class="rate-row__input"
                :model-value="amountOf(type, 'personal')"
                :min="0"
                :step="10"
                :precision="2"
                :disabled="isMerged(type) || !baseOf(type)"
                controls-position="right"
                @update:model-value="
                  (value: number | undefined) => setAmount(type, 'personal', value ?? 0)
                "
              />
              <span class="rate-row__unit">元</span>
            </template>
          </div>
          <div class="rate-row__field">
            <span class="rate-row__side">单位</span>
            <template v-if="rateInputMode === 'percent'">
              <el-input-number
                class="rate-row__input"
                :model-value="percentOf(rateOf(type).company)"
                :min="0"
                :max="100"
                :step="0.5"
                :precision="2"
                controls-position="right"
                @update:model-value="
                  (value: number | undefined) => setRate(type, 'company', value ?? 0)
                "
              />
              <span class="rate-row__unit">%</span>
            </template>
            <template v-else>
              <el-input-number
                class="rate-row__input"
                :model-value="amountOf(type, 'company')"
                :min="0"
                :step="10"
                :precision="2"
                :disabled="isMerged(type) || !baseOf(type)"
                controls-position="right"
                @update:model-value="
                  (value: number | undefined) => setAmount(type, 'company', value ?? 0)
                "
              />
              <span class="rate-row__unit">元</span>
            </template>
          </div>
          <div class="rate-row__amount">
            <template v-if="rateInputMode === 'percent'">
              <span>个人 <strong>¥{{ formatMoney(rateSample?.personal[type] ?? 0) }}</strong></span>
              <span>单位 <strong>¥{{ formatMoney(rateSample?.company[type] ?? 0) }}</strong></span>
            </template>
            <template v-else>
              <span>折合 <strong>≈ {{ percentOf(rateOf(type).personal).toFixed(2) }}%</strong></span>
              <span>折合 <strong>≈ {{ percentOf(rateOf(type).company).toFixed(2) }}%</strong></span>
            </template>
          </div>
          <div class="rate-row__reset">
            <el-button
              link
              type="primary"
              size="small"
              :disabled="!isOverridden(type)"
              @click="resetRate(type)"
            >
              复原
            </el-button>
          </div>
        </div>
      </div>

      <div class="rate-panel__foot">
        <span>{{ sampleMonth }} 月个人月缴合计 <strong>¥{{ formatMoney(rateSample?.personalTotal ?? 0) }}</strong></span>
        <span>单位月缴合计 <strong>¥{{ formatMoney(rateSample?.companyTotal ?? 0) }}</strong></span>
      </div>
    </div>

    <CityPolicyDrawer v-model="cityDrawerVisible" />
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

.insurance-editor__city {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.insurance-editor__money {
  width: 160px;
}

/* 宽屏时社保基数与公积金配置并排，缩短表单纵向长度 */
.insurance-form__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 24px;
}

@media (max-width: 1099px) {
  .insurance-form__columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

.inline-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.insurance-editor__tip :deep(.el-alert__title) {
  font-size: 12px;
}


/* 缴费比例面板：行式布局，比例输入与月缴纳额并排，直接可改 */
.rate-panel {
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.rate-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-line);
}

.rate-panel__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-ink-900);
}

.rate-panel__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--app-ink-500);
}

.rate-panel__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.rate-panel__note {
  margin: 0;
  padding: 0 14px 10px;
  font-size: 12px;
  color: var(--app-amber-700);
}

.rate-panel__preset {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--app-sunken);
  border-bottom: 1px solid var(--app-line);
}

.rate-panel__preset .el-button + .el-button {
  margin-left: 0;
}

.rate-panel__preset-label {
  margin-right: 4px;
  font-size: 12px;
  color: var(--app-ink-500);
}

.rate-list {
  display: flex;
  flex-direction: column;
}

.rate-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto 164px 164px minmax(150px, auto) auto;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--app-line);
  transition: background-color 0.15s ease;
}

.rate-row:last-child {
  border-bottom: none;
}

.rate-row:hover {
  background: var(--app-sunken);
}

.rate-row.is-off .rate-row__field,
.rate-row.is-off .rate-row__amount {
  opacity: 0.45;
}

.rate-row__identity {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.rate-row__name {
  overflow: hidden;
  font-size: 13px;
  color: var(--app-ink-700);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rate-row__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-jade-600);
}

.rate-row__field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rate-row__side {
  font-size: 12px;
  color: var(--app-ink-300);
}

.rate-row__input {
  width: 104px;
}

.rate-row__unit {
  font-size: 12px;
  color: var(--app-ink-300);
}

.rate-row__amount {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--app-ink-500);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.rate-row__amount strong {
  color: var(--app-ink-900);
  font-weight: 600;
}

.rate-row__reset {
  text-align: right;
}

.rate-panel__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--app-sunken);
  font-size: 13px;
  color: var(--app-ink-500);
}

.rate-panel__foot strong {
  margin-left: 4px;
  font-size: 15px;
  color: var(--app-jade-700);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1366px) {
  .rate-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    grid-template-areas:
      'identity identity switch'
      'personal company company'
      'amount amount reset';
    gap: 8px 12px;
  }

  .rate-row__identity {
    grid-area: identity;
  }

  .rate-row > .el-switch {
    grid-area: switch;
    justify-self: end;
  }

  .rate-row__field:nth-child(3) {
    grid-area: personal;
  }

  .rate-row__field:nth-child(4) {
    grid-area: company;
  }

  .rate-row__amount {
    grid-area: amount;
    flex-direction: row;
    gap: 12px;
    text-align: left;
  }

  .rate-row__reset {
    grid-area: reset;
  }
}
</style>
