/**
 * @Author: wj
 * @FilePath: tests/unit/columns.spec.ts
 * @Description: 表格列取值测试：五险一金个人与单位分列是否各自取到正确口径
 */
import { describe, expect, it } from 'vitest'
import { insuranceColumnKey, insuranceCompanyColumnKey } from '@/config/columns'
import { resolveColumnValue } from '@/utils/columnValue'
import { INSURANCE_TYPES } from '@/types'
import type {
  ColumnSchema,
  InsuranceAmountMap,
  InsuranceMonthDetail,
  MonthlyResult,
} from '@/types'

const PERSONAL: InsuranceAmountMap = {
  pension: 800,
  medical: 200,
  unemployment: 50,
  injury: 0,
  maternity: 0,
  housingFund: 700,
}

const COMPANY: InsuranceAmountMap = {
  pension: 1600,
  medical: 900,
  unemployment: 50,
  injury: 40,
  maternity: 0,
  housingFund: 700,
}

const detail: InsuranceMonthDetail = {
  month: 1,
  base: 10000,
  housingFundBase: 10000,
  personal: PERSONAL,
  company: COMPANY,
  personalTotal: 1750,
  companyTotal: 3290,
}

/** 险种列只依赖 insurance 明细，行数据给最小占位即可 */
const row = {} as MonthlyResult

function columnOf(key: string): ColumnSchema {
  return {
    key,
    label: key,
    group: 'insurance',
    visible: true,
    order: 0,
    width: 120,
    formatter: 'money',
    dynamic: false,
  }
}

describe('五险一金列取值', () => {
  it('ins_ 前缀取个人缴纳额', () => {
    INSURANCE_TYPES.forEach((type) => {
      expect(resolveColumnValue(columnOf(insuranceColumnKey(type)), row, detail)).toBe(
        PERSONAL[type],
      )
    })
  })

  it('inscomp_ 前缀取单位缴纳额', () => {
    INSURANCE_TYPES.forEach((type) => {
      expect(resolveColumnValue(columnOf(insuranceCompanyColumnKey(type)), row, detail)).toBe(
        COMPANY[type],
      )
    })
  })

  it('缺失社保明细时按 0 处理，不产生 NaN', () => {
    expect(resolveColumnValue(columnOf(insuranceColumnKey('pension')), row, undefined)).toBe(0)
    expect(resolveColumnValue(columnOf(insuranceCompanyColumnKey('pension')), row, undefined)).toBe(0)
  })
})
