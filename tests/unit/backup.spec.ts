/**
 * @Author: wj
 * @FilePath: tests/unit/backup.spec.ts
 * @Description: 本地备份的存档收集、空态判定与导出提醒阈值
 */
import { describe, expect, it } from 'vitest'
import {
  BACKUP_KEYS,
  BACKUP_REMIND_DAYS,
  collectStorageSnapshot,
  isStorageEmpty,
  needsBackupReminder,
} from '@/core/backup'

/** 最小 Storage 替身，避免测试相互污染真实 localStorage */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => map.delete(key),
    setItem: (key: string, value: string) => map.set(key, value),
  } as Storage
}

describe('本地备份', () => {
  it('只收集三份已知存档，空值与其他 key 会被忽略', () => {
    const storage = fakeStorage({
      'salary-calc:input': '{"a":1}',
      'salary-calc:settings': '',
      'salary-calc:table-schema': '{"columns":[]}',
      'other:key': 'x',
    })
    const snapshot = collectStorageSnapshot(storage)
    expect(Object.keys(snapshot).sort()).toEqual(
      ['salary-calc:input', 'salary-calc:table-schema'].sort(),
    )
    expect(BACKUP_KEYS).toHaveLength(3)
  })

  it('录入数据 key 缺失时视为主存档为空', () => {
    expect(isStorageEmpty(fakeStorage({ 'salary-calc:settings': '{}' }))).toBe(true)
    expect(isStorageEmpty(fakeStorage({ 'salary-calc:input': '{}' }))).toBe(false)
  })

  it('从未导出、超期或时间非法时都要提醒备份', () => {
    const now = new Date('2026-11-10T12:00:00')
    expect(needsBackupReminder('', now)).toBe(true)
    expect(needsBackupReminder('not-a-date', now)).toBe(true)
    expect(needsBackupReminder('2026-11-09T12:00:00', now)).toBe(false)
    const expired = new Date(now.getTime() - (BACKUP_REMIND_DAYS + 1) * 24 * 60 * 60 * 1000)
    expect(needsBackupReminder(expired.toISOString(), now)).toBe(true)
  })
})
