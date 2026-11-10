/**
 * @Author: wj
 * @FilePath: src/composables/useBackup.ts
 * @Description: 本地备份：把主存档自动同步到 IndexedDB，并在主存储被清空时提供恢复入口
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSalaryStore } from '@/stores/useSalaryStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSchemaStore } from '@/stores/useTableSchemaStore'
import {
  isStorageEmpty,
  loadBackup,
  needsBackupReminder,
  restoreBackup,
  saveBackup,
} from '@/core/backup'

/** 连续编辑时合并写入，避免每敲一个字符就碰一次 IndexedDB */
const SAVE_DEBOUNCE = 1200

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function useBackup() {
  const salaryStore = useSalaryStore()
  const settingsStore = useSettingsStore()
  const schemaStore = useTableSchemaStore()

  const lastBackupAt = ref('')
  /** 主存储为空、备份待确认时暂停自动写入，避免用默认数据覆盖有效备份 */
  const restorePending = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  const hasData = computed(
    () => salaryStore.incomes.length > 0 || salaryStore.schemes.length > 0,
  )

  /** 有数据，且距上次导出超过 BACKUP_REMIND_DAYS 天时提醒外部备份 */
  const backupDue = computed(
    () => hasData.value && needsBackupReminder(settingsStore.lastExportedAt),
  )

  /** 启动瞬间主存储是否为空：在 normalize 补默认值写回之前取值，否则永远不为空 */
  const storageWasEmpty = isStorageEmpty()

  async function writeBackup() {
    if (restorePending.value) return
    try {
      const record = await saveBackup()
      if (record) lastBackupAt.value = record.savedAt
    } catch {
      // 隐私模式或配额不足时静默失败，不影响主流程
    }
  }

  function scheduleBackup() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void writeBackup()
    }, SAVE_DEBOUNCE)
  }

  /** 手动恢复：从备份回写 localStorage 并刷新页面 */
  async function restoreFromBackup(): Promise<boolean> {
    const record = await loadBackup()
    if (!record || !Object.keys(record.keys).length) {
      ElMessage.info('还没有可恢复的本地备份')
      return false
    }
    try {
      await ElMessageBox.confirm(
        `备份时间：${formatTime(record.savedAt)}。恢复后当前录入会被覆盖，页面将自动刷新。`,
        '恢复本地备份',
        { confirmButtonText: '恢复', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return false
    }
    const count = restoreBackup(record)
    ElMessage.success(`已恢复 ${count} 份存档，正在刷新页面`)
    setTimeout(() => window.location.reload(), 300)
    return true
  }

  /** 启动时若主存储为空但备份仍在，提示恢复 */
  async function offerRestoreIfEmpty() {
    if (!storageWasEmpty) return
    const record = await loadBackup()
    if (!record || !Object.keys(record.keys).length) return
    lastBackupAt.value = record.savedAt
    restorePending.value = true
    try {
      await ElMessageBox.confirm(
        `检测到 ${formatTime(record.savedAt)} 的本地备份，但当前主数据已不存在（可能被浏览器清理）。是否恢复？`,
        '发现本地备份',
        { confirmButtonText: '恢复', cancelButtonText: '忽略', type: 'warning' },
      )
    } catch {
      // 用户选择忽略：保留备份，但不再阻止后续自动写入
      restorePending.value = false
      return
    }
    restoreBackup(record)
    window.location.reload()
  }

  onMounted(() => {
    if (storageWasEmpty) void offerRestoreIfEmpty()
  })

  const stopWatch = watch(
    [() => salaryStore.$state, () => settingsStore.$state, () => schemaStore.$state],
    scheduleBackup,
    { deep: true },
  )

  onBeforeUnmount(() => {
    stopWatch()
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  })

  return { backupDue, lastBackupAt, restoreFromBackup, writeBackup }
}
