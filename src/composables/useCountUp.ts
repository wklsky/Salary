/**
 * @Author: wj
 * @FilePath: src/composables/useCountUp.ts
 * @Description: 数字滚动动效：首次挂载时从 0 滚到目标值，之后直接跟随源值
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** 尊重系统的"减少动态效果"设置 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

const DURATION = 450

/**
 * 把源数值映射为带动效的展示值。
 * 只在首次赋值时从 0 滚动到目标值；之后的变更直接同步，
 * 避免用户在输入框打字时数字反复滚动造成干扰。
 */
export function useCountUp(source: Ref<number>): Ref<number> {
  const display = ref(0)
  let rafId = 0
  let animated = false

  const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

  function animateTo(target: number): void {
    const from = display.value
    const delta = target - from
    if (prefersReducedMotion() || Math.abs(delta) < 1e-6) {
      display.value = target
      return
    }
    const start = performance.now()
    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / DURATION)
      display.value = from + delta * easeOutCubic(progress)
      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        display.value = target
      }
    }
    rafId = requestAnimationFrame(step)
  }

  watch(
    source,
    (value) => {
      if (!animated) {
        animated = true
        animateTo(value)
      } else {
        cancelAnimationFrame(rafId)
        display.value = value
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => cancelAnimationFrame(rafId))

  return display
}
