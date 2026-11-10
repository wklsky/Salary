/**
 * @Author: wj
 * @FilePath: vite.config.ts
 * @Description: Vite 构建配置，配置路径别名与图表/UI 库分包
 */
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 生产构建注入 CSP：只允许同源脚本执行，避免第三方注入后读取本地存档。
 * Element Plus 会把样式注入为 <style>，因此 style-src 必须保留 'unsafe-inline'；
 * 开发模式不注入，否则 Vite 的 HMR 与内联脚本会被拦。
 */
function cspPlugin(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
  return {
    name: 'salary-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ],
    },
  }
}

export default defineConfig({
  plugins: [vue(), cspPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 只监听本机，避免开发服务器暴露到局域网；手机调试时可临时用 `pnpm dev --host` 覆盖
    host: '127.0.0.1',
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
