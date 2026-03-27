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
  <section class="connect-minimal-shell">
    <form class="connect-minimal-card panel-card" @submit.prevent="submit">
      <p class="eyebrow">LemonTea</p>
      <h1>连接客户端</h1>
      <p class="muted">输入客户端连接地址和客户端 ID:</p>

      <label class="field-label">
        <span>客户端连接地址</span>
        <input v-model="appState.baseUrl" class="text-input" placeholder="http://127.0.0.1:18080" />
      </label>

      <label class="field-label">
        <span>客户端 ID</span>
        <input v-model="appState.clientId" class="text-input" placeholder="例如：黄智聪9169" />
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>
      <button class="primary-button wide-button" :disabled="loading" type="submit">
        {{ loading ? '连接中...' : '连接到客户端' }}
      </button>
    </form>
  </section>
</template>