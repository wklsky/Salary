/**
 * @Author: wj
 * @FilePath: src/composables/useTheme.ts
 * @Description: 主题切换：把 settingsStore 的主题同步到 <html data-theme> 与浏览器状态栏颜色
 */
import { computed, watch } from 'vue'
import { useSettingsStore, type ThemeMode } from '@/stores/useSettingsStore'

/** 深浅色两种状态栏颜色，移动端浏览器地址栏会跟着变色 */
const THEME_COLOR: Record<ThemeMode, string> = {
  light: '#16233a',
  dark: '#0f1622',
}

export function useTheme() {
  const settingsStore = useSettingsStore()

  const isDark = computed(() => settingsStore.theme === 'dark')

  function applyTheme(mode: ThemeMode) {
    document.documentElement.dataset.theme = mode
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', THEME_COLOR[mode])
  }

  // 只在 App 里调用一次，immediate 保证首帧就是正确主题，不闪白
  watch(
    () => settingsStore.theme,
    (mode) => applyTheme(mode),
    { immediate: true },
  )

  function toggleTheme() {
    settingsStore.updateSettings({ theme: isDark.value ? 'light' : 'dark' })
  }

  return { isDark, toggleTheme }
}
