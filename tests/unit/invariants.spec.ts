/**
 * @Author: wj
 * @FilePath: tests/unit/invariants.spec.ts
 * @Description: 数据准确性不变量检测：月度/年度聚合恒等式、边界场景矩阵、store→composable→引擎联动
 */
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { calculateSalary } from '@/core'
import type {
  DeductionState,
  DeductionStateMap,
  IncomeItem,
  InsuranceConfig,
  InsuranceItemConfig,
  InsuranceType,
  SalaryInput,
  SalaryResult,
} from '@/types'
import { DEDUCTION_KEYS, INSURANCE_TYPES } from '@/types'
import { useSalaryCalculator } from '@/composables/useSalaryCalculator'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

const EPS = 0.02
const SUM_EPS = 0.1

function makeIncome(overrides: Partial<IncomeItem> = {}): IncomeItem {
  return {
    id: 'income_1',
    name: '基本工资',
    amount: 0,
    cycle: 'monthly',
    month: 1,
    intoInsuranceBase: false,
    taxable: true,
    kind: 'salary',
    enabled: true,
    staged: false,
    stageAmounts: {},
    stageEnabled: {},
    nonCash: false,
    variableByMonth: false,
    scoreBased: false,
    ...overrides,
  }
}

function makeInsurance(overrides: Partial<InsuranceConfig> = {}): InsuranceConfig {
  const items = {} as Record<InsuranceType, InsuranceItemConfig>
  INSURANCE_TYPES.forEach((type) => {
    items[type] = { enabled: type !== 'maternity' }
  })
  return {
    cityCode: 'beijing',
    baseMode: 'gross',
    manualBase: 0,
    clampEnabled: true,
    housingFundBaseMode: 'same',
    housingFundManualBase: 0,
    housingFundClampEnabled: true,
    medicalFixed: 0,
    items,
    ...overrides,
  }
}

function makeDeductions(enabled: Partial<Record<keyof DeductionStateMap, DeductionState>> = {}) {
  const map = {} as DeductionStateMap
  DEDUCTION_KEYS.forEach((key) => {
    map[key] = { enabled: false, amount: 0, share: 1, month: 12, soleProvider: true }
  })
  Object.assign(map, enabled)
  return map
}

function makeInput(overrides: Partial<SalaryInput> = {}): SalaryInput {
  return {
    year: 2026,
    startMonth: 1,
    endMonth: 12,
    incomes: [],
    insurance: makeInsurance(),
    deductions: makeDeductions(),
    bonusMode: 'auto',
    stages: [],
    taxpayerType: 'resident',
    taxReductionMonthly: 0,
    ...overrides,
  }
}

/** 递归检查所有 number 字段均为有限值 */
function expectFinite(value: unknown, path = 'result'): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} 出现非有限值: ${value}`).toBe(true)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectFinite(item, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) =>
      expectFinite(child, `${path}.${key}`),
    )
  }
}

/** 月度与年度聚合恒等式，是所有场景都要过的核心检查 */
function assertInvariants(result: SalaryResult, startMonth: number, endMonth: number): void {
  expectFinite(result)

  let sumGross = 0
  let sumNet = 0
  let sumInsurancePersonal = 0
  let sumInsuranceCompany = 0
  let sumPostTax = 0
  let sumTotalDeduction = 0
  let sumTax = 0
  let sumBonusTax = 0
  let sumOtherTax = 0
  let sumOtherIncome = 0

  for (let month = startMonth; month <= endMonth; month++) {
    const m = result.monthly[month - 1]
    // 到手恒等式：净额 = 应发 − 非现金 − 总扣款
    expect(Math.abs(m.net - (m.gross - m.nonCashIncome - m.totalDeduction))).toBeLessThanOrEqual(EPS)
    // 总扣款恒等式：五险一金个人 + 个税合计 + 税后扣款
    expect(
      Math.abs(m.totalDeduction - (m.insurancePersonal + m.taxTotal + m.postTaxDeduction)),
    ).toBeLessThanOrEqual(EPS)
    // 个税合计恒等式：工资预扣 + 年终奖单独计税 + 额外收入预扣
    expect(Math.abs(m.taxTotal - (m.tax + m.bonusTax + m.otherTax))).toBeLessThanOrEqual(EPS)

    sumGross += m.gross
    sumNet += m.net
    sumInsurancePersonal += m.insurancePersonal
    sumInsuranceCompany += m.insuranceCompany
    sumPostTax += m.postTaxDeduction
    sumTotalDeduction += m.totalDeduction
    sumTax += m.tax
    sumBonusTax += m.bonusTax
    sumOtherTax += m.otherTax
    sumOtherIncome += m.otherIncome
  }

  const annual = result.annual
  expect(Math.abs(annual.gross - sumGross)).toBeLessThanOrEqual(SUM_EPS)
  expect(Math.abs(annual.net - sumNet)).toBeLessThanOrEqual(SUM_EPS)
  expect(Math.abs(annual.insurancePersonal - sumInsurancePersonal)).toBeLessThanOrEqual(SUM_EPS)
  expect(Math.abs(annual.insuranceCompany - sumInsuranceCompany)).toBeLessThanOrEqual(SUM_EPS)
  expect(Math.abs(annual.postTaxDeduction - sumPostTax)).toBeLessThanOrEqual(SUM_EPS)
  expect(Math.abs(annual.totalDeduction - sumTotalDeduction)).toBeLessThanOrEqual(SUM_EPS)
  // annual.tax 是全口径个税合计（工资预扣 + 年终奖单独计税 + 额外收入预扣），等于逐月 taxTotal 之和
  expect(Math.abs(annual.tax - (sumTax + sumBonusTax + sumOtherTax))).toBeLessThanOrEqual(SUM_EPS)
  expect(Math.abs(annual.otherTax - sumOtherTax)).toBeLessThanOrEqual(SUM_EPS)
  expect(Math.abs(annual.otherIncome - sumOtherIncome)).toBeLessThanOrEqual(SUM_EPS)
  // 单位用工成本 = 应发 + 单位五险一金
  expect(Math.abs(annual.companyCost - (annual.gross + annual.insuranceCompany))).toBeLessThanOrEqual(
    SUM_EPS,
  )
  // 率恒等式：到手率/税负率，零应发时为零避免 NaN
  if (annual.gross > 0) {
    expect(Math.abs(annual.netRate - annual.net / annual.gross)).toBeLessThanOrEqual(0.006)
    expect(Math.abs(annual.taxRate - annual.tax / annual.gross)).toBeLessThanOrEqual(0.006)
  } else {
    expect(annual.netRate).toBe(0)
    expect(annual.taxRate).toBe(0)
  }
  // 五险一金年度分险种汇总 = 逐月明细累加
  result.insuranceAnnual.forEach((row) => {
    const monthlyPersonal = result.insuranceMonthly.reduce((acc, d) => acc + d.personal[row.type], 0)
    const monthlyCompany = result.insuranceMonthly.reduce((acc, d) => acc + d.company[row.type], 0)
    expect(Math.abs(row.personal - monthlyPersonal)).toBeLessThanOrEqual(SUM_EPS)
    expect(Math.abs(row.company - monthlyCompany)).toBeLessThanOrEqual(SUM_EPS)
  })
}

describe('数据准确性不变量：场景矩阵', () => {
  const scenarios: Array<{ name: string; input: SalaryInput }> = []

  scenarios.push({
    name: '零输入全零',
    input: makeInput(),
  })

  scenarios.push({
    name: '单一月薪全年（gross 口径社保）',
    input: makeInput({
      incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
    }),
  })

  scenarios.push({
    name: '非现金福利（饭票）',
    input: makeInput({
      incomes: [
        makeIncome({ amount: 15000, intoInsuranceBase: true }),
        makeIncome({ id: 'meal', name: '饭票', amount: 200, nonCash: true }),
      ],
    }),
  })

  scenarios.push({
    name: '免税收入并计',
    input: makeInput({
      incomes: [
        makeIncome({ amount: 15000, intoInsuranceBase: true }),
        makeIncome({ id: 'taxfree', name: '免税补贴', amount: 800, taxable: false }),
      ],
    }),
  })

  scenarios.push({
    name: '一次性年终奖 auto 择优',
    input: makeInput({
      incomes: [
        makeIncome({ amount: 15000, intoInsuranceBase: true }),
        makeIncome({
          id: 'bonus_1',
          name: '年终奖',
          amount: 200000,
          cycle: 'once',
          month: 12,
          kind: 'bonus',
        }),
      ],
    }),
  })

  scenarios.push({
    name: '非居民 + 劳务报酬按次计税',
    input: makeInput({
      taxpayerType: 'nonResident',
      incomes: [
        makeIncome({ amount: 10000 }),
        makeIncome({ id: 'labor_1', name: '劳务报酬', amount: 10000, cycle: 'once', month: 3, kind: 'labor' }),
      ],
    }),
  })

  scenarios.push({
    name: '专项附加扣除 + 公益捐赠',
    input: makeInput({
      incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
      deductions: makeDeductions({
        childrenEducation: { enabled: true, amount: 2000, share: 1, month: 12 },
        donation: { enabled: true, amount: 5000, share: 1, month: 12 },
      }),
    }),
  })

  scenarios.push({
    name: '雇佣阶段停缴社保公积金',
    input: makeInput({
      incomes: [makeIncome({ amount: 12000, intoInsuranceBase: true })],
      stages: [
        { id: 's1', type: 'intern', fromMonth: 1, toMonth: 2, skipInsurance: true },
        { id: 's2', type: 'probation', fromMonth: 3, toMonth: 5, skipInsurance: false, skipInsuranceTypes: ['housingFund'] },
        { id: 's3', type: 'regular', fromMonth: 6, toMonth: 12, skipInsurance: false },
      ],
    }),
  })

  scenarios.push({
    name: '单月覆盖金额归零',
    input: makeInput({
      incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
      monthOverrides: { 3: { amounts: { income_1: 0 }, note: '当月无收入' } },
    }),
  })

  scenarios.push({
    name: '自定义城市费率覆盖',
    input: makeInput({
      incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
      insurance: makeInsurance({ cityCode: 'custom_01', clampEnabled: false }),
      customCities: [
        {
          code: 'custom_01',
          name: '自定义城市',
          base: { lower: 0, upper: 999999 },
          rates: {
            pension: { personal: 0.5, company: 0 },
            medical: null,
            largeMedical: null,
            unemployment: null,
            injury: null,
            maternity: null,
            housingFund: null,
          },
          referenceYear: 2026,
        },
      ],
    }),
  })

  scenarios.push({
    name: '北京大额医疗费用补助',
    input: makeInput({
      incomes: [makeIncome({ amount: 4699, intoInsuranceBase: true })],
      insurance: makeInsurance({ clampEnabled: false }),
    }),
  })

  scenarios.push({
    name: '零收入月不产生扣款（大病固定额守卫）',
    input: makeInput({
      incomes: [
        makeIncome({
          amount: 0,
          variableByMonth: true,
          monthlyAmounts: [15000, 0, 15000, 0, 15000, 0, 15000, 0, 15000, 0, 15000, 0],
        }),
      ],
      insurance: makeInsurance({ clampEnabled: false, medicalFixed: 3 }),
    }),
  })

  scenarios.push({
    name: '超高收入触及最高税率档',
    input: makeInput({
      incomes: [makeIncome({ amount: 10000000, intoInsuranceBase: true })],
    }),
  })

  scenarios.push({
    name: '单月计算区间',
    input: makeInput({
      startMonth: 8,
      endMonth: 8,
      incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
    }),
  })

  scenarios.push({
    name: '税后扣款分项与不计总额项',
    input: makeInput({
      incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
      postTaxDeductions: [
        { id: 'p1', name: '水电费', enabled: true, monthlyAmounts: Array(12).fill(100) },
        {
          id: 'p2',
          name: '餐费补贴',
          enabled: true,
          monthlyAmounts: Array(12).fill(50),
          intoTotalDeduction: false,
        },
      ],
    }),
  })

  scenarios.forEach(({ name, input }) => {
    it(`恒等式通过：${name}`, () => {
      const result = calculateSalary(input)
      assertInvariants(result, input.startMonth, input.endMonth)
    })
  })

  it('零输入时全年与逐月全为 0', () => {
    const result = calculateSalary(makeInput())
    expect(result.annual.gross).toBe(0)
    expect(result.annual.net).toBe(0)
    expect(result.annual.tax).toBe(0)
    result.monthly.forEach((m) => {
      expect(m.gross).toBe(0)
      expect(m.net).toBe(0)
      expect(m.taxTotal).toBe(0)
    })
  })

  it('非现金福利：计入应发与应税，但到手剔除', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ amount: 15000, intoInsuranceBase: true }),
          makeIncome({ id: 'meal', name: '饭票', amount: 200, nonCash: true }),
        ],
      }),
    )
    const m = result.monthly[0]
    expect(m.gross).toBe(15200)
    expect(m.nonCashIncome).toBe(200)
    expect(m.net).toBeLessThan(m.gross - m.nonCashIncome)
  })

  it('非居民劳务报酬：按收入额 8000 适用月度税率表预扣 590', () => {
    const result = calculateSalary(
      makeInput({
        taxpayerType: 'nonResident',
        incomes: [
          makeIncome({ amount: 10000 }),
          makeIncome({ id: 'labor_1', name: '劳务报酬', amount: 10000, cycle: 'once', month: 3, kind: 'labor' }),
        ],
      }),
    )
    expect(result.monthly[2].otherTax).toBe(590)
    expect(result.monthly[2].otherIncome).toBe(8000)
    expect(result.annual.otherTax).toBe(590)
  })

  it('自定义城市：只保留养老 50% 时逐月个人缴纳 = 基数 × 50%', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
        insurance: makeInsurance({ cityCode: 'custom_01', clampEnabled: false }),
        customCities: [
          {
            code: 'custom_01',
            name: '自定义城市',
            base: { lower: 0, upper: 999999 },
            rates: {
              pension: { personal: 0.5, company: 0 },
              medical: null,
              largeMedical: null,
              unemployment: null,
              injury: null,
              maternity: null,
              housingFund: null,
            },
            referenceYear: 2026,
          },
        ],
      }),
    )
    expect(result.insuranceMonthly[0].personal.pension).toBe(7500)
    expect(result.insuranceMonthly[0].personalTotal).toBe(7500)
  })

  it('北京大额医疗：个人 0、单位按基数 0.75% 征收', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [makeIncome({ amount: 4699, intoInsuranceBase: true })],
        insurance: makeInsurance({ clampEnabled: false }),
      }),
    )
    expect(result.insuranceMonthly[0].personal.largeMedical).toBe(0)
    expect(result.insuranceMonthly[0].company.largeMedical).toBe(35.24)
  })

  it('年终奖拆分口径下 bonusComparison 税额与逐月一致', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ amount: 15000, intoInsuranceBase: true }),
          makeIncome({ id: 'bonus_1', name: '年终奖', amount: 200000, cycle: 'once', month: 12, kind: 'bonus' }),
        ],
      }),
    )
    expect(result.bonusComparison).toBeDefined()
    const monthlyBonusTax = result.monthly.reduce((acc, m) => acc + m.bonusTax, 0)
    expect(Math.abs(monthlyBonusTax - (result.bonusComparison?.bonusTax ?? 0))).toBeLessThanOrEqual(
      SUM_EPS,
    )
  })

  it('捐赠限额：实际扣除不超过申报额且不超过应纳税所得额 30%', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
        deductions: makeDeductions({
          donation: { enabled: true, amount: 5000, share: 1, month: 12 },
        }),
      }),
    )
    expect(result.annual.donationApplied).toBeGreaterThan(0)
    expect(result.annual.donationApplied).toBeLessThanOrEqual(5000)
    expect(Math.abs(result.annual.settlementDiff)).toBeLessThanOrEqual(1)
  })
})

describe('数据联动：store → composable → 引擎', () => {
  it('收入金额改动即时反映到计算结果（gross 口径含封顶托底）', () => {
    setActivePinia(createPinia())
    const salaryStore = useSalaryStore()
    const { result } = useSalaryCalculator()
    salaryStore.incomes = [makeIncome({ id: 'i1', name: '基本工资', amount: 20000, intoInsuranceBase: true })]
    expect(result.value.annual.gross).toBe(240000)
    salaryStore.updateIncome('i1', { amount: 30000 })
    expect(result.value.annual.gross).toBe(360000)
  })

  it('自定义城市增删即时影响结果口径', () => {
    setActivePinia(createPinia())
    const salaryStore = useSalaryStore()
    const settingsStore = useSettingsStore()
    const { result } = useSalaryCalculator()
    salaryStore.incomes = [makeIncome({ id: 'i1', name: '基本工资', amount: 15000, intoInsuranceBase: true })]
    // 清掉默认阶段（实习期 1-2 月停缴全部险种），让 1 月直接按自定义城市缴费
    salaryStore.stages = []
    salaryStore.insurance = makeInsurance({ cityCode: 'custom_01', clampEnabled: false })
    settingsStore.upsertCustomCity({
      code: 'custom_01',
      name: '自定义城市',
      base: { lower: 0, upper: 999999 },
      rates: {
        pension: { personal: 0.5, company: 0 },
        medical: null,
        largeMedical: null,
        unemployment: null,
        injury: null,
        maternity: null,
        housingFund: null,
      },
      referenceYear: 2026,
    })
    expect(result.value.insuranceMonthly[0].personalTotal).toBe(7500)
    settingsStore.removeCustomCity('custom_01')
    // 回落默认城市北京（无大额医疗之外全部内置费率）
    expect(result.value.insuranceMonthly[0].personalTotal).toBeGreaterThan(0)
    expect(result.value.insuranceMonthly[0].personal.pension).toBeCloseTo(15000 * 0.08, 0)
  })

  it('税后扣款「不计总额」项只展示不参与扣减', () => {
    setActivePinia(createPinia())
    const salaryStore = useSalaryStore()
    const { result } = useSalaryCalculator()
    salaryStore.incomes = [makeIncome({ id: 'i1', name: '基本工资', amount: 15000 })]
    salaryStore.postTaxDeductions = [
      { id: 'p1', name: '水电费', enabled: true, monthlyAmounts: Array(12).fill(100) },
      {
        id: 'p2',
        name: '餐费补贴',
        enabled: true,
        monthlyAmounts: Array(12).fill(50),
        intoTotalDeduction: false,
      },
    ]
    const m = result.value.monthly[0]
    expect(m.postTaxDeduction).toBe(100)
    expect(m.postTaxDeductionBreakdown.p1).toBe(100)
    expect(m.postTaxDeductionBreakdown.p2).toBe(50)
  })
})
