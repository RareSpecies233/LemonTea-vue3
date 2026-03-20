<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { appState, disconnectClient, fetchHealth } from './api.js'
import router from './router.js'

const route = useRoute()
const loading = ref(false)
const error = ref('')

const navItems = [
  { to: '/', label: '主页', note: '控制台总览' },
  { to: '/shell', label: 'SSH 控制', note: '远程命令执行' },
  { to: '/files', label: '文件管理', note: '浏览与写入' },
  { to: '/honey-plugins', label: 'HoneyTea 子进程', note: '客户端插件管理' },
  { to: '/lemon-plugins', label: 'LemonTea 子进程', note: '服务端插件管理' }
]

const health = computed(() => appState.lastHealth)
const pageTitle = computed(() => route.meta.title || navItems.find((item) => item.to === route.path)?.label || 'LemonTea Console')
const pageNote = computed(() => navItems.find((item) => item.to === route.path)?.note || '面向 HoneyTea / LemonTea 的远程控制界面')
const isConnectPage = computed(() => route.name === 'connect')

async function refreshHealth() {
  if (!appState.connected) {
    return
  }
  loading.value = true
  error.value = ''
  try {
    await fetchHealth()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function leaveSession() {
  disconnectClient()
  router.push({ name: 'connect' })
}

onMounted(() => {
  if (appState.connected) {
    refreshHealth()
  }
})
</script>

<template>
  <div v-if="isConnectPage" class="connect-shell">
    <RouterView />
  </div>

  <div v-else class="app-shell">
    <header class="app-header">
      <div class="brand-card brand-inline">
        <div>
          <p class="eyebrow">LemonTea Remote Console</p>
          <h1>柠檬茶终端</h1>
        </div>
        <p class="muted">已连接到 {{ appState.clientId }}，通过 {{ health?.transport_mode || appState.transportMode }} 模式通讯。</p>
      </div>

      <div class="header-actions">
        <div class="status-card compact-card">
          <div>
            <span class="status-pill">{{ health?.status || 'connected' }}</span>
            <span class="status-transport">{{ health?.transport_mode || appState.transportMode }}</span>
          </div>
          <p class="muted">{{ error || `在线客户端 ${health?.clients?.length ?? 0} 个` }}</p>
        </div>
        <button class="ghost-button" :disabled="loading" @click="refreshHealth">{{ loading ? '刷新中...' : '刷新状态' }}</button>
        <button class="danger-button" @click="leaveSession">断开连接</button>
      </div>
    </header>

    <div class="app-body">
      <nav class="nav-strip">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: route.path === item.to }"
        >
          <span>{{ item.label }}</span>
          <small>{{ item.note }}</small>
        </RouterLink>
      </nav>

      <main class="content-panel">
        <header class="page-header">
          <div>
            <p class="eyebrow">Control Surface</p>
            <h2>{{ pageTitle }}</h2>
            <p class="muted">{{ pageNote }}</p>
          </div>
          <div class="page-meta">
            <span>{{ appState.baseUrl }}</span>
            <span>Client {{ appState.clientId }}</span>
          </div>
        </header>
        <RouterView :health="health" @refresh-health="refreshHealth" />
      </main>
    </div>
  </div>
</template>