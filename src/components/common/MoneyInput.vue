<script setup lang="ts">
/**
 * @Author: wj
 * @FilePath: src/components/common/MoneyInput.vue
 * @Description: 金额输入组件，统一精度、步长与边界控制
 */
import { computed } from 'vue'

interface Props {
  /** 当前金额，单位元 */
  modelValue: number
  /** 最小金额，默认不允许为负 */
  min?: number
  /** 最大金额 */
  max?: number
  /** 步进值 */
  step?: number
  /** 小数位数，金额默认保留到分 */
  precision?: number
  /** 组件尺寸 */
  size?: 'large' | 'default' | 'small'
  /** 是否禁用 */
  disabled?: boolean
  /** 占位文案 */
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 99999999,
  step: 100,
  precision: 2,
  size: 'default',
  disabled: false,
  placeholder: '请输入金额',
})

/**
 * 对外事件
 * @event update:model-value 金额变化时触发，回传 { value: number } 的裸数值（单位元）
 */
const emit = defineEmits<{
  'update:model-value': [value: number]
}>()

const innerValue = computed({
  get: () => props.modelValue,
  // 输入框清空时 Element Plus 会回传 undefined，统一兜底为 0 避免下游出现 NaN
  set: (value: number) => emit('update:model-value', Number.isFinite(value) ? value : 0),
})
</script>

<template>
  <el-input-number
    v-model="innerValue"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :precision="props.precision"
    :size="props.size"
    :disabled="props.disabled"
    :placeholder="props.placeholder"
    :value-on-clear="0"
    controls-position="right"
    class="money-input"
  />
</template>

<style scoped>
.money-input {
  width: 100%;
}
</style>
