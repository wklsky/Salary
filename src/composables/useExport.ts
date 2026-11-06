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
          if (typeof value === 'number') {
            // 百分比列换算成百分数，月份列输出整数，其余金额保留两位小数
            if (column.formatter === 'percent') return (value * 100).toFixed(2)
            if (column.formatter === 'month' || column.formatter === 'number') {
              return String(value)
            }
            return value.toFixed(2)
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

  /**
   * 导出年度汇总为 CSV
   * 传入已排好序的「指标 - 金额」行，导出结果与年度页看到的数字一致
   */
  function exportAnnualCsv(params: {
    rows: Array<{ label: string; value: string }>
    filename: string
  }) {
    const header = '指标,金额'
    const body = params.rows.map(
      (row) => `${escapeCsv(row.label)},${escapeCsv(row.value)}`,
    )
    download(`﻿${[header, ...body].join('\n')}`, params.filename, 'text/csv;charset=utf-8')
    ElMessage.success('年度汇总已导出为 CSV')
  }

  /**
   * 导出方案对比为 CSV：行是指标，列是方案
   * 首列指标名，其余列为各方案名称，便于直接粘进表格里横向比较
   */
  function exportCompareCsv(params: {
    columns: Array<{ name: string }>
    rows: Array<{ label: string; values: string[] }>
    filename: string
  }) {
    const header = ['指标', ...params.columns.map((column) => escapeCsv(column.name))].join(',')
    const body = params.rows.map((row) =>
      [escapeCsv(row.label), ...row.values.map(escapeCsv)].join(','),
    )
    download(`﻿${[header, ...body].join('\n')}`, params.filename, 'text/csv;charset=utf-8')
    ElMessage.success('方案对比已导出为 CSV')
  }

  /**
   * 通用矩阵导出：表头 + 行数据，供工资单等自定义列序的表格使用
   */
  function exportMatrixCsv(params: {
    header: string[]
    rows: string[][]
    filename: string
    successText?: string
  }) {
    const header = params.header.map(escapeCsv).join(',')
    const body = params.rows.map((row) => row.map(escapeCsv).join(','))
    download(`﻿${[header, ...body].join('\n')}`, params.filename, 'text/csv;charset=utf-8')
    ElMessage.success(params.successText ?? '已导出为 CSV')
  }

  /** 读取本地 JSON 文件，失败时抛出便于调用方提示 */
  async function readJsonFile<T>(file: File): Promise<T> {
    const text = await file.text()
    return JSON.parse(text) as T
  }

  return {
    exportMonthlyCsv,
    exportAnnualCsv,
    exportCompareCsv,
    exportMatrixCsv,
    exportJson,
    readJsonFile,
  }
}
