/**
 * @Author: wj
 * @FilePath: src/types/nav.ts
 * @Description: 侧边栏目录与页面分区的导航类型
 */

/** 应用的两个主视图 */
export type AppView = 'setup' | 'table'

/** 录入设置视图的分区标识，顺序即录入顺序 */
export type SetupSectionKey =
  | 'period'
  | 'income'
  | 'insurance'
  | 'stage'
  | 'deduction'
  | 'posttax'
  | 'advanced'

/** 月度明细视图的分区标识 */
export type TableSectionKey = 'overview' | 'bonus' | 'monthly' | 'annual'

/** 侧边栏目录项，index 用于展示分区序号，meta 展示该分区的实时状态 */
export interface NavItem {
  key: string
  index?: string
  label: string
  meta?: string
}
