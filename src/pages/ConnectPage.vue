<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { appState, connectClient } from '../api.js'

const router = useRouter()
const loading = ref(false)
const error = ref('')

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
</script>

<template>
  <section class="connect-card">
    <div class="connect-copy">
      <p class="eyebrow">Connect</p>
      <h1>先连接客户端，再进入主页。</h1>
      <p class="muted">
        输入客户端地址与客户端 ID。前端会先检查 LemonTea 服务端，再确认目标 HoneyTea 客户端是否在线，连接成功后进入主页。
      </p>
      <div class="connect-metrics">
        <div class="metric-card">
          <p class="eyebrow">Mode</p>
          <div class="metric-value">TCP / WebRTC</div>
          <p class="muted">按后端配置自动切换</p>
        </div>
        <div class="metric-card">
          <p class="eyebrow">Flow</p>
          <div class="metric-value metric-value-small">Connect → Home</div>
          <p class="muted">主页包含四个控制入口</p>
        </div>
      </div>
    </div>

    <form class="connect-form panel-card" @submit.prevent="submit">
      <p class="eyebrow">Session</p>
      <label class="field-label">
        <span>客户端地址</span>
        <input v-model="appState.baseUrl" class="text-input" placeholder="http://127.0.0.1:18080" />
      </label>
      <label class="field-label">
        <span>客户端 ID</span>
        <input v-model="appState.clientId" class="text-input" placeholder="raspi-dev-01" />
      </label>
      <p v-if="error" class="form-error">{{ error }}</p>
      <button class="primary-button wide-button" :disabled="loading" type="submit">
        {{ loading ? '连接中...' : '连接到客户端' }}
      </button>
    </form>
  </section>
</template>