/**
 * @Author: wj
 * @FilePath: src/composables/useExport.ts
 * @Description: 结果导出与配置导入导出（CSV / JSON）
 */
import { ElMessage } from 'element-plus'
import type { ColumnSchema, InsuranceMonthDetail, MonthlyResult } from '@/types'
import { resolveColumnValue } from '@/utils/columnValue'

/** 触发浏览器下载，统一处理 Blob 生命周期 */
function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** CSV 字段转义：包含分隔符、引号或换行时用双引号包裹 */
function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function useExport() {
  /**
   * 导出月度明细为 CSV
   * 首行表头使用列的当前可见集合，导出内容与用户在屏幕上看到的完全一致
   */
  function exportMonthlyCsv(params: {
    columns: ColumnSchema[]
    rows: MonthlyResult[]
    insuranceMonthly: InsuranceMonthDetail[]
    filename: string
  }) {
    const { columns, rows, insuranceMonthly, filename } = params
    const header = columns.map((column) => escapeCsv(column.customLabel || column.label)).join(',')

    const body = rows.map((row) => {
      const insurance = insuranceMonthly.find((item) => item.month === row.month)
      return columns
        .map((column) => {
          const value = resolveColumnValue(column, row, insurance)
          // 金额列保留两位小数，月份列直接输出数字，避免 Excel 识别为文本
          if (typeof value === 'number') {
            return column.formatter === 'percent' ? (value * 100).toFixed(2) : value.toFixed(2)
          }
          return escapeCsv(value)
        })
        .join(',')
    })

    // 加 BOM，保证 Excel 以 UTF-8 打开中文表头不乱码
    download(`﻿${[header, ...body].join('\n')}`, filename, 'text/csv;charset=utf-8')
    ElMessage.success('明细已导出为 CSV')
  }

  function exportJson(data: unknown, filename: string) {
    try {
      download(JSON.stringify(data, null, 2), filename, 'application/json;charset=utf-8')
      ElMessage.success('配置已导出为 JSON')
    } catch (error) {
      console.error('[salary] 导出 JSON 失败', error)
      ElMessage.error('导出失败，请重试')
    }
  }

  /** 读取本地 JSON 文件，失败时抛出便于调用方提示 */
  async function readJsonFile<T>(file: File): Promise<T> {
    const text = await file.text()
    return JSON.parse(text) as T
  }

  return { exportMonthlyCsv, exportJson, readJsonFile }
}
