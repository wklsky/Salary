/**
 * @Author: wj
 * @FilePath: src/utils/id.ts
 * @Description: 生成稳定的唯一标识，用于收入项与动态列 key
 */
let seed = 0

export function createId(prefix: string): string {
  seed += 1
  return `${prefix}_${Date.now().toString(36)}_${seed.toString(36)}`
}
