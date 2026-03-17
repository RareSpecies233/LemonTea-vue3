<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { appState, fetchHealth } from './api.js'

const route = useRoute()
const health = ref(null)
const loading = ref(false)
const error = ref('')

const navItems = [
  { to: '/', label: '主页', note: '控制台总览' },
  { to: '/shell', label: 'SSH 控制', note: '远程命令执行' },
  { to: '/files', label: '文件管理', note: '浏览与写入' },
  { to: '/honey-plugins', label: 'HoneyTea 子进程', note: '客户端插件管理' },
  { to: '/lemon-plugins', label: 'LemonTea 子进程', note: '服务端插件管理' }
]

const pageTitle = computed(() => navItems.find((item) => item.to === route.path)?.label || 'LemonTea Console')

async function refreshHealth() {
  loading.value = true
  error.value = ''
  try {
    health.value = await fetchHealth()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(refreshHealth)
</script>

<template>
  <div class="shell-layout">
    <aside class="sidebar">
      <div class="brand-card">
        <p class="eyebrow">LemonTea Remote Console</p>
        <h1>茶台</h1>
        <p class="muted">为 LemonTea / HoneyTea 测试原型准备的远程控制界面。</p>
      </div>

      <label class="field-label">
        <span>服务端地址</span>
        <input v-model="appState.baseUrl" class="text-input" placeholder="http://127.0.0.1:18080" />
      </label>

      <label class="field-label">
        <span>客户端 ID</span>
        <input v-model="appState.clientId" class="text-input" placeholder="raspi-dev-01" />
      </label>

      <button class="primary-button" :disabled="loading" @click="refreshHealth">
        {{ loading ? '刷新中...' : '刷新状态' }}
      </button>

      <div class="status-card">
        <div>
          <span class="status-pill">{{ health?.status || 'unknown' }}</span>
          <span class="status-transport">{{ health?.transport_mode || appState.transportMode }}</span>
        </div>
        <p class="muted">{{ error || `已连接客户端 ${health?.clients?.length ?? 0} 个` }}</p>
      </div>

      <nav class="nav-list">
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
    </aside>

    <main class="content-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">Control Surface</p>
          <h2>{{ pageTitle }}</h2>
        </div>
        <div class="page-meta">
          <span>Transport {{ health?.transport_mode || appState.transportMode }}</span>
          <span>Client {{ appState.clientId }}</span>
        </div>
      </header>
      <RouterView :health="health" @refresh-health="refreshHealth" />
    </main>
  </div>
</template>