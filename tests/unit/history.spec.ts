/**
 * @Author: wj
 * @FilePath: tests/unit/history.spec.ts
 * @Description: 撤销/重做合并窗口与历史栈行为测试
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useHistory } from '@/composables/useHistory'
import { useSalaryStore } from '@/stores/useSalaryStore'

describe('撤销/重做', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('连续输入合并成一步，可撤销后再重做', async () => {
    const history = useHistory()
    const store = useSalaryStore()
    const id = store.incomes[0].id

    // 三次连续修改落在同一个 300ms 合并窗口内
    store.updateIncome(id, { amount: 1000 })
    await nextTick()
    store.updateIncome(id, { amount: 5000 })
    await nextTick()
    store.updateIncome(id, { amount: 8000 })
    await nextTick()

    expect(history.canUndo.value).toBe(false)
    vi.advanceTimersByTime(400)
    await nextTick()
    expect(history.canUndo.value).toBe(true)

    history.undo()
    expect(store.incomes[0].amount).toBe(0)
    expect(history.canRedo.value).toBe(true)

    history.redo()
    expect(store.incomes[0].amount).toBe(8000)
  })

  it('没有历史时不执行撤销', () => {
    const history = useHistory()
    expect(history.undo()).toBe(false)
  })

  it('撤销后新的修改会清空重做栈', async () => {
    const history = useHistory()
    const store = useSalaryStore()
    const id = store.incomes[0].id

    store.updateIncome(id, { amount: 3000 })
    await nextTick()
    vi.advanceTimersByTime(400)
    await nextTick()

    history.undo()
    expect(history.canRedo.value).toBe(true)

    store.updateIncome(id, { amount: 6000 })
    await nextTick()
    vi.advanceTimersByTime(400)
    await nextTick()

    expect(history.canRedo.value).toBe(false)
  })
})
