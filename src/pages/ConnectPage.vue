<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { appState, connectClient, fetchHealth } from '../api.js'

const router = useRouter()
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')

const availableClients = computed(() => appState.availableClients)
const selectedClient = computed(() => availableClients.value.find((client) => client.client_id === appState.clientId) || null)

async function refreshClients() {
  refreshing.value = true
  error.value = ''
  try {
    await fetchHealth()
  } catch (err) {
    error.value = err.message
  } finally {
    refreshing.value = false
  }
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await connectClient()
    router.push({ name: 'dashboard' })
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshClients()
})
</script>

<template>
  <section class="connect-layout">
    <article class="connect-card connect-card-copy connect-hero-card">
      <div class="connect-copy">
        <div class="connect-hero-head">
          <div>
            <p class="eyebrow">Connect</p>
            <h1>先确认链路，再进入控制台。</h1>
          </div>
          <span class="connect-hero-badge">{{ appState.transportMode }}</span>
        </div>
        <p class="muted connect-lead">
          连接页会先探测 LemonTea 服务端，再从在线 HoneyTea 客户端列表中选择目标设备，避免手动输入错误的客户端 ID，同时让当前链路状态一眼可见。
        </p>
        <div class="connect-metrics">
          <div class="metric-card connect-metric-card">
            <p class="eyebrow">Mode</p>
            <div class="metric-value">TCP / WebRTC</div>
            <p class="muted">按后端配置自动切换</p>
          </div>
          <div class="metric-card connect-metric-card">
            <p class="eyebrow">Clients</p>
            <div class="metric-value">{{ availableClients.length }}</div>
            <p class="muted">当前从服务端探测到的在线客户端</p>
          </div>
          <div class="metric-card connect-metric-card">
            <p class="eyebrow">Flow</p>
            <div class="metric-value metric-value-small">Connect → Home</div>
            <p class="muted">连接成功后进入四个主控制入口</p>
          </div>
        </div>
        <div class="connect-feature-grid">
          <div class="connect-feature panel-card">
            <strong>建议流程</strong>
            <p class="muted">先确认服务端地址可访问，再刷新客户端列表，最后选择目标设备。</p>
          </div>
          <div class="connect-feature panel-card">
            <strong>默认行为</strong>
            <p class="muted">若当前已选客户端离线，界面会自动切换到新的在线客户端。</p>
          </div>
        </div>
        <div class="connect-client-wall panel-card">
          <div class="connect-wall-header">
            <div>
              <p class="eyebrow">Detected Clients</p>
              <strong>在线客户端</strong>
            </div>
            <small class="muted">点击右侧表单中的下拉框即可选择</small>
          </div>
          <div class="connect-client-grid">
            <div v-for="client in availableClients" :key="client.client_id" class="connect-client-chip" :class="{ active: client.client_id === appState.clientId }">
              <strong>{{ client.client_id }}</strong>
              <span>{{ client.transport || 'unknown' }}</span>
              <small>{{ client.connected ? '在线' : '离线' }}</small>
            </div>
            <div v-if="!availableClients.length" class="connect-client-empty">尚未发现在线客户端，请先启动 HoneyTea。</div>
          </div>
        </div>
      </div>
    </article>

    <form class="connect-form panel-card connect-form-card" @submit.prevent="submit">
      <div class="connect-form-header">
        <div>
          <p class="eyebrow">Session</p>
          <h2>建立本次远程控制会话</h2>
        </div>
        <button class="ghost-button" type="button" :disabled="refreshing" @click="refreshClients">
          {{ refreshing ? '刷新中...' : '刷新客户端' }}
        </button>
      </div>

      <label class="field-label">
        <span>客户端地址</span>
        <input v-model="appState.baseUrl" class="text-input" placeholder="http://127.0.0.1:18080" />
      </label>

      <label class="field-label">
        <span>客户端 ID</span>
        <select v-model="appState.clientId" class="select-input">
          <option disabled value="">请选择在线客户端</option>
          <option v-for="client in availableClients" :key="client.client_id" :value="client.client_id">
            {{ client.client_id }} · {{ client.transport || 'unknown' }} · {{ client.connected ? '在线' : '离线' }}
          </option>
        </select>
      </label>

      <div class="connect-client-hint">
        <strong>当前可选客户端</strong>
        <p class="muted">
          {{ availableClients.length ? '从下拉框选择目标客户端即可连接。' : '尚未发现在线客户端，请先启动 HoneyTea 并点击刷新客户端。' }}
        </p>
      </div>

      <div v-if="selectedClient" class="connect-selected-card">
        <p class="eyebrow">Selected</p>
        <strong>{{ selectedClient.client_id }}</strong>
        <div class="connect-selected-meta">
          <span>{{ selectedClient.transport || 'unknown' }}</span>
          <span>{{ selectedClient.connected ? '在线' : '离线' }}</span>
          <span>{{ selectedClient.last_seen || '等待心跳' }}</span>
        </div>
      </div>

      <p v-if="error" class="form-error">{{ error }}</p>
      <button class="primary-button wide-button" :disabled="loading || refreshing || !availableClients.length" type="submit">
        {{ loading ? '连接中...' : '连接到客户端' }}
      </button>
    </form>
  </section>
</template>