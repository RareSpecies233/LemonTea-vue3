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
  { to: '/shell', title: 'SSH 控制', subtitle: '远程执行命令与查看标准输出' },
  { to: '/files', title: '文件管理', subtitle: '浏览目录、读取文件、写入文件' },
  { to: '/honey-plugins', title: 'HoneyTea 子进程', subtitle: '管理客户端插件与硬件能力' },
  { to: '/lemon-plugins', title: 'LemonTea 子进程', subtitle: '管理服务端插件与中转能力' }
]
</script>

<template>
  <section class="dashboard-grid">
    <div class="hero-card">
      <div class="hero-copy">
        <p class="eyebrow">Overview</p>
        <h3>远程控制链路已经集中到一个图形化入口。</h3>
        <p class="muted">
          当前目标客户端为 {{ appState.clientId }}，后端地址为 {{ appState.baseUrl }}。
          你可以从这里进入 SSH、文件管理、HoneyTea 子进程管理和 LemonTea 子进程管理四个界面。
        </p>
        <div class="metrics-grid">
          <div class="metric-card">
            <p class="eyebrow">Transport</p>
            <div class="metric-value">{{ health?.transport_mode || 'unknown' }}</div>
            <p class="muted">按配置选择 TCP / WebRTC</p>
          </div>
          <div class="metric-card">
            <p class="eyebrow">Clients</p>
            <div class="metric-value">{{ clients.length }}</div>
            <p class="muted">当前已注册的 HoneyTea 客户端</p>
          </div>
        </div>
      </div>
      <div class="hero-panel">
        <p class="eyebrow">Quick Access</p>
        <div class="plugin-list">
          <RouterLink v-for="card in cards" :key="card.to" :to="card.to" class="nav-link">
            <span>{{ card.title }}</span>
            <small>{{ card.subtitle }}</small>
          </RouterLink>
        </div>
      </div>
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
          <small>先启动 LemonTea 与 HoneyTea 再刷新状态。</small>
        </div>
      </div>
    </div>
  </section>
</template>