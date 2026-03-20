<script setup>
import { ref } from 'vue'
import { callLemonPlugin, installLemonPlugin, listLemonPlugins, startLemonPlugin, stopLemonPlugin } from '../api.js'
import { buildPluginPackage } from '../plugin-package.js'

const plugins = ref([])
const selectedPlugin = ref('server_echo')
const action = ref('echo')
const payloadText = ref(`{
  "message": "hello from vue3"
}`)
const result = ref('')
const error = ref('')
const packageInput = ref(null)
const directoryInput = ref(null)
const selectedPackage = ref(null)
const replaceExisting = ref(false)
const installing = ref(false)

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

function chooseFiles() {
  packageInput.value?.click()
}

function chooseDirectory() {
  directoryInput.value?.click()
}

async function handleSelection(event) {
  error.value = ''
  try {
    selectedPackage.value = await buildPluginPackage(event.target.files)
  } catch (err) {
    selectedPackage.value = null
    error.value = err.message
  } finally {
    event.target.value = ''
  }
}

async function installPackage() {
  if (!selectedPackage.value) {
    error.value = '请先选择插件文件或目录'
    return
  }

  error.value = ''
  installing.value = true
  try {
    const payload = await installLemonPlugin(
      selectedPackage.value.manifest,
      selectedPackage.value.files,
      replaceExisting.value
    )
    result.value = JSON.stringify(payload, null, 2)
    selectedPackage.value = null
    await refresh()
  } catch (err) {
    error.value = err.message
  } finally {
    installing.value = false
  }
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
          <small>版本 {{ plugin.version || '1.0.0' }} · 端口 {{ plugin.port }}</small>
          <small>协议 v{{ plugin.protocol_version || 1 }} · {{ (plugin.capabilities || []).join(' / ') || '无声明能力' }}</small>
          <div class="pill-row">
            <span class="mini-pill">{{ plugin.running ? '运行中' : '已停止' }}</span>
            <button class="ghost-button" @click="startPlugin(plugin.name)">启动</button>
            <button class="ghost-button" @click="stopPlugin(plugin.name)">停止</button>
          </div>
        </div>
      </div>
    </div>

    <div class="plugin-card">
      <p class="eyebrow">Install Package</p>
      <p class="muted">上传服务端插件包后，LemonTea 会将其安装到托管目录，并纳入前端可识别列表。</p>
      <input ref="packageInput" type="file" multiple class="hidden-file-input" @change="handleSelection" />
      <input ref="directoryInput" type="file" multiple webkitdirectory directory class="hidden-file-input" @change="handleSelection" />
      <div class="stack-actions">
        <button class="ghost-button" @click="chooseFiles">选择插件文件</button>
        <button class="ghost-button" @click="chooseDirectory">选择插件目录</button>
      </div>
      <div v-if="selectedPackage" class="plugin-install-summary">
        <strong>{{ selectedPackage.summary.name }}</strong>
        <small>版本 {{ selectedPackage.summary.version }}</small>
        <small>入口 {{ selectedPackage.summary.entry }}</small>
        <small>附带文件 {{ selectedPackage.summary.fileCount }}</small>
      </div>
      <label class="plugin-check">
        <input v-model="replaceExisting" type="checkbox" />
        <span>如果同名插件已存在，则覆盖安装</span>
      </label>
      <div class="stack-actions">
        <button class="primary-button" :disabled="installing || !selectedPackage" @click="installPackage">
          {{ installing ? '安装中...' : '安装到 LemonTea' }}
        </button>
      </div>
      <div class="plugin-guideline-note">
        <strong>识别规范</strong>
        <small>manifest 必须声明 name、script、port，可选 version、capabilities、protocol_version。</small>
        <small>所有附带文件必须通过同一次上传提交，且路径不能越出插件目录。</small>
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