<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { appState, disconnectClient, fetchHealth } from './api.js'
import router from './router.js'

const route = useRoute()
const loading = ref(false)
const error = ref('')

const navItems = [
  { to: '/shell', label: 'SSH 控制' },
  { to: '/files', label: '文件管理' },
  { to: '/lemon-plugins', label: 'LemonTea 子进程管理' },
  { to: '/honey-plugins', label: 'HoneyTea 子进程管理' }
]

const health = computed(() => appState.lastHealth)
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

  <div v-else class="workspace-shell">
    <header class="workspace-header panel-card">
      <div class="workspace-status">
        <span class="status-pill">{{ health?.transport_mode || appState.transportMode || 'unknown' }}</span>
        <span class="header-chip">{{ appState.clientId }}</span>
        <span class="header-chip">{{ appState.baseUrl }}</span>
      </div>
      <nav class="workspace-nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="workspace-nav-link" :class="{ active: route.path === item.to }">
          {{ item.label }}
        </RouterLink>
        <button class="ghost-button" :disabled="loading" @click="refreshHealth">{{ loading ? '刷新中...' : '刷新' }}</button>
        <button class="danger-button" @click="leaveSession">断开</button>
      </nav>
    </header>

    <p v-if="error" class="workspace-error">{{ error }}</p>

    <main class="workspace-main">
      <RouterView :health="health" @refresh-health="refreshHealth" />
    </main>
  </div>
</template>