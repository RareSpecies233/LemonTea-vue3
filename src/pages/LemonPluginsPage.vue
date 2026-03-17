<script setup>
import { ref } from 'vue'
import { callLemonPlugin, listLemonPlugins, startLemonPlugin, stopLemonPlugin } from '../api.js'

const plugins = ref([])
const selectedPlugin = ref('server_echo')
const action = ref('echo')
const payloadText = ref('{\n  "message": "hello from vue3"\n}')
const result = ref('')
const error = ref('')

async function refresh() {
  error.value = ''
  try {
    const payload = await listLemonPlugins()
    plugins.value = payload?.plugins || []
    if (plugins.value.length && !plugins.value.some((item) => item.name === selectedPlugin.value)) {
      selectedPlugin.value = plugins.value[0].name
    }
  } catch (err) {
    error.value = err.message
  }
}

async function invoke() {
  error.value = ''
  try {
    const payload = await callLemonPlugin(selectedPlugin.value, action.value, JSON.parse(payloadText.value || '{}'))
    result.value = JSON.stringify(payload, null, 2)
    await refresh()
  } catch (err) {
    error.value = err.message
  }
}

async function startPlugin(name) {
  await startLemonPlugin(name)
  await refresh()
}

async function stopPlugin(name) {
  await stopLemonPlugin(name)
  await refresh()
}

refresh()
</script>

<template>
  <section class="workspace-grid">
    <div class="plugin-card">
      <p class="eyebrow">LemonTea Plugins</p>
      <div class="stack-actions">
        <button class="primary-button" @click="refresh">刷新插件列表</button>
      </div>
      <p v-if="error" class="muted">{{ error }}</p>
      <div class="plugin-list">
        <div v-for="plugin in plugins" :key="plugin.name" class="list-item">
          <strong>{{ plugin.name }}</strong>
          <small>{{ plugin.description }}</small>
          <small>端口 {{ plugin.port }}</small>
          <div class="pill-row">
            <span class="mini-pill">{{ plugin.running ? '运行中' : '已停止' }}</span>
            <button class="ghost-button" @click="startPlugin(plugin.name)">启动</button>
            <button class="ghost-button" @click="stopPlugin(plugin.name)">停止</button>
          </div>
        </div>
      </div>
    </div>

    <div class="plugin-card">
      <p class="eyebrow">Server RPC</p>
      <label class="field-label">
        <span>插件</span>
        <select v-model="selectedPlugin" class="select-input">
          <option v-for="plugin in plugins" :key="plugin.name" :value="plugin.name">{{ plugin.name }}</option>
        </select>
      </label>
      <label class="field-label">
        <span>动作</span>
        <input v-model="action" class="text-input" />
      </label>
      <label class="field-label">
        <span>负载 JSON</span>
        <textarea v-model="payloadText" class="text-area"></textarea>
      </label>
      <div class="stack-actions">
        <button class="primary-button" @click="invoke">调用插件</button>
      </div>
      <div class="code-output">{{ result || '服务端插件返回结果会显示在这里。' }}</div>
    </div>
  </section>
</template>