/**
 * @Author: wj
 * @FilePath: src/composables/useTheme.ts
 * @Description: 主题切换：把 settingsStore 的主题同步到 <html data-theme> 与浏览器状态栏颜色
 */
import { computed, onBeforeUnmount, watch } from 'vue'
import { useSettingsStore } from '@/stores/useSettingsStore'

/** 深浅色两种状态栏颜色，移动端浏览器地址栏会跟着变色 */
const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#eef4fa',
  dark: '#04070d',
}

/** 跟随系统：读取操作系统的深色偏好 */
function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

export function useTheme() {
  const settingsStore = useSettingsStore()
  const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined

  /** 实际生效的深浅色：跟随系统时取系统偏好 */
  const resolvedTheme = computed<'light' | 'dark'>(() => {
    if (settingsStore.theme === 'system') return systemPrefersDark() ? 'dark' : 'light'
    return settingsStore.theme
  })

  const isDark = computed(() => resolvedTheme.value === 'dark')
  const isSystem = computed(() => settingsStore.theme === 'system')

  function applyTheme(mode: 'light' | 'dark') {
    document.documentElement.dataset.theme = mode
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', THEME_COLOR[mode])
  }

  // 只在 App 里调用一次，immediate 保证首帧就是正确主题，不闪白
  watch(resolvedTheme, (mode) => applyTheme(mode), { immediate: true })

  // 选了「跟随系统」时，系统深浅色变化要即时跟随
  const onSystemThemeChange = () => {
    if (settingsStore.theme === 'system') applyTheme(systemPrefersDark() ? 'dark' : 'light')
  }
  media?.addEventListener?.('change', onSystemThemeChange)
  onBeforeUnmount(() => media?.removeEventListener?.('change', onSystemThemeChange))

  /** 手动切换会覆盖「跟随系统」，落在明确的浅色 / 深色上 */
  function toggleTheme() {
    settingsStore.updateSettings({ theme: isDark.value ? 'light' : 'dark' })
  }

  function useSystemTheme() {
    settingsStore.updateSettings({ theme: 'system' })
  }

  return { isDark, isSystem, resolvedTheme, toggleTheme, useSystemTheme }
}
