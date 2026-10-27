/**
 * @Author: wj
 * @FilePath: tests/unit/core.spec.ts
 * @Description: 计算内核单元测试：覆盖基数上下限、累计预扣、年终奖临界点与边界值
 */
import { describe, expect, it } from 'vitest'
import {
  amountOfStage,
  bonusTaxSeparate,
  calculateSalary,
  computeInsuranceMonthly,
  findInvalidRange,
  isItemEnabledInStage,
  otherIncomeAmount,
  otherIncomeTax,
  otherIncomeTaxable,
  skippedInsuranceTypesOfMonth,
} from '@/core'
import { createDefaultStages, validateStages } from '@/config/stages'
import { DEDUCTION_KEYS } from '@/types'
import type {
  DeductionKey,
  DeductionStateMap,
  IncomeItem,
  InsuranceConfig,
  InsuranceItemConfig,
  InsuranceType,
  SalaryInput,
  StageRange,
} from '@/types'
import { INSURANCE_TYPES } from '@/types'

function makeIncome(overrides: Partial<IncomeItem> = {}): IncomeItem {
  return {
    id: overrides.id ?? 'income_1',
    name: overrides.name ?? '基本工资',
    amount: overrides.amount ?? 15000,
    cycle: overrides.cycle ?? 'monthly',
    month: overrides.month ?? 1,
    intoInsuranceBase: overrides.intoInsuranceBase ?? false,
    taxable: overrides.taxable ?? true,
    kind: overrides.kind ?? 'salary',
    enabled: overrides.enabled ?? true,
    staged: overrides.staged ?? false,
    stageAmounts: overrides.stageAmounts ?? {},
    stageEnabled: overrides.stageEnabled ?? {},
    nonCash: overrides.nonCash ?? false,
    variableByMonth: overrides.variableByMonth ?? false,
    monthlyAmounts: overrides.monthlyAmounts,
  }
}

function makeDeductions(): DeductionStateMap {
  return DEDUCTION_KEYS.reduce((acc, key) => {
    acc[key as DeductionKey] = { enabled: false, amount: 0, share: 1, month: 12 }
    return acc
  }, {} as DeductionStateMap)
}

function makeInsurance(overrides: Partial<InsuranceConfig> = {}): InsuranceConfig {
  const items = INSURANCE_TYPES.reduce((acc, type) => {
    acc[type as InsuranceType] = { enabled: false } satisfies InsuranceItemConfig
    return acc
  }, {} as Record<InsuranceType, InsuranceItemConfig>)

  return {
    cityCode: overrides.cityCode ?? 'beijing',
    baseMode: overrides.baseMode ?? 'gross',
    manualBase: overrides.manualBase ?? 0,
    clampEnabled: overrides.clampEnabled ?? true,
    housingFundBaseMode: overrides.housingFundBaseMode ?? 'same',
    housingFundManualBase: overrides.housingFundManualBase ?? 0,
    housingFundClampEnabled: overrides.housingFundClampEnabled ?? true,
    medicalFixed: overrides.medicalFixed ?? 0,
    items: overrides.items ?? items,
  }
}

/** 测试夹具默认不启用任何险种，需要校验缴纳额时显式全量开启 */
function allItemsEnabled(): Record<InsuranceType, InsuranceItemConfig> {
  return INSURANCE_TYPES.reduce<Record<InsuranceType, InsuranceItemConfig>>((acc, type) => {
    acc[type] = { enabled: true }
    return acc
  }, {} as Record<InsuranceType, InsuranceItemConfig>)
}

function makeInput(overrides: Partial<SalaryInput> = {}): SalaryInput {
  return {
    year: 2026,
    startMonth: 1,
    endMonth: 12,
    incomes: [makeIncome()],
    insurance: makeInsurance(),
    deductions: makeDeductions(),
    bonusMode: 'auto',
    // 默认不划分阶段，保证既有用例仍按单一口径计算
    stages: [],
    taxpayerType: 'resident',
    taxReductionMonthly: 0,
    ...overrides,
  }
}

/** 构造阶段区间；未传 skipInsurance 时默认缴纳社保 */
function makeStage(
  type: StageRange['type'],
  fromMonth: number,
  toMonth: number,
  skipInsurance = false,
  skipInsuranceTypes: InsuranceType[] = [],
): StageRange {
  return { id: `stage_${type}_${fromMonth}`, type, fromMonth, toMonth, skipInsurance, skipInsuranceTypes }
}

describe('五险一金缴费基数', () => {
  it('收入低于下限时按下限托底', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 3000, intoInsuranceBase: true })],
      insurance: makeInsurance(),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.base).toBe(6821)
  })

  it('收入高于上限时按上限封顶', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 80000, intoInsuranceBase: true })],
      insurance: makeInsurance(),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.base).toBe(35283)
  })

  it('关闭封顶托底后按实际基数缴纳', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 80000, intoInsuranceBase: true })],
      insurance: makeInsurance({ clampEnabled: false }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.base).toBe(80000)
  })

  it('入职前的月份不产生缴纳记录', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 20000, intoInsuranceBase: true })],
      insurance: makeInsurance(),
      startMonth: 7,
      endMonth: 12,
      stages: [],
    })
    expect(detail.slice(0, 6).every((item) => item.personalTotal === 0)).toBe(true)
    expect(detail[6]?.base).toBe(20000)
  })

  it('一次性收入按 12 个月摊薄计入缴费基数', () => {
    const detail = computeInsuranceMonthly({
      incomes: [
        makeIncome({ id: 'a', amount: 12000, intoInsuranceBase: true }),
        makeIncome({ id: 'b', amount: 120000, cycle: 'once', kind: 'bonus', intoInsuranceBase: true }),
      ],
      insurance: makeInsurance({ clampEnabled: false }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.base).toBe(22000)
  })
})

describe('累计预扣预缴', () => {
  it('跨税率级距时逐月税额正确跳档', () => {
    // 月薪 15000、无社保无扣除：累计应纳税所得额 = 10000 × N
    const result = calculateSalary(makeInput())
    const monthly = result.monthly

    expect(monthly[2]?.cumulativeTaxable).toBe(30000)
    // 前三月均落在 3% 档，每月补差 300，累计已预扣 900
    expect(monthly[2]?.tax).toBe(300)
    expect(monthly[2]?.cumulativeTaxPaid).toBe(900)

    // 第 4 月累计 40000 落入 10% 档，本期补差 1480 - 900 = 580
    expect(monthly[3]?.tax).toBe(580)

    // 全年累计应纳税所得额 120000，应纳税额 120000 × 10% - 2520 = 9480
    expect(result.annual.taxableIncome).toBe(120000)
    expect(result.annual.tax).toBe(9480)
  })

  it('年中入职时累计减除费用按实际月份数计算', () => {
    const result = calculateSalary(makeInput({ startMonth: 7 }))
    // 7-12 月共 6 个月，累计减除费用 30000，应纳税所得额 = 90000 - 30000 = 60000
    expect(result.annual.taxableIncome).toBe(60000)
    expect(result.annual.tax).toBe(3480)
  })

  it('扣除额超过应纳税所得额时个税为 0 且不为负', () => {
    const deductions = makeDeductions()
    deductions.childrenEducation = { enabled: true, amount: 2000, share: 1, month: 12 }
    deductions.elderlySupport = { enabled: true, amount: 3000, share: 1, month: 12 }
    deductions.housingRent = { enabled: true, amount: 1500, share: 1, month: 12 }

    const result = calculateSalary(
      makeInput({ incomes: [makeIncome({ amount: 6000 })], deductions }),
    )
    expect(result.annual.tax).toBe(0)
    expect(result.monthly.every((item) => item.tax >= 0)).toBe(true)
  })

  it('免税收入不计入综合所得但仍计入到手', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 10000 }),
          makeIncome({ id: 'subsidy', name: '免税补贴', amount: 2000, taxable: false }),
        ],
      }),
    )
    expect(result.annual.gross).toBe(144000)
    expect(result.annual.comprehensiveIncome).toBe(120000)
    expect(result.annual.taxFreeIncome).toBe(24000)
    expect(result.annual.net).toBe(144000 - result.annual.tax)
  })
})

describe('全年一次性奖金', () => {
  it('单独计税按月度税率表定位级距', () => {
    expect(bonusTaxSeparate(36000)).toBe(1080)
    // 多发 1 元即刻跳档，用于验证级距边界处理
    expect(bonusTaxSeparate(36001)).toBe(3390.1)
  })

  it('识别多发奖金反而少拿的无效区间', () => {
    expect(findInvalidRange(36001)?.to).toBe(38566.67)
    expect(findInvalidRange(36000)).toBeUndefined()
    expect(findInvalidRange(50000)).toBeUndefined()
  })

  it('auto 模式自动选择税负更低的计税方式', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 8000 }),
          makeIncome({ id: 'bonus', name: '年终奖', amount: 60000, cycle: 'once', kind: 'bonus' }),
        ],
        bonusMode: 'auto',
      }),
    )
    expect(result.bonusComparison).toBeDefined()
    expect(result.bonusComparison?.diff).toBeGreaterThan(0)
    expect(result.appliedBonusMode).toBe(result.bonusComparison?.better)
  })
})

describe('雇佣阶段', () => {
  const stages: StageRange[] = [
    makeStage('intern', 1, 2, true),
    makeStage('probation', 3, 5),
    makeStage('regular', 6, 12),
  ]

  const stagedIncome = makeIncome({
    amount: 15000,
    staged: true,
    stageAmounts: { intern: 8000, probation: 12000, regular: 15000 },
  })

  it('按阶段差异化发放工资', () => {
    const result = calculateSalary(makeInput({ incomes: [stagedIncome], stages }))
    expect(result.monthly[0]?.gross).toBe(8000)
    expect(result.monthly[2]?.gross).toBe(12000)
    expect(result.monthly[5]?.gross).toBe(15000)
  })

  it('实习期不缴纳五险一金', () => {
    const result = calculateSalary(
      makeInput({ incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })], stages }),
    )
    expect(result.insuranceMonthly[0]?.base).toBe(0)
    expect(result.insuranceMonthly[0]?.personalTotal).toBe(0)
    // 试用期起恢复缴纳，基数回到实际工资
    expect(result.insuranceMonthly[2]?.base).toBe(15000)
  })

  it('福利项可在指定阶段停发', () => {
    const salary = makeIncome({ id: 'salary', amount: 15000, staged: true, stageAmounts: { probation: 12000, regular: 15000 } })
    const welfare = makeIncome({
      id: 'welfare',
      amount: 2000,
      staged: true,
      stageAmounts: { probation: 2000, regular: 2000 },
      // 转正后才有的福利，试用期不发
      stageEnabled: { probation: false, regular: true },
    })
    const result = calculateSalary(
      makeInput({
        incomes: [salary, welfare],
        stages: [makeStage('probation', 1, 3), makeStage('regular', 4, 12)],
      }),
    )
    expect(result.monthly[0]?.gross).toBe(12000)
    expect(result.monthly[3]?.gross).toBe(17000)
    // 停发的福利项在明细中体现为 0
    expect(result.monthly[0]?.incomeBreakdown.welfare).toBe(0)
  })

  it('停发的福利项不计入缴费基数', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({
            id: 'salary',
            amount: 15000,
            intoInsuranceBase: true,
          }),
          makeIncome({
            id: 'welfare',
            amount: 5000,
            intoInsuranceBase: true,
            staged: true,
            stageAmounts: { probation: 5000 },
            stageEnabled: { probation: false },
          }),
        ],
        stages: [makeStage('probation', 1, 12)],
      }),
    )
    expect(result.insuranceMonthly[0]?.base).toBe(15000)
  })

  it('阶段可单独停缴指定险种（试用期只缴五险）', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
      insurance: makeInsurance({ clampEnabled: false, items: allItemsEnabled() }),
      startMonth: 1,
      endMonth: 12,
      stages: [
        makeStage('probation', 1, 3, false, ['housingFund']),
        makeStage('regular', 4, 12),
      ],
    })
    // 试用期公积金个人与单位均为 0，五险照常缴纳
    expect(detail[0]?.personal.housingFund).toBe(0)
    expect(detail[0]?.company.housingFund).toBe(0)
    expect(detail[0]?.personal.pension).toBeGreaterThan(0)
    // 转正后恢复缴纳公积金
    expect(detail[3]?.personal.housingFund).toBeGreaterThan(0)
    expect(detail[3]?.company.housingFund).toBeGreaterThan(0)
  })

  it('阶段整体不缴时明细归零', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 15000, intoInsuranceBase: true })],
      insurance: makeInsurance({ clampEnabled: false, items: allItemsEnabled() }),
      startMonth: 1,
      endMonth: 12,
      stages: [makeStage('intern', 1, 3, true, ['housingFund'])],
    })
    expect(detail[0]?.personalTotal).toBe(0)
    expect(detail[0]?.companyTotal).toBe(0)
    expect(detail[0]?.base).toBe(0)
  })

  it('解析阶段停缴险种', () => {
    const stages = [
      makeStage('probation', 1, 3, false, ['housingFund']),
      makeStage('regular', 4, 12),
    ]
    expect(skippedInsuranceTypesOfMonth(stages, 2)).toEqual(['housingFund'])
    expect(skippedInsuranceTypesOfMonth(stages, 5)).toEqual([])
    // 整体不缴的月份覆盖全部险种
    expect(skippedInsuranceTypesOfMonth([makeStage('intern', 1, 2, true)], 1)).toHaveLength(
      INSURANCE_TYPES.length,
    )
  })

  it('缴费基数随阶段工资变化', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({
            amount: 20000,
            intoInsuranceBase: true,
            staged: true,
            stageAmounts: { probation: 12000, regular: 20000 },
          }),
        ],
        stages,
      }),
    )
    // 试用期工资低于转正后，社保基数同步下探
    expect(result.insuranceMonthly[2]?.base).toBe(12000)
    expect(result.insuranceMonthly[5]?.base).toBe(20000)
  })

  it('未覆盖阶段按转正后口径兜底', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({
            amount: 15000,
            staged: true,
            stageAmounts: { probation: 6000, regular: 15000 },
          }),
        ],
        stages: [makeStage('probation', 1, 3)],
      }),
    )
    expect(result.monthly[0]?.gross).toBe(6000)
    expect(result.monthly[3]?.gross).toBe(15000)
  })

  it('兼容缺少阶段字段的历史存档', () => {
    // 模拟旧版本 localStorage 中的收入项：没有 staged / stageAmounts / stageEnabled
    const legacy = {
      id: 'legacy',
      name: '基本工资',
      amount: 15000,
      cycle: 'monthly',
      month: 1,
      intoInsuranceBase: true,
      taxable: true,
      kind: 'salary',
      enabled: true,
    } as unknown as IncomeItem

    expect(() => calculateSalary(makeInput({ incomes: [legacy], stages }))).not.toThrow()
    expect(amountOfStage(legacy, 'probation')).toBe(15000)
    expect(isItemEnabledInStage(legacy, 'regular')).toBe(true)
  })

  it('校验阶段区间重叠与未覆盖月份', () => {
    expect(
      validateStages([makeStage('intern', 1, 3), makeStage('probation', 3, 6)]).some(
        (issue) => issue.level === 'error',
      ),
    ).toBe(true)
    expect(
      validateStages([makeStage('regular', 1, 6)]).some((issue) => issue.level === 'warning'),
    ).toBe(true)
    expect(validateStages(createDefaultStages()).filter((issue) => issue.level === 'error')).toHaveLength(0)
  })
})

describe('公积金缴费基数', () => {
  const incomes = [makeIncome({ amount: 20000, intoInsuranceBase: true })]

  it('可独立于社保基数手动指定', () => {
    const detail = computeInsuranceMonthly({
      incomes,
      insurance: makeInsurance({
        baseMode: 'manual',
        manualBase: 10000,
        housingFundBaseMode: 'manual',
        housingFundManualBase: 20000,
        clampEnabled: false,
        housingFundClampEnabled: false,
      }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.base).toBe(10000)
    expect(detail[0]?.housingFundBase).toBe(20000)
  })

  it('same 口径下与社保基数一致', () => {
    const detail = computeInsuranceMonthly({
      incomes,
      insurance: makeInsurance({ housingFundBaseMode: 'same', clampEnabled: false }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.housingFundBase).toBe(detail[0]?.base)
  })

  it('公积金可单独关闭封顶托底', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 80000, intoInsuranceBase: true })],
      insurance: makeInsurance({
        clampEnabled: true,
        housingFundClampEnabled: false,
      }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    // 社保仍按上限封顶，公积金按实际工资缴纳
    expect(detail[0]?.base).toBe(35283)
    expect(detail[0]?.housingFundBase).toBe(80000)
  })
})

describe('险种缴纳口径', () => {
  it('医疗保险个人额等于基数乘费率，不额外叠加固定额', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 4699, intoInsuranceBase: true })],
      insurance: makeInsurance({
        cityCode: 'default',
        clampEnabled: false,
        items: allItemsEnabled(),
      }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.personal.medical).toBe(93.98)
  })

  it('填写大病医疗后才叠加固定额', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 4699, intoInsuranceBase: true })],
      insurance: makeInsurance({
        cityCode: 'default',
        clampEnabled: false,
        medicalFixed: 3,
        items: allItemsEnabled(),
      }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.personal.medical).toBe(96.98)
  })

  it('公积金缴费额按元取整，其余险种保留到分', () => {
    const detail = computeInsuranceMonthly({
      incomes: [makeIncome({ amount: 10001, intoInsuranceBase: true })],
      insurance: makeInsurance({
        cityCode: 'default',
        clampEnabled: false,
        items: allItemsEnabled(),
      }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(Number.isInteger(detail[0]?.personal.housingFund)).toBe(true)
    expect(Number.isInteger(detail[0]?.company.housingFund)).toBe(true)
    // 养老 8% 保留两位小数
    expect(detail[0]?.personal.pension).toBe(800.08)
  })
})

describe('边界与异常', () => {
  it('全部收入为 0 时不产生 NaN', () => {
    const result = calculateSalary(
      makeInput({ incomes: [makeIncome({ amount: 0 })] }),
    )
    expect(result.annual.gross).toBe(0)
    expect(result.annual.net).toBe(0)
    expect(result.annual.netRate).toBe(0)
    expect(Number.isNaN(result.annual.tax)).toBe(false)
  })

  it('未匹配城市时回落默认政策而不中断计算', () => {
    const result = calculateSalary(
      makeInput({ insurance: makeInsurance({ cityCode: 'not-exist' }) }),
    )
    expect(result.monthly).toHaveLength(12)
  })
})

describe('额外收入（劳务报酬/稿酬/特许权使用费）', () => {
  it('劳务报酬不超过 4000 元按次减除 800 元', () => {
    // 3000 − 800 = 2200，20% 预扣
    expect(otherIncomeTax('labor', 3000)).toBe(440)
    expect(otherIncomeTaxable(3000)).toBe(2200)
  })

  it('劳务报酬超过 4000 元按次减除 20%', () => {
    // 10000 × 80% = 8000，20% 预扣
    expect(otherIncomeTax('labor', 10000)).toBe(1600)
    expect(otherIncomeAmount('labor', 10000)).toBe(8000)
  })

  it('劳务报酬适用三级累进预扣率', () => {
    // 60000 × 80% = 48000，30% 档速算扣除 2000
    expect(otherIncomeTaxable(60000)).toBe(48000)
    expect(otherIncomeTax('labor', 60000)).toBe(12400)
    // 100000 × 80% = 80000，40% 档速算扣除 7000
    expect(otherIncomeTax('labor', 100000)).toBe(25000)
  })

  it('稿酬减征 30% 后按 20% 预扣', () => {
    // 5000 × 80% = 4000，减征后收入额 2800，预扣 560
    expect(otherIncomeAmount('authorship', 5000)).toBe(2800)
    expect(otherIncomeTax('authorship', 5000)).toBe(560)
  })

  it('特许权使用费按 20% 预扣', () => {
    expect(otherIncomeTax('royalty', 5000)).toBe(800)
  })

  it('额外收入按次预扣，不并入工资薪金累计预扣', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 5000 }),
          makeIncome({
            id: 'labor',
            name: '劳务报酬',
            amount: 10000,
            cycle: 'once',
            month: 6,
            kind: 'labor',
          }),
        ],
      }),
    )
    // 工资 5000 未超过减除费用，全年无工资薪金个税
    expect(result.annual.tax).toBe(1600)
    expect(result.monthly[5]?.otherTax).toBe(1600)
    expect(result.monthly[5]?.tax).toBe(0)
    expect(result.monthly[5]?.otherIncome).toBe(8000)
    // 到手 = 5000 + 10000 − 1600 预扣（社保为 0）
    expect(result.monthly[5]?.net).toBe(13400)
  })

  it('额外收入在汇算时并入综合所得，多预扣的部分退税', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 5000 }),
          makeIncome({
            id: 'labor',
            amount: 10000,
            cycle: 'once',
            month: 6,
            kind: 'labor',
          }),
        ],
      }),
    )
    // 汇算：工资 60000 − 60000 = 0，并入劳务收入额 8000 → 3% = 240
    expect(result.annual.otherIncome).toBe(8000)
    expect(result.annual.settlementTax).toBe(240)
    // 已预扣 1600，应退 1360
    expect(result.annual.settlementDiff).toBe(-1360)
  })

  it('免税的额外收入不产生预扣税', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({
            id: 'labor',
            amount: 10000,
            cycle: 'once',
            month: 6,
            kind: 'labor',
            taxable: false,
          }),
        ],
      }),
    )
    expect(result.annual.otherTax).toBe(0)
    expect(result.annual.otherIncome).toBe(0)
    // 免税部分计入免税收入而非综合所得
    expect(result.annual.taxFreeIncome).toBe(10000)
  })

  it('非居民个人的额外收入按减除费用后的收入额并入当月计税', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 10000 }),
          makeIncome({ id: 'labor', amount: 10000, cycle: 'once', month: 3, kind: 'labor' }),
        ],
        taxpayerType: 'nonResident',
      }),
    )
    // 3 月：工资 10000 + 劳务收入额 8000 − 5000 = 13000，按月换算表 20% 档速算 1410
    expect(result.monthly[2]?.otherIncome).toBe(8000)
    expect(result.monthly[2]?.tax).toBe(1190)
  })
})

describe('非现金福利与逐月金额', () => {
  it('饭票计入应发与应税，但不计入到手', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 15000 }),
          makeIncome({ id: 'meal', name: '餐补饭票', amount: 800, nonCash: true }),
        ],
      }),
    )
    // 应发含饭票
    expect(result.monthly[0]?.gross).toBe(15800)
    expect(result.monthly[0]?.comprehensiveIncome).toBe(15800)
    // 应纳税所得额 15800 − 5000 = 10800，个税 324；到手 15800 − 324 − 800 饭票
    expect(result.monthly[0]?.tax).toBe(324)
    expect(result.monthly[0]?.nonCashIncome).toBe(800)
    expect(result.monthly[0]?.net).toBe(14676)
    expect(result.annual.nonCashIncome).toBe(9600)
  })

  it('非现金福利不计入到手时仍按应发计税', () => {
    const withMeal = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 15000 }),
          makeIncome({ id: 'meal', amount: 800, nonCash: true }),
        ],
      }),
    )
    const cashOnly = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 15000 }),
          makeIncome({ id: 'meal', amount: 800, nonCash: false }),
        ],
      }),
    )
    // 两者计税结果一致，差别只在到手
    expect(withMeal.annual.tax).toBe(cashOnly.annual.tax)
    expect(withMeal.annual.net).toBe(cashOnly.annual.net - 9600)
  })

  it('每月金额不同时按逐月金额发放', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({
            id: 'meal',
            amount: 800,
            variableByMonth: true,
            monthlyAmounts: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
          }),
        ],
      }),
    )
    expect(result.monthly[0]?.gross).toBe(100)
    expect(result.monthly[11]?.gross).toBe(1200)
    expect(result.annual.gross).toBe(7800)
  })

  it('阶段停发优先于逐月金额', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({
            id: 'meal',
            amount: 800,
            staged: true,
            stageEnabled: { intern: false, regular: true },
            stageAmounts: { intern: 800, regular: 800 },
            variableByMonth: true,
            monthlyAmounts: Array(12).fill(500),
          }),
        ],
        stages: [makeStage('intern', 1, 3), makeStage('regular', 4, 12)],
      }),
    )
    expect(result.monthly[0]?.gross).toBe(0)
    expect(result.monthly[3]?.gross).toBe(500)
  })

  it('逐月金额影响计入缴费基数的收入', () => {
    const detail = computeInsuranceMonthly({
      incomes: [
        makeIncome({
          id: 'salary',
          amount: 15000,
          intoInsuranceBase: true,
          variableByMonth: true,
          monthlyAmounts: [10000, 20000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000],
        }),
      ],
      insurance: makeInsurance({ clampEnabled: false }),
      startMonth: 1,
      endMonth: 12,
      stages: [],
    })
    expect(detail[0]?.base).toBe(10000)
    expect(detail[1]?.base).toBe(20000)
  })

  it('缺少非现金与逐月字段的历史存档按现金固定额处理', () => {
    const legacy = {
      id: 'legacy',
      name: '餐补',
      amount: 800,
      cycle: 'monthly',
      month: 1,
      intoInsuranceBase: false,
      taxable: true,
      kind: 'salary',
      enabled: true,
      staged: false,
      stageAmounts: {},
      stageEnabled: {},
    } as unknown as IncomeItem

    const result = calculateSalary(makeInput({ incomes: [legacy] }))
    expect(result.monthly[0]?.gross).toBe(800)
    expect(result.monthly[0]?.nonCashIncome).toBe(0)
    expect(result.monthly[0]?.net).toBe(800)
  })
})

describe('计税口径修正', () => {
  it('一个年度内只允许一笔奖金单独计税', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 15000 }),
          makeIncome({ id: 'b1', name: '年中奖', amount: 40000, cycle: 'once', month: 6, kind: 'bonus' }),
          makeIncome({ id: 'b2', name: '年终奖', amount: 40000, cycle: 'once', month: 12, kind: 'bonus' }),
        ],
        bonusMode: 'separate',
      }),
    )
    // 仅 6 月那笔单独计税，12 月那笔并入综合所得
    expect(result.monthly[5]?.bonusTax).toBe(3790)
    expect(result.monthly[11]?.bonusTax).toBe(0)
    // 综合所得 180000 + 40000 = 220000，应纳税所得额 160000
    expect(result.annual.tax).toBe(18870)
  })

  it('大病医疗自动适用 15000 元起扣线', () => {
    const deductions = makeDeductions()
    deductions.seriousIllness = { enabled: true, amount: 20000, share: 1, month: 12 }
    const result = calculateSalary(makeInput({ deductions }))
    expect(result.annual.settlementOnlyDeduction).toBe(5000)
    expect(result.annual.settlementTax).toBe(8980)
    expect(result.annual.settlementDiff).toBe(-500)
  })

  it('公益捐赠按应纳税所得额 30% 限额扣除', () => {
    const deductions = makeDeductions()
    deductions.donation = { enabled: true, amount: 300000, share: 1, month: 12 }
    const result = calculateSalary(makeInput({ deductions }))
    // 未扣除捐赠前的应纳税所得额 120000，限额 36000
    expect(result.annual.donationApplied).toBe(36000)
    expect(result.annual.taxableIncome).toBe(84000)
    // 捐赠在 12 月一次性扣除，前 11 月已预扣 8480，累计应纳税额下降部分留待汇算退税
    expect(result.annual.tax).toBe(8480)
    expect(result.annual.settlementTax).toBe(5880)
    expect(result.annual.settlementDiff).toBe(-2600)
  })

  it('auto 模式可拆分为部分奖金单独计税', () => {
    const result = calculateSalary(
      makeInput({
        incomes: [
          makeIncome({ id: 'salary', amount: 5000 }),
          makeIncome({ id: 'bonus', amount: 40000, cycle: 'once', month: 12, kind: 'bonus' }),
        ],
        bonusMode: 'auto',
      }),
    )
    expect(result.appliedBonusMode).toBe('split')
    // 并入 36000、单独 4000 时，两部分都落在 3% 档
    expect(result.annual.tax).toBe(1200)
    const splitAmount = result.bonusComparison?.splitAmount ?? 0
    expect(splitAmount).toBeGreaterThanOrEqual(4000)
    expect(splitAmount).toBeLessThanOrEqual(36000)
  })

  it('非居民个人按月单独计税且不享受专项附加扣除', () => {
    const deductions = makeDeductions()
    deductions.childrenEducation = { enabled: true, amount: 2000, share: 1, month: 1 }
    const result = calculateSalary(
      makeInput({
        incomes: [makeIncome({ id: 'salary', amount: 30000 })],
        deductions,
        taxpayerType: 'nonResident',
      }),
    )
    // (30000 - 5000) 落在按月换算表的 20% 档
    expect(result.monthly[0]?.tax).toBe(3590)
    expect(result.annual.tax).toBe(43080)
  })

  it('年内离职后不再产生收入', () => {
    const result = calculateSalary(makeInput({ endMonth: 6 }))
    expect(result.monthly[6]?.gross).toBe(0)
    expect(result.annual.gross).toBe(90000)
    // 在职 6 个月，减除费用 30000
    expect(result.annual.tax).toBe(3480)
  })

  it('离职后不再缴纳五险一金', () => {
    const result = calculateSalary(
      makeInput({ insurance: makeInsurance({ items: allItemsEnabled() }), endMonth: 6 }),
    )
    expect(result.insuranceMonthly[6]?.personalTotal).toBe(0)
    expect(result.insuranceMonthly[5]?.personalTotal).toBeGreaterThan(0)
  })

  it('减免税额直接冲减应纳税额', () => {
    const result = calculateSalary(makeInput({ taxReductionMonthly: 1000 }))
    expect(result.annual.tax).toBe(0)
  })

  it('赡养老人区分独生子女与非独生子女分摊上限', () => {
    const solo = makeDeductions()
    solo.elderlySupport = { enabled: true, amount: 3000, share: 1, month: 1, soleProvider: true }
    expect(calculateSalary(makeInput({ deductions: solo })).monthly[0]?.deductionTotal).toBe(3000)

    const shared = makeDeductions()
    shared.elderlySupport = { enabled: true, amount: 3000, share: 1, month: 1, soleProvider: false }
    expect(calculateSalary(makeInput({ deductions: shared })).monthly[0]?.deductionTotal).toBe(1500)
  })
})
