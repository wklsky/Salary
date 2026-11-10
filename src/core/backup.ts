/**
 * @Author: wj
 * @FilePath: src/core/backup.ts
 * @Description: 本地备份：在 localStorage 之外再存一份到 IndexedDB。
 * 说明：浏览器「清除站点数据」会同时清掉两者，备份只能兜住半丢失场景；
 * 真正可靠的仍是导出到本地文件。
 */
import { PERSIST_VERSION } from './persist'

/** 参与备份的存档 key，与各 store 的 persist 配置保持一致 */
export const BACKUP_KEYS = [
  'salary-calc:input',
  'salary-calc:settings',
  'salary-calc:table-schema',
] as const

/** 距离上次导出超过这么多天，就提醒做一次外部备份 */
export const BACKUP_REMIND_DAYS = 7

export interface BackupRecord {
  /** 存档结构版本，恢复前可据此判断是否需要迁移 */
  version: number
  /** 备份时间（ISO 字符串） */
  savedAt: string
  /** 原始 localStorage 文本，直接回写即可，不依赖 store 结构 */
  keys: Record<string, string>
}

const DB_NAME = 'salary-calc-backup'
const STORE_NAME = 'snapshots'
const RECORD_KEY = 'latest'

/** 收集当前主存档，原始 JSON 字符串原样保存，避免与 store 结构耦合 */
export function collectStorageSnapshot(storage: Storage = localStorage): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of BACKUP_KEYS) {
    const value = storage.getItem(key)
    if (value) result[key] = value
  }
  return result
}

/** 主存档里是否还有数据 */
export function hasLocalData(storage: Storage = localStorage): boolean {
  return Object.keys(collectStorageSnapshot(storage)).length > 0
}

/** 录入数据 key 丢失即视为主存档被清空 */
export function isStorageEmpty(storage: Storage = localStorage): boolean {
  return !storage.getItem('salary-calc:input')
}

/** 是否该提醒用户做一次外部备份 */
export function needsBackupReminder(lastExportedAt: string, now: Date = new Date()): boolean {
  if (!lastExportedAt) return true
  const time = new Date(lastExportedAt).getTime()
  if (!Number.isFinite(time)) return true
  return now.getTime() - time >= BACKUP_REMIND_DAYS * 24 * 60 * 60 * 1000
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持本地备份'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('打开本地备份失败'))
  })
}

/** 把当前主存档写入 IndexedDB；没有数据时不写，避免空备份覆盖有效备份 */
export async function saveBackup(storage: Storage = localStorage): Promise<BackupRecord | null> {
  const keys = collectStorageSnapshot(storage)
  if (!Object.keys(keys).length) return null
  const record: BackupRecord = {
    version: PERSIST_VERSION,
    savedAt: new Date().toISOString(),
    keys,
  }
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(record, RECORD_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('写入本地备份失败'))
    })
  } finally {
    db.close()
  }
  return record
}

export async function loadBackup(): Promise<BackupRecord | null> {
  try {
    const db = await openDb()
    try {
      return await new Promise<BackupRecord | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).get(RECORD_KEY)
        request.onsuccess = () => resolve((request.result as BackupRecord | undefined) ?? null)
        request.onerror = () => reject(request.error ?? new Error('读取本地备份失败'))
      })
    } finally {
      db.close()
    }
  } catch {
    // 浏览器不支持或用户禁用了 IndexedDB，静默降级为「没有备份」
    return null
  }
}

/** 把备份回写到 localStorage，返回恢复的 key 数量 */
export function restoreBackup(record: BackupRecord, storage: Storage = localStorage): number {
  let count = 0
  for (const [key, value] of Object.entries(record.keys)) {
    storage.setItem(key, value)
    count += 1
  }
  return count
}
