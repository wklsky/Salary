<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/insurance/CityPolicyDrawer.vue
 * @Description: 城市社保政策面板：政策版本信息、自定义城市增删改与内置城市对照
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Select } from '@element-plus/icons-vue'
import { CITIES, DEFAULT_CITY } from '@/config/cities'
import {
  BONUS_SEPARATE_VALID_UNTIL,
  POLICY_DISCLAIMER,
  POLICY_EFFECTIVE_DATE,
  POLICY_VERSION,
} from '@/config/policy'
import { INSURANCE_LABELS } from '@/config/columns'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { formatMoney } from '@/utils/format'
import { INSURANCE_TYPES } from '@/types'
import type { CityPolicy, InsuranceType, RatePair } from '@/types'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:model-value': [value: boolean]
}>()

const settingsStore = useSettingsStore()
const salaryStore = useSalaryStore()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:model-value', value),
})

/** 自定义城市草稿：费率在表单里用百分比展示，保存时还原为 0-1 的比例 */
interface RateDraft {
  personal: number
  company: number
  enabled: boolean
}

interface CityDraft {
  code: string
  name: string
  baseLower: number
  baseUpper: number
  housingLower: number
  housingUpper: number
  medicalFixed: number
  referenceYear: number
  rates: Record<InsuranceType, RateDraft>
}

function createDraft(source: CityPolicy): CityDraft {
  const rates = {} as Record<InsuranceType, RateDraft>
  for (const type of INSURANCE_TYPES) {
    const pair = source.rates[type]
    rates[type] = {
      personal: pair ? round4(pair.personal * 100) : 0,
      company: pair ? round4(pair.company * 100) : 0,
      enabled: pair !== null,
    }
  }
  return {
    code: source.code,
    name: source.name,
    baseLower: source.base.lower,
    baseUpper: source.base.upper,
    housingLower: source.housingFundBase?.lower ?? source.base.lower,
    housingUpper: source.housingFundBase?.upper ?? source.base.upper,
    medicalFixed: source.medicalFixed ?? 0,
    referenceYear: source.referenceYear,
    rates,
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

const draft = ref<CityDraft | null>(null)
/** 正在编辑的自定义城市 code；新增时为空 */
const editingCode = ref<string>('')
/** 复制内置城市时选择的来源 code */
const templateCode = ref<string>('beijing')

const templateCity = computed(
  () => CITIES.find((item) => item.code === templateCode.value) ?? DEFAULT_CITY,
)

function startCreate() {
  editingCode.value = ''
  draft.value = createDraft(templateCity.value)
  draft.value.code = nextCustomCode()
  draft.value.name = `${templateCity.value.name}（自定义）`
}

function startEdit(city: CityPolicy) {
  editingCode.value = city.code
  draft.value = createDraft(city)
}

function nextCustomCode(): string {
  let index = 1
  while (settingsStore.customCities.some((item) => item.code === `custom_${index}`)) index += 1
  return `custom_${index}`
}

function cancelEdit() {
  draft.value = null
  editingCode.value = ''
}

function toPolicy(source: CityDraft): CityPolicy {
  const rates = {} as Record<InsuranceType, RatePair | null>
  for (const type of INSURANCE_TYPES) {
    const rate = source.rates[type]
    rates[type] = rate.enabled
      ? { personal: round4(rate.personal / 100), company: round4(rate.company / 100) }
      : null
  }
  return {
    code: source.code.trim(),
    name: source.name.trim(),
    base: { lower: source.baseLower, upper: source.baseUpper },
    housingFundBase: { lower: source.housingLower, upper: source.housingUpper },
    rates,
    medicalFixed: source.medicalFixed,
    referenceYear: source.referenceYear,
  }
}

function saveDraft() {
  if (!draft.value) return
  const city = toPolicy(draft.value)
  if (!city.name) {
    ElMessage.warning('请填写城市名称')
    return
  }
  if (!city.code) {
    ElMessage.warning('请填写城市标识')
    return
  }
  if (city.base.lower > city.base.upper) {
    ElMessage.warning('社保基数下限不能高于上限')
    return
  }
  if (city.housingFundBase && city.housingFundBase.lower > city.housingFundBase.upper) {
    ElMessage.warning('公积金基数下限不能高于上限')
    return
  }
  settingsStore.upsertCustomCity(city)
  ElMessage.success(`已保存城市「${city.name}」`)
  cancelEdit()
}

function useCity(city: CityPolicy) {
  salaryStore.updateInsurance({ cityCode: city.code })
  ElMessage.success(`已切换为「${city.name}」政策`)
}

async function removeCity(city: CityPolicy) {
  try {
    await ElMessageBox.confirm(
      `删除自定义城市「${city.name}」？删除后该城市的录入会回落到内置或默认政策。`,
      '删除城市',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  settingsStore.removeCustomCity(city.code)
  if (salaryStore.insurance.cityCode === city.code) {
    salaryStore.updateInsurance({ cityCode: DEFAULT_CITY.code })
  }
  if (editingCode.value === city.code) cancelEdit()
  ElMessage.success('已删除')
}

/** 切到内置城市模板时，若正处在新增模式则同步刷新草稿 */
watch(templateCode, () => {
  if (draft.value && !editingCode.value) {
    const next = createDraft(templateCity.value)
    next.code = draft.value.code
    draft.value = next
  }
})

function rateLabel(type: InsuranceType): string {
  return INSURANCE_LABELS[type]
}

/** 政策信息面板字段 */
const policyMeta = [
  { label: '政策版本', value: POLICY_VERSION },
  { label: '生效日期', value: POLICY_EFFECTIVE_DATE },
  { label: '年终奖单独计税截止', value: BONUS_SEPARATE_VALID_UNTIL },
]
</script>

<template>
  <el-drawer v-model="visible" title="城市社保政策" size="600px" class="city-drawer">
    <section class="city-drawer__body">
      <div class="city-drawer__policy">
        <div class="policy-meta">
          <span v-for="item in policyMeta" :key="item.label" class="policy-meta__item">
            {{ item.label }} <strong>{{ item.value }}</strong>
          </span>
        </div>
        <p class="policy-note">{{ POLICY_DISCLAIMER }}</p>
      </div>

      <div class="city-drawer__section">
        <header class="city-drawer__header">
          <h3>自定义城市</h3>
          <el-button size="small" type="primary" plain :icon="Plus" @click="startCreate">
            新建
          </el-button>
        </header>

        <el-empty
          v-if="!settingsStore.customCities.length && !draft"
          description="还没有自定义城市，可从内置城市复制后微调比例"
          :image-size="60"
        />

        <article
          v-for="city in settingsStore.customCities"
          :key="city.code"
          class="city-card"
        >
          <div class="city-card__head">
            <strong>{{ city.name }}</strong>
            <span class="city-card__code">{{ city.code }}</span>
            <span v-if="salaryStore.insurance.cityCode === city.code" class="city-card__active">
              当前使用
            </span>
          </div>
          <p class="city-card__line">
            社保基数 {{ formatMoney(city.base.lower) }} ~ {{ formatMoney(city.base.upper) }}
            <template v-if="city.housingFundBase">
              · 公积金 {{ formatMoney(city.housingFundBase.lower) }} ~
              {{ formatMoney(city.housingFundBase.upper) }}
            </template>
            · {{ city.referenceYear }} 年参考
          </p>
          <p class="city-card__line">
            <span v-for="type in INSURANCE_TYPES" :key="type" class="city-card__rate">
              {{ rateLabel(type) }}
              <template v-if="city.rates[type]">
                {{ Math.round((city.rates[type]?.personal ?? 0) * 10000) / 100 }}% /
                {{ Math.round((city.rates[type]?.company ?? 0) * 10000) / 100 }}%
              </template>
              <template v-else>并入医疗</template>
            </span>
          </p>
          <footer class="city-card__ops">
            <el-button
              size="small"
              type="primary"
              plain
              :icon="Select"
              :disabled="salaryStore.insurance.cityCode === city.code"
              @click="useCity(city)"
            >
              选用
            </el-button>
            <el-button size="small" text :icon="Edit" @click="startEdit(city)">编辑</el-button>
            <el-button
              size="small"
              text
              type="danger"
              :icon="Delete"
              @click="removeCity(city)"
            >
              删除
            </el-button>
          </footer>
        </article>

        <div v-if="draft" class="city-form">
          <header class="city-form__head">
            <h4>{{ editingCode ? '编辑城市' : '新建城市' }}</h4>
            <div v-if="!editingCode" class="city-form__template">
              <span>以内置城市为模板</span>
              <el-select v-model="templateCode" size="small" style="width: 130px">
                <el-option
                  v-for="item in CITIES"
                  :key="item.code"
                  :label="item.name"
                  :value="item.code"
                />
              </el-select>
            </div>
          </header>

          <el-form label-width="88px" size="small" class="city-form__form">
            <div class="city-form__grid">
              <el-form-item label="城市名称">
                <el-input v-model="draft.name" placeholder="如：深圳（自定义）" />
              </el-form-item>
              <el-form-item label="城市标识">
                <el-input v-model="draft.code" :disabled="!!editingCode" placeholder="custom_1" />
              </el-form-item>
              <el-form-item label="社保下限">
                <el-input-number
                  v-model="draft.baseLower"
                  :min="0"
                  :step="100"
                  :precision="0"
                  controls-position="right"
                  class="city-form__money"
                />
              </el-form-item>
              <el-form-item label="社保上限">
                <el-input-number
                  v-model="draft.baseUpper"
                  :min="0"
                  :step="100"
                  :precision="0"
                  controls-position="right"
                  class="city-form__money"
                />
              </el-form-item>
              <el-form-item label="公积金下限">
                <el-input-number
                  v-model="draft.housingLower"
                  :min="0"
                  :step="100"
                  :precision="0"
                  controls-position="right"
                  class="city-form__money"
                />
              </el-form-item>
              <el-form-item label="公积金上限">
                <el-input-number
                  v-model="draft.housingUpper"
                  :min="0"
                  :step="100"
                  :precision="0"
                  controls-position="right"
                  class="city-form__money"
                />
              </el-form-item>
              <el-form-item label="大病月缴">
                <el-input-number
                  v-model="draft.medicalFixed"
                  :min="0"
                  :step="1"
                  :precision="2"
                  controls-position="right"
                  class="city-form__money"
                />
              </el-form-item>
              <el-form-item label="参考年份">
                <el-input-number
                  v-model="draft.referenceYear"
                  :min="2000"
                  :max="2099"
                  :step="1"
                  :precision="0"
                  controls-position="right"
                  class="city-form__money"
                />
              </el-form-item>
            </div>

            <el-table :data="INSURANCE_TYPES" size="small" border class="city-form__rates">
              <el-table-column label="险种" width="110">
                <template #default="{ row }">{{ rateLabel(row as InsuranceType) }}</template>
              </el-table-column>
              <el-table-column label="征收" width="70" align="center">
                <template #default="{ row }">
                  <el-switch v-model="draft.rates[row as InsuranceType].enabled" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="个人 %" width="110" align="center">
                <template #default="{ row }">
                  <el-input-number
                    v-model="draft.rates[row as InsuranceType].personal"
                    :min="0"
                    :max="100"
                    :step="0.5"
                    :precision="2"
                    :disabled="!draft.rates[row as InsuranceType].enabled"
                    size="small"
                    controls-position="right"
                  />
                </template>
              </el-table-column>
              <el-table-column label="单位 %" width="110" align="center">
                <template #default="{ row }">
                  <el-input-number
                    v-model="draft.rates[row as InsuranceType].company"
                    :min="0"
                    :max="100"
                    :step="0.5"
                    :precision="2"
                    :disabled="!draft.rates[row as InsuranceType].enabled"
                    size="small"
                    controls-position="right"
                  />
                </template>
              </el-table-column>
              <el-table-column label="说明" min-width="120">
                <template #default="{ row }">
                  <span v-if="!draft.rates[row as InsuranceType].enabled" class="city-form__muted">
                    该险种并入医疗，不单独征收
                  </span>
                </template>
              </el-table-column>
            </el-table>

            <div class="city-form__ops">
              <el-button size="small" @click="cancelEdit">取消</el-button>
              <el-button size="small" type="primary" @click="saveDraft">保存城市</el-button>
            </div>
          </el-form>
        </div>
      </div>

      <div class="city-drawer__section">
        <header class="city-drawer__header">
          <h3>内置城市</h3>
          <span class="city-drawer__hint">共 {{ CITIES.length }} 个，参考 2025 年口径</span>
        </header>
        <el-table :data="CITIES" size="small" border max-height="240" class="city-form__rates">
          <el-table-column prop="name" label="城市" width="100" />
          <el-table-column label="社保基数" min-width="140">
            <template #default="{ row }">
              {{ formatMoney(row.base.lower) }} ~ {{ formatMoney(row.base.upper) }}
            </template>
          </el-table-column>
          <el-table-column label="公积金基数" min-width="140">
            <template #default="{ row }">
              {{ formatMoney((row.housingFundBase ?? row.base).lower) }} ~
              {{ formatMoney((row.housingFundBase ?? row.base).upper) }}
            </template>
          </el-table-column>
          <el-table-column prop="referenceYear" label="参考年" width="80" align="center" />
        </el-table>
      </div>
    </section>
  </el-drawer>
</template>

<style scoped>
.city-drawer__body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.city-drawer__policy {
  padding: 12px 14px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  background: var(--app-sunken);
}

.policy-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: var(--app-text-sm);
  color: var(--app-ink-500);
}

.policy-meta strong {
  color: var(--app-ink-700);
  font-family: var(--app-font-num);
}

.policy-note {
  margin: 8px 0 0;
  font-size: var(--app-text-xs);
  line-height: 1.6;
  color: var(--app-ink-500);
}

.city-drawer__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.city-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.city-drawer__header h3 {
  margin: 0;
  font-size: var(--app-text-md);
  font-weight: 600;
  color: var(--app-ink-900);
}

.city-drawer__hint {
  font-size: var(--app-text-xs);
  color: var(--app-ink-300);
}

.city-card {
  padding: 10px 12px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-md);
  background: var(--app-surface);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.city-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.city-card__head strong {
  font-size: var(--app-text-base);
  color: var(--app-ink-900);
}

.city-card__code {
  font-family: var(--app-font-num);
  font-size: var(--app-text-xs);
  color: var(--app-ink-300);
}

.city-card__active {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--app-jade-100);
  color: var(--app-jade-700);
  font-size: var(--app-text-xs);
}

.city-card__line {
  margin: 0;
  font-size: var(--app-text-sm);
  line-height: 1.7;
  color: var(--app-ink-500);
}

.city-card__rate {
  display: inline-block;
  margin-right: 12px;
}

.city-card__ops {
  display: flex;
  gap: 4px;
}

.city-form {
  padding: 12px;
  border: 1px solid var(--app-jade-100);
  border-radius: var(--app-radius-md);
  background: linear-gradient(160deg, var(--app-jade-100), var(--app-surface) 60%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.city-form__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.city-form__head h4 {
  margin: 0;
  font-size: var(--app-text-base);
  font-weight: 600;
  color: var(--app-jade-700);
}

.city-form__template {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--app-text-xs);
  color: var(--app-ink-500);
}

.city-form__form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.city-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.city-form__money {
  width: 100%;
}

.city-form__rates {
  margin-top: 4px;
}

.city-form__muted {
  font-size: var(--app-text-xs);
  color: var(--app-ink-300);
}

.city-form__ops {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

@media (max-width: 640px) {
  .city-form__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
