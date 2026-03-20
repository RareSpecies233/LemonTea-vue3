import { createRouter, createWebHistory } from 'vue-router'
import { appState } from './api.js'
import ConnectPage from './pages/ConnectPage.vue'
import DashboardPage from './pages/DashboardPage.vue'
import ShellPage from './pages/ShellPage.vue'
import FilesPage from './pages/FilesPage.vue'
import HoneyPluginsPage from './pages/HoneyPluginsPage.vue'
import LemonPluginsPage from './pages/LemonPluginsPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/connect', name: 'connect', component: ConnectPage, meta: { title: '连接客户端' } },
    { path: '/', name: 'dashboard', component: DashboardPage, meta: { title: '主页', requiresConnection: true } },
    { path: '/shell', name: 'shell', component: ShellPage, meta: { title: 'SSH 控制', requiresConnection: true } },
    { path: '/files', name: 'files', component: FilesPage, meta: { title: '文件管理', requiresConnection: true } },
    { path: '/honey-plugins', name: 'honey-plugins', component: HoneyPluginsPage, meta: { title: 'HoneyTea 子进程管理', requiresConnection: true } },
    { path: '/lemon-plugins', name: 'lemon-plugins', component: LemonPluginsPage, meta: { title: 'LemonTea 子进程管理', requiresConnection: true } }
  ]
})

router.beforeEach((to) => {
  if (to.meta.requiresConnection && !appState.connected) {
    return { name: 'connect' }
  }
  if (to.name === 'connect' && appState.connected) {
    return { name: 'dashboard' }
  }
  return true
})

export default router