<script setup>
import { ref } from 'vue'
import { runShell } from '../api.js'

const command = ref('uname -a')
const output = ref('')
const loading = ref(false)
const error = ref('')

async function execute() {
  loading.value = true
  error.value = ''
  try {
    const payload = await runShell(command.value)
    output.value = payload?.data?.output || ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="terminal-card">
    <p class="eyebrow">SSH Control</p>
    <label class="field-label">
      <span>命令</span>
      <textarea v-model="command" class="text-area" placeholder="输入要在 HoneyTea 设备上执行的命令"></textarea>
    </label>
    <div class="stack-actions">
      <button class="primary-button" :disabled="loading" @click="execute">{{ loading ? '执行中...' : '执行命令' }}</button>
    </div>
    <p v-if="error" class="muted">{{ error }}</p>
    <div class="terminal-output">{{ output || '输出会显示在这里。' }}</div>
  </section>
</template>