/**
 * @Author: wj
 * @FilePath: src/types/table.ts
 * @Description: 表格列 Schema 与列预设的类型定义
 */

export type ColumnGroup = 'basic' | 'income' | 'insurance' | 'deduction' | 'tax' | 'result'

export type ColumnFormatter = 'month' | 'money' | 'percent' | 'text'

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
