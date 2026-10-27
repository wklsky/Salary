/**
 * @Author: wj
 * @FilePath: vite.config.ts
 * @Description: Vite 构建配置，配置路径别名与图表/UI 库分包
 */
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 图表与 UI 库体积较大且非首屏必需，单独分包避免阻塞首屏渲染
        manualChunks: {
          echarts: ['echarts', 'vue-echarts'],
          ui: ['element-plus'],
        },
      },
    },
  },
})
