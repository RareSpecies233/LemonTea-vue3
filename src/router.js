import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from './pages/DashboardPage.vue'
import ShellPage from './pages/ShellPage.vue'
import FilesPage from './pages/FilesPage.vue'
import HoneyPluginsPage from './pages/HoneyPluginsPage.vue'
import LemonPluginsPage from './pages/LemonPluginsPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardPage },
    { path: '/shell', name: 'shell', component: ShellPage },
    { path: '/files', name: 'files', component: FilesPage },
    { path: '/honey-plugins', name: 'honey-plugins', component: HoneyPluginsPage },
    { path: '/lemon-plugins', name: 'lemon-plugins', component: LemonPluginsPage }
  ]
})

export default router