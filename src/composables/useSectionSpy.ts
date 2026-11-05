/**
 * @Author: wj
 * @FilePath: src/composables/useSectionSpy.ts
 * @Description: 页面分区滚动监听，用于侧边栏目录高亮当前所在板块
 */
import { onBeforeUnmount, onMounted } from 'vue'

export interface SectionSpyOptions {
  /** 分区 DOM id 列表，与 keys 一一对应 */
  getIds: () => string[]
  /** 分区标识列表，用于回传当前激活项 */
  getKeys: () => string[]
  /** 激活项变化回调 */
  onChange: (key: string) => void
  /** 滚动容器选择器，默认取应用内容区 */
  rootSelector?: string
  /** 判定分区到顶的偏移量，留出顶部呼吸空间 */
  offset?: number
}

/**
 * 监听内容区滚动，计算当前视口最上方的分区
 * 使用 rAF 节流避免滚动时频繁计算布局；滚动到底部时强制高亮最后一个分区
 */
export function useSectionSpy(options: SectionSpyOptions) {
  let root: HTMLElement | null = null
  let frame = 0
  let lastKey = ''

  function emitChange(key: string) {
    if (!key || key === lastKey) return
    lastKey = key
    options.onChange(key)
  }

  function update() {
    frame = 0
    if (!root) root = document.querySelector<HTMLElement>(options.rootSelector ?? '[data-scroll-root]')
    if (!root) return

    const ids = options.getIds()
    const keys = options.getKeys()
    if (ids.length === 0 || keys.length === 0) return

    const rootTop = root.getBoundingClientRect().top
    const offset = options.offset ?? 48
    let current = keys[0]

    ids.forEach((id, index) => {
      const element = document.getElementById(id)
      if (!element) return
      if (element.getBoundingClientRect().top - rootTop <= offset) {
        current = keys[index] ?? current
      }
    })

    // 页面滚到底时，最后一屏可能无法把最后一个分区顶到阈值上方
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
      current = keys[keys.length - 1] ?? current
    }

    if (current) emitChange(current)
  }

  function onScroll() {
    if (frame) return
    frame = requestAnimationFrame(update)
  }

  function onResize() {
    onScroll()
  }

  onMounted(() => {
    root = document.querySelector<HTMLElement>(options.rootSelector ?? '[data-scroll-root]')
    root?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    requestAnimationFrame(update)
  })

  onBeforeUnmount(() => {
    root?.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    if (frame) cancelAnimationFrame(frame)
  })

  return { update }
}
