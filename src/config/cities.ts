/**
 * @Author: wj
 * @FilePath: src/config/cities.ts
 * @Description: 城市社保/公积金政策配置（比例与缴费基数上下限）
 *
 * 注意：各地比例与基数上下限每年调整，以下为参考值（referenceYear 标注）。
 * UI 层提供手动覆盖入口，用户可随时按当地社保局最新口径校正。
 */
import type { CityPolicy, RatePair } from '@/types'

/** 未匹配到城市时的兜底政策：采用全国常见比例，基数上下限取较宽区间 */
export const DEFAULT_CITY: CityPolicy = {
  code: 'default',
  name: '自定义/其它城市',
  base: { lower: 4000, upper: 30000 },
  rates: {
    pension: { personal: 0.08, company: 0.16 },
    medical: { personal: 0.02, company: 0.098 },
    unemployment: { personal: 0.005, company: 0.005 },
    injury: { personal: 0, company: 0.004 },
    // 生育保险已并入医疗保险统一征收，故不再单独列示
    maternity: null,
    housingFund: { personal: 0.07, company: 0.07 },
  },
  medicalFixed: 3,
  referenceYear: 2025,
}

/** 构造险种费率，避免每个城市重复书写六个对象 */
function rates(
  pension: RatePair,
  medical: RatePair,
  unemployment: RatePair,
  injury: RatePair,
  housingFund: RatePair,
  maternity: RatePair | null = null,
): CityPolicy['rates'] {
  return { pension, medical, unemployment, injury, maternity, housingFund }
}

export const CITIES: CityPolicy[] = [
  {
    code: 'beijing',
    name: '北京',
    base: { lower: 6821, upper: 35283 },
    housingFundBase: { lower: 2420, upper: 35283 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.09 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.004 },
      { personal: 0.12, company: 0.12 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'shanghai',
    name: '上海',
    base: { lower: 7384, upper: 36921 },
    housingFundBase: { lower: 2690, upper: 36921 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.095 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.0032 },
      { personal: 0.07, company: 0.07 },
      { personal: 0, company: 0.01 },
    ),
    referenceYear: 2025,
  },
  {
    code: 'guangzhou',
    name: '广州',
    base: { lower: 4546, upper: 26421 },
    housingFundBase: { lower: 2300, upper: 26421 },
    rates: rates(
      { personal: 0.08, company: 0.14 },
      { personal: 0.02, company: 0.055 },
      { personal: 0.002, company: 0.0048 },
      { personal: 0, company: 0.002 },
      { personal: 0.12, company: 0.12 },
    ),
    referenceYear: 2025,
  },
  {
    code: 'shenzhen',
    name: '深圳',
    base: { lower: 4546, upper: 27501 },
    housingFundBase: { lower: 2360, upper: 27501 },
    rates: rates(
      { personal: 0.08, company: 0.15 },
      { personal: 0.02, company: 0.052 },
      { personal: 0.003, company: 0.0048 },
      { personal: 0, company: 0.002 },
      { personal: 0.05, company: 0.05 },
    ),
    referenceYear: 2025,
  },
  {
    code: 'hangzhou',
    name: '杭州',
    base: { lower: 4462, upper: 24060 },
    rates: rates(
      { personal: 0.08, company: 0.14 },
      { personal: 0.02, company: 0.095 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.12, company: 0.12 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'nanjing',
    name: '南京',
    base: { lower: 4250, upper: 24042 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.088 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'chengdu',
    name: '成都',
    base: { lower: 4246, upper: 21255 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.0675 },
      { personal: 0.004, company: 0.006 },
      { personal: 0, company: 0.002 },
      { personal: 0.06, company: 0.06 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'wuhan',
    name: '武汉',
    base: { lower: 4077, upper: 20385 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.088 },
      { personal: 0.003, company: 0.007 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 7,
    referenceYear: 2025,
  },
  {
    code: 'xian',
    name: '西安',
    base: { lower: 3926, upper: 19630 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.08 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'suzhou',
    name: '苏州',
    base: { lower: 4250, upper: 24042 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.07 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 5,
    referenceYear: 2025,
  },
  {
    code: 'tianjin',
    name: '天津',
    base: { lower: 4400, upper: 22032 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.08 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.11, company: 0.11 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'chongqing',
    name: '重庆',
    base: { lower: 4118, upper: 20587 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.085 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.07, company: 0.07 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'changsha',
    name: '长沙',
    base: { lower: 3945, upper: 19725 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.08 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'zhengzhou',
    name: '郑州',
    base: { lower: 3864, upper: 19320 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.08 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'qingdao',
    name: '青岛',
    base: { lower: 4242, upper: 21210 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.083 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.07, company: 0.07 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'hefei',
    name: '合肥',
    base: { lower: 3832, upper: 19160 },
    rates: rates(
      { personal: 0.08, company: 0.16 },
      { personal: 0.02, company: 0.08 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'xiamen',
    name: '厦门',
    base: { lower: 4043, upper: 20215 },
    rates: rates(
      { personal: 0.08, company: 0.14 },
      { personal: 0.02, company: 0.065 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
  {
    code: 'dongguan',
    name: '东莞',
    base: { lower: 3958, upper: 19790 },
    rates: rates(
      { personal: 0.08, company: 0.14 },
      { personal: 0.005, company: 0.026 },
      { personal: 0.002, company: 0.0048 },
      { personal: 0, company: 0.002 },
      { personal: 0.05, company: 0.05 },
    ),
    referenceYear: 2025,
  },
  {
    code: 'foshan',
    name: '佛山',
    base: { lower: 3958, upper: 19790 },
    rates: rates(
      { personal: 0.08, company: 0.14 },
      { personal: 0.005, company: 0.028 },
      { personal: 0.002, company: 0.0048 },
      { personal: 0, company: 0.002 },
      { personal: 0.05, company: 0.05 },
    ),
    referenceYear: 2025,
  },
  {
    code: 'ningbo',
    name: '宁波',
    base: { lower: 4462, upper: 22305 },
    rates: rates(
      { personal: 0.08, company: 0.14 },
      { personal: 0.02, company: 0.085 },
      { personal: 0.005, company: 0.005 },
      { personal: 0, company: 0.002 },
      { personal: 0.08, company: 0.08 },
    ),
    medicalFixed: 3,
    referenceYear: 2025,
  },
]
