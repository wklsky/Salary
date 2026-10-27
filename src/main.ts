/**
 * @Author: wj
 * @FilePath: src/main.ts
 * @Description: 应用入口：注册 Pinia 持久化、Element Plus 与全局样式
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import App from './App.vue'
import './styles/global.css'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).use(ElementPlus, { locale: zhCn }).mount('#app')
