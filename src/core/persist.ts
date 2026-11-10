/**
 * @Author: wj
 * @FilePath: src/core/persist.ts
 * @Description: 本地存档版本、结构校验与导入迁移
 */

/**
 * 当前存档结构版本
 * 新增会影响旧数据解读的字段时递增，并在 migrateSnapshot 里补一段迁移；
 * 仅追加可选字段（如扣除生效区间）不需要升版本，读取时按缺省值兜底即可
 */
export const PERSIST_VERSION = 2

/** 是否为普通对象（排除数组与 null） */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取存档版本号，无版本号视为最早的 v1 存档 */
export function readVersion(raw: unknown): number {
  if (!isRecord(raw)) return 1
  const value = raw.__v ?? raw.version
  return typeof value === 'number' && Number.isFinite(value) ? value : 1
}

/** 把任意历史版本的存档收敛到当前结构；返回值可直接交给各 store 的 import 逻辑 */
export function migrateSnapshot<T extends Record<string, unknown>>(raw: unknown): T {
  if (!isRecord(raw)) return {} as T
  // 版本信息只用于判断迁移路径，不应写回 store 状态
  const { __v: _internalVersion, version: _externalVersion, ...rest } = raw
  void _internalVersion
  void _externalVersion
  return rest as T
}

/** 结构校验的结果：空数组表示可以安全导入 */
export function validateSnapshot(payload: unknown): string[] {
  if (!isRecord(payload)) return ['文件内容不是有效的配置对象']

  const errors: string[] = []

  if (payload.incomes !== undefined) {
    if (!Array.isArray(payload.incomes)) {
      errors.push('收入项列表不是数组')
    } else {
      payload.incomes.forEach((item, index) => {
        if (!isRecord(item)) {
          errors.push(`第 ${index + 1} 个收入项格式不正确`)
          return
        }
        if (typeof item.id !== 'string' || !item.id) {
          errors.push(`第 ${index + 1} 个收入项缺少 id`)
        }
        if (typeof item.name !== 'string') {
          errors.push(`第 ${index + 1} 个收入项缺少名称`)
        }
        if (typeof item.amount !== 'number' || !Number.isFinite(item.amount)) {
          errors.push(`第 ${index + 1} 个收入项金额不是有效数字`)
        }
      })
    }
  }

  if (payload.insurance !== undefined && !isRecord(payload.insurance)) {
    errors.push('五险一金配置格式不正确')
  }
  if (payload.deductions !== undefined && !isRecord(payload.deductions)) {
    errors.push('专项附加扣除配置格式不正确')
  }
  if (payload.stages !== undefined && !Array.isArray(payload.stages)) {
    errors.push('雇佣阶段配置格式不正确')
  }
  if (payload.monthOverrides !== undefined && !isRecord(payload.monthOverrides)) {
    errors.push('单月调整配置格式不正确')
  }
  if (payload.postTaxDeductions !== undefined && !Array.isArray(payload.postTaxDeductions)) {
    errors.push('税后扣款配置格式不正确')
  }
  if (payload.schemes !== undefined && !Array.isArray(payload.schemes)) {
    errors.push('已存方案列表格式不正确')
  }
  if (payload.tableSchema !== undefined && !isRecord(payload.tableSchema)) {
    errors.push('表格列配置格式不正确')
  }

  return errors
}
