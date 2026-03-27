<script setup>
import { ref } from 'vue'
import { callHoneyPlugin, installHoneyPlugin, listHoneyPlugins, startHoneyPlugin, stopHoneyPlugin, updateHoneyFirmware, writeFileBytesChunked } from '../api.js'
import { buildPluginPackage } from '../plugin-package.js'

const plugins = ref([])
const selectedPlugin = ref('camera')
const action = ref('get_status')
const payloadText = ref('{}')
const result = ref('')
const error = ref('')
const packageInput = ref(null)
const directoryInput = ref(null)
const selectedPackage = ref(null)
const replaceExisting = ref(false)
const installing = ref(false)
const firmwareInput = ref(null)
const firmwareFile = ref(null)
const firmwareUpdating = ref(false)

async function refresh() {
  error.value = ''
  try {
    const payload = await listHoneyPlugins()
    plugins.value = payload?.data || []
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
    const payload = await callHoneyPlugin(selectedPlugin.value, action.value, JSON.parse(payloadText.value || '{}'))
    result.value = JSON.stringify(payload, null, 2)
    await refresh()
  } catch (err) {
    error.value = err.message
  }
}

async function startPlugin(name) {
  await startHoneyPlugin(name)
  await refresh()
}

async function stopPlugin(name) {
  await stopHoneyPlugin(name)
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
    const payload = await installHoneyPlugin(
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

function chooseFirmware() {
  firmwareInput.value?.click()
}

function handleFirmwareSelection(event) {
  firmwareFile.value = event.target.files?.[0] || null
  event.target.value = ''
}

function sanitizeFilename(name) {
  return String(name || 'honeytea')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120)
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) {
    return '—'
  }
  if (value < 1024) {
    return `${value} B`
  }
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = -1
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
}

async function installFirmware() {
  if (!firmwareFile.value) {
    error.value = '请先选择 HoneyTea 可执行程序'
    return
  }

  error.value = ''
  firmwareUpdating.value = true
  try {
    const bytes = new Uint8Array(await firmwareFile.value.arrayBuffer())
    const stagedPath = `~/.honeytea-fw/${Date.now()}-${sanitizeFilename(firmwareFile.value.name)}`
    await writeFileBytesChunked(stagedPath, bytes)
    const payload = await updateHoneyFirmware(firmwareFile.value.name, '', stagedPath)
    result.value = JSON.stringify(payload, null, 2)
    firmwareFile.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    firmwareUpdating.value = false
  }
}

refresh()
</script>

<template>
  <section class="workspace-grid">
    <div class="plugin-card">
      <p class="eyebrow">HoneyTea Plugins</p>
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
      <p class="muted">上传 manifest 与脚本文件后，HoneyTea 会把插件安装到托管目录并按规范识别。</p>
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
          {{ installing ? '安装中...' : '安装到 HoneyTea' }}
        </button>
      </div>
      <div class="plugin-guideline-note">
        <strong>识别规范</strong>
        <small>必须包含 manifest，且至少声明 name、script、port。</small>
        <small>script 必须是相对路径，且所有附带文件都必须位于插件目录内部。</small>
      </div>
    </div>

    <div class="plugin-card">
      <p class="eyebrow">Firmware Update</p>
      <p class="muted">上传新的 HoneyTea 可执行程序后，客户端会自动替换当前程序并重启。</p>
      <input ref="firmwareInput" type="file" class="hidden-file-input" @change="handleFirmwareSelection" />
      <div class="stack-actions">
        <button class="ghost-button" @click="chooseFirmware">选择 HoneyTea 可执行文件</button>
      </div>
      <div v-if="firmwareFile" class="plugin-install-summary">
        <strong>{{ firmwareFile.name }}</strong>
        <small>大小 {{ formatBytes(firmwareFile.size) }}</small>
      </div>
      <div class="stack-actions">
        <button class="danger-button" :disabled="firmwareUpdating || !firmwareFile" @click="installFirmware">
          {{ firmwareUpdating ? '更新中...' : '更新 HoneyTea 固件' }}
        </button>
      </div>
      <div class="plugin-guideline-note">
        <strong>说明</strong>
        <small>更新成功后 HoneyTea 会短暂断开连接，随后使用新程序自动拉起。</small>
      </div>
    </div>

    <div class="plugin-card">
      <p class="eyebrow">Plugin RPC</p>
      <label class="field-label">
        <span>插件</span>
        <select v-model="selectedPlugin" class="select-input">
          <option v-for="plugin in plugins" :key="plugin.name" :value="plugin.name">{{ plugin.name }}</option>
        </select>
      </label>
      <label class="field-label">
        <span>动作</span>
        <input v-model="action" class="text-input" placeholder="get_status / read / capture_once" />
      </label>
      <label class="field-label">
        <span>负载 JSON</span>
        <textarea v-model="payloadText" class="text-area"></textarea>
      </label>
      <div class="stack-actions">
        <button class="primary-button" @click="invoke">调用插件</button>
      </div>
      <div class="code-output">{{ result || '插件返回结果会显示在这里。' }}</div>
    </div>
  </section>
</template>