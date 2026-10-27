/**
 * @Author: wj
 * @FilePath: src/types/table.ts
 * @Description: 表格列 Schema 与列预设的类型定义
 */

export type ColumnGroup = 'basic' | 'income' | 'insurance' | 'deduction' | 'tax' | 'result'

export type ColumnFormatter = 'month' | 'money' | 'percent' | 'text'

/**
 * 用户自定义列的附加定义
 * 自定义列带 12 个月的数值，可选择是否计入应发并参与计税/计基
 */
export interface CustomColumnDef {
  /** 逐月数值，长度 12，下标 0-11 对应 1-12 月 */
  values: number[]
  /** 是否计入应发；关闭时该列仅展示，不影响工资计算 */
  intoGross: boolean
  /** 计入应发时是否并入综合所得计税 */
  taxable: boolean
  /** 计入应发时是否计入社保缴费基数 */
  intoBase: boolean
}

export interface ColumnSchema {
  /** 唯一列标识；动态列使用收入项 id 作为 key */
  key: string
  label: string
  group: ColumnGroup
  visible: boolean
  order: number
  width?: number
  formatter: ColumnFormatter
  /** 由收入项动态派生，收入项删除时需同步清理，避免产生孤儿列 */
  dynamic: boolean
  /** 用户手动新增的自定义列；非空时该列带逐月数值，可参与工资计算 */
  custom?: CustomColumnDef
  /** 用户重命名后的表头，非空时优先展示 */
  customLabel?: string
  /** 是否为结果列，导出汇总时默认保留 */
  pinned?: boolean
}

/** 列预设：仅持久化可见性与顺序，列定义本身仍以最新注册表为准 */
export interface ColumnPreset {
  id: string
  name: string
  builtin: boolean
  visibleKeys: string[]
  /** 是否纳入用户自定义的收入项列；收入项数量不固定，无法枚举到 visibleKeys */
  includeIncomeColumns: boolean
}
