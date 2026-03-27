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
    <div class="panel-card dashboard-hero-card">
      <div>
        <p class="eyebrow">Home</p>
        <h3>当前会话已连接到 {{ appState.clientId || '未选择客户端' }}</h3>
        <p class="muted">主页只保留四个核心控制入口和 Clients 列表，让主要操作集中、清爽、可快速切换。</p>
      </div>
      <div class="dashboard-hero-meta">
        <span class="status-pill">{{ appState.transportMode }}</span>
        <span class="header-chip">Clients {{ clients.length }}</span>
      </div>
    </div>

    <div class="dashboard-mini-stats">
      <div class="panel-card dashboard-stat-card">
        <p class="eyebrow">Client</p>
        <strong>{{ appState.clientId || '未选择' }}</strong>
      </div>
      <div class="panel-card dashboard-stat-card">
        <p class="eyebrow">Transport</p>
        <strong>{{ appState.transportMode }}</strong>
      </div>
      <div class="panel-card dashboard-stat-card">
        <p class="eyebrow">Visible Modules</p>
        <strong>4</strong>
      </div>
    </div>

    <div class="home-grid">
      <RouterLink v-for="card in cards" :key="card.to" :to="card.to" class="home-button-card dashboard-action-card">
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