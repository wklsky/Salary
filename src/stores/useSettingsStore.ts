/**
 * @Author: wj
 * @FilePath: src/stores/useSettingsStore.ts
 * @Description: 全局计算设置：年度、在职区间、纳税人身份、减免税额与年终奖计税方式
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { BonusMode, CityPolicy, PayTiming, TaxpayerType } from '@/types'
import { PERSIST_VERSION } from '@/core/persist'

/** 一年最多 12 个月，计算区间不得跨自然年 */
const MAX_MONTH = 12
const MIN_MONTH = 1

/** 把月份收敛到 1-12 的整数，避免存档脏数据产生非法区间 */
function clampMonth(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(MAX_MONTH, Math.max(MIN_MONTH, Math.round(value)))
}

interface SettingsPayload {
  year: number
  startMonth: number
  endMonth: number
  monthCount: number
  bonusMode: BonusMode
  taxpayerType: TaxpayerType
  taxReductionMonthly: number
  /** 表格内反推应发/实发/个税时用于调整的工资项 id；空字符串表示自动选择 */
  reverseAdjustIncomeId: string
  /** 界面主题：浅色 / 深色 */
  theme: ThemeMode
  /** 用户自定义城市政策，随设置一起持久化 */
  customCities: CityPolicy[]
  /** 工资发放时间：当月发放 / 次月发放 */
  payTiming: PayTiming
  /** 最近一次导出备份的时间（ISO），用于提醒用户定期外部备份 */
  lastExportedAt: string
}

export type ThemeMode = 'light' | 'dark' | 'system'

/** 未来科技风以深色为主视觉，首次进入默认深色；之后以用户选择为准 */
function preferredTheme(): ThemeMode {
  return 'dark'
}

export const useSettingsStore = defineStore(
  'salary-settings',
  () => {
    const year = ref<number>(new Date().getFullYear())
    /** 当年入职月份，影响累计减除费用的月份数 */
    const startMonth = ref<number>(1)
    /** 当年离职月份；按自然年计算，跨年周期请分两次录入 */
    const endMonth = ref<number>(12)

    /**
     * 计算月数：从起始月起连续计算的月份数，最长 12 个月
     * 以 endMonth 为存储源，读写时与起始月联动，避免两处状态不一致
     */
    const monthCount = computed({
      // 兜底钳制到 1，防止异常状态下界面出现负数月数
      get: () => Math.max(1, endMonth.value - startMonth.value + 1),
      set: (value: number) => {
        const safe = Math.round(value) || 1
        // 区间不得跨年：起始月 + 月数 − 1 最多到 12 月
        const count = Math.min(Math.max(safe, 1), MAX_MONTH - startMonth.value + 1)
        endMonth.value = startMonth.value + count - 1
      },
    })

    /**
     * 起始月后移时保持区间合法
     * 界面直接绑定 startMonth，若不联动，可能出现离职月早于入职月的空区间，
     * 计算结果会静默变成全 0
     */
    watch(startMonth, (value) => {
      const safeStart = clampMonth(value, MIN_MONTH)
      if (safeStart !== value) startMonth.value = safeStart
      if (endMonth.value < safeStart) endMonth.value = safeStart
    })

    /** 当前起始月下允许的最大计算月数 */
    const maxMonthCount = computed(() => MAX_MONTH - startMonth.value + 1)

    /** 计算区间的可读描述，如「3 月 - 8 月，共 6 个月」 */
    const rangeText = computed(() => {
      const end = endMonth.value
      return `${startMonth.value} 月 - ${end} 月，共 ${monthCount.value} 个月`
    })
    /** 年终奖计税方式，auto 会自动搜索税负最低的拆分方案 */
    const bonusMode = ref<BonusMode>('auto')
    /** 居民个人累计预扣；非居民个人按月单独计税且不享受专项附加扣除 */
    const taxpayerType = ref<TaxpayerType>('resident')
    /** 每月减免税额，如残疾、孤老、烈属等减征政策，无则填 0 */
    const taxReductionMonthly = ref<number>(0)
    /** 反推调整项：表格内修改应发/实发/个税时，通过调整该工资项达到目标 */
    const reverseAdjustIncomeId = ref<string>('')
    /** 界面主题，首次进入跟随系统偏好 */
    const theme = ref<ThemeMode>(preferredTheme())
    /** 用户自定义城市，与内置城市同 code 时优先使用自定义版本 */
    const customCities = ref<CityPolicy[]>([])
    /** 工资发放时间：次月发放时按实际发放月计税，阶段工资按归属月判定 */
    const payTiming = ref<PayTiming>('same')
    /** 最近一次导出备份的时间（ISO），空字符串表示从未导出 */
    const lastExportedAt = ref<string>('')
    /**
     * 存档结构版本
     * 首次读到旧存档时为 0，normalize 后写入当前版本；
     * 后续若出现破坏性字段调整，可据此决定是否执行迁移
     */
    const storageVersion = ref<number>(0)

    /** 新增或覆盖一个自定义城市（按 code 覆盖） */
    function upsertCustomCity(city: CityPolicy) {
      const index = customCities.value.findIndex((item) => item.code === city.code)
      if (index >= 0) {
        customCities.value.splice(index, 1, { ...city })
      } else {
        customCities.value.push({ ...city })
      }
    }

    function removeCustomCity(code: string) {
      customCities.value = customCities.value.filter((item) => item.code !== code)
    }

    function updateSettings(payload: Partial<SettingsPayload>) {
      if (payload.year !== undefined) year.value = payload.year
      if (payload.startMonth !== undefined) {
        startMonth.value = clampMonth(payload.startMonth, MIN_MONTH)
      }
      if (payload.endMonth !== undefined) {
        endMonth.value = clampMonth(payload.endMonth, MAX_MONTH)
      }
      if (payload.monthCount !== undefined) monthCount.value = payload.monthCount
      if (payload.bonusMode !== undefined) bonusMode.value = payload.bonusMode
      if (payload.taxpayerType !== undefined) taxpayerType.value = payload.taxpayerType
      if (payload.taxReductionMonthly !== undefined) {
        taxReductionMonthly.value = payload.taxReductionMonthly
      }
      if (payload.reverseAdjustIncomeId !== undefined) {
        reverseAdjustIncomeId.value = payload.reverseAdjustIncomeId
      }
      if (payload.theme !== undefined) theme.value = payload.theme
      if (payload.customCities !== undefined) {
        customCities.value = Array.isArray(payload.customCities) ? payload.customCities : []
      }
      if (payload.payTiming !== undefined) payTiming.value = payload.payTiming
      if (payload.lastExportedAt !== undefined) lastExportedAt.value = payload.lastExportedAt
      // 保证在职区间合法，避免离职月早于入职月导致零收入
      if (endMonth.value < startMonth.value) endMonth.value = startMonth.value
      // 起始月变化后月数可能溢出年末，收回到年末为止
      if (endMonth.value > MAX_MONTH) endMonth.value = MAX_MONTH
    }

    /** 补齐旧版本存档缺失的设置项，避免读取 undefined 参与计算 */
    function normalize() {
      startMonth.value = clampMonth(startMonth.value, MIN_MONTH)
      if (typeof endMonth.value !== 'number') endMonth.value = MAX_MONTH
      endMonth.value = clampMonth(endMonth.value, MAX_MONTH)
      if (endMonth.value < startMonth.value) endMonth.value = startMonth.value
      if (!taxpayerType.value) taxpayerType.value = 'resident'
      if (typeof taxReductionMonthly.value !== 'number') taxReductionMonthly.value = 0
      if (typeof reverseAdjustIncomeId.value !== 'string') reverseAdjustIncomeId.value = ''
      if (theme.value !== 'light' && theme.value !== 'dark' && theme.value !== 'system') {
        theme.value = preferredTheme()
      }
      if (!Array.isArray(customCities.value)) customCities.value = []
      if (payTiming.value !== 'same' && payTiming.value !== 'next') payTiming.value = 'same'
      if (typeof lastExportedAt.value !== 'string') lastExportedAt.value = ''
      storageVersion.value = PERSIST_VERSION
    }

    return {
      year,
      startMonth,
      endMonth,
      monthCount,
      maxMonthCount,
      rangeText,
      bonusMode,
      taxpayerType,
      taxReductionMonthly,
      reverseAdjustIncomeId,
      theme,
      customCities,
      payTiming,
      lastExportedAt,
      storageVersion,
      upsertCustomCity,
      removeCustomCity,
      updateSettings,
      normalize,
    }
  },
  { persist: { key: 'salary-calc:settings' } },
)
