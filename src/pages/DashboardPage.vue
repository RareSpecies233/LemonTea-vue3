<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { appState } from '../api.js'

const props = defineProps({
  health: {
    type: Object,
    default: null
  }
})

const clients = computed(() => props.health?.clients || [])

const cards = [
  { to: '/shell', title: 'SSH 控制', subtitle: '打开终端式远程控制界面', glyph: '⌘' },
  { to: '/files', title: '文件管理', subtitle: '以 Finder 风格浏览客户端目录', glyph: '▣' },
  { to: '/lemon-plugins', title: 'LemonTea 子进程管理', subtitle: '查看与调用服务端插件', glyph: 'L' },
  { to: '/honey-plugins', title: 'HoneyTea 子进程管理', subtitle: '管理客户端硬件插件与子进程', glyph: 'H' }
]
</script>

<template>
  <section class="dashboard-stack">
    <div class="hero-card hero-card-wide">
      <div class="hero-copy">
        <p class="eyebrow">Home</p>
        <h3>连接已经建立，接下来选择一个控制面板。</h3>
        <p class="muted">
          当前客户端为 {{ appState.clientId }}，前端通过 {{ appState.baseUrl }} 与 LemonTea 服务端通讯，
          再由服务端转发到 HoneyTea 客户端。
        </p>
      </div>
      <div class="metrics-grid">
        <div class="metric-card">
          <p class="eyebrow">Transport</p>
          <div class="metric-value">{{ health?.transport_mode || 'unknown' }}</div>
          <p class="muted">TCP / WebRTC 双模式</p>
        </div>
        <div class="metric-card">
          <p class="eyebrow">Target</p>
          <div class="metric-value metric-value-small">{{ appState.clientId }}</div>
          <p class="muted">当前连接的 HoneyTea 客户端</p>
        </div>
        <div class="metric-card">
          <p class="eyebrow">Clients</p>
          <div class="metric-value">{{ clients.length }}</div>
          <p class="muted">已注册到 LemonTea 的客户端数量</p>
        </div>
      </div>
    </div>

    <div class="home-grid">
      <RouterLink v-for="card in cards" :key="card.to" :to="card.to" class="home-button-card">
        <div class="home-button-glyph">{{ card.glyph }}</div>
        <div>
          <strong>{{ card.title }}</strong>
          <p class="muted">{{ card.subtitle }}</p>
        </div>
      </RouterLink>
    </div>

    <div class="panel-card">
      <p class="eyebrow">Clients</p>
      <div class="client-list">
        <div v-for="client in clients" :key="client.client_id" class="list-item">
          <strong>{{ client.client_id }}</strong>
          <span>状态 {{ client.connected ? '已连接' : '已断开' }}</span>
          <small>传输模式 {{ client.transport || 'unknown' }}</small>
          <small>最后心跳 {{ client.last_seen }}</small>
        </div>
        <div v-if="!clients.length" class="list-item">
          <strong>暂无客户端</strong>
          <small>先启动 LemonTea 与 HoneyTea，再回到右上角刷新状态。</small>
        </div>
      </div>
    </div>
  </section>
</template>