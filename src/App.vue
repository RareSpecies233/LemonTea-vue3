<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { appState, disconnectClient, fetchHealth } from './api.js'
import router from './router.js'

const route = useRoute()
const loading = ref(false)
const error = ref('')
const disconnectedNotice = ref('')
let healthTimer = null

const navItems = [
  { to: '/shell', label: 'SSH 控制', short: 'SSH' },
  { to: '/files', label: '文件管理', short: '文件' },
  { to: '/lemon-plugins', label: 'LemonTea 子进程管理', short: 'Lemon' },
  { to: '/honey-plugins', label: 'HoneyTea 子进程管理', short: 'Honey' }
]

const health = computed(() => appState.lastHealth)
const isConnectPage = computed(() => route.name === 'connect')

function isCurrentClientAlive(payload) {
  const clients = Array.isArray(payload?.clients) ? payload.clients : []
  return clients.some((client) => client.client_id === appState.clientId && client.connected !== false)
}

function handleUnexpectedDisconnect() {
  if (disconnectedNotice.value) {
    return
  }
  disconnectedNotice.value = '连接已断开'
  disconnectClient()
  router.push({ name: 'connect' })
}

async function refreshHealth(options = {}) {
  if (!appState.connected) {
    return
  }
  loading.value = true
  if (!options.silent) {
    error.value = ''
  }
  try {
    const payload = await fetchHealth()
    if (!isCurrentClientAlive(payload)) {
      throw new Error('request timeout for client: ' + appState.clientId)
    }
  } catch (err) {
    handleUnexpectedDisconnect()
    if (!options.silent) {
      error.value = err.message
    }
  } finally {
    loading.value = false
  }
}

function leaveSession() {
  disconnectedNotice.value = ''
  disconnectClient()
  router.push({ name: 'connect' })
}

function dismissDisconnectedNotice() {
  disconnectedNotice.value = ''
}

function stopHealthTimer() {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }
}

function startHealthTimer() {
  stopHealthTimer()
  healthTimer = setInterval(() => {
    refreshHealth({ silent: true })
  }, 5000)
}

watch(
  () => appState.connected,
  (connected) => {
    if (connected) {
      startHealthTimer()
      refreshHealth({ silent: true })
    } else {
      stopHealthTimer()
    }
  },
  { immediate: true }
)

onBeforeUnmount(stopHealthTimer)
</script>

<template>
  <div class="workspace-shell">
    <header class="workspace-header panel-card">
      <div class="workspace-status">
        <span class="status-pill" :class="{ 'status-pill-offline': !appState.connected }">{{ appState.connected ? (health?.transport_mode || appState.transportMode || 'unknown') : 'offline' }}</span>
        <span class="header-chip" :title="appState.clientId || '未连接'">{{ appState.clientId || '未连接' }}</span>
        <span class="header-chip" :title="appState.baseUrl">{{ appState.baseUrl }}</span>
      </div>
      <nav class="workspace-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :title="item.label"
          class="workspace-nav-link workspace-nav-action"
          :class="{ active: route.path === item.to, disabled: !appState.connected }"
          @click.prevent="!appState.connected"
        >
          {{ item.short }}
        </RouterLink>
        <button class="workspace-nav-action" :disabled="loading || !appState.connected" @click="refreshHealth">{{ loading ? '刷新中...' : '刷新' }}</button>
        <button class="workspace-nav-action" :disabled="!appState.connected" @click="leaveSession">断开</button>
      </nav>
    </header>

    <p v-if="error" class="workspace-error">{{ error }}</p>

    <main class="workspace-main" :class="{ 'workspace-main-connect': isConnectPage }">
      <RouterView :health="health" @refresh-health="refreshHealth" />
    </main>

    <div v-if="disconnectedNotice" class="connection-dialog-mask">
      <div class="connection-dialog-card panel-card">
        <p class="eyebrow">连接状态</p>
        <h3>连接已断开</h3>
        <p class="muted">请先确认 HoneyTea 与 LemonTea 在线，再重新连接。</p>
        <div class="stack-actions">
          <button class="primary-button" @click="dismissDisconnectedNotice">我知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>