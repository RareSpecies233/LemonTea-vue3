<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { callLemonPlugin, fetchLemonRuntimeStatus, installLemonPlugin, listLemonPlugins, startLemonPlugin, stopLemonPlugin, updateLemonRuntime, writeServerRuntimeBytesChunked } from '../api.js'
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
const runtimeInput = ref(null)
const runtimeFile = ref(null)
const runtimeUpdating = ref(false)
const runtimeState = ref({
  active: false,
  fileName: '',
  uploadedBytes: 0,
  totalBytes: 0,
  progress: 0,
  stage: 'idle',
  message: '等待操作',
  logs: ''
})
let runtimePollTimer = null

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

function chooseRuntimeFile() {
  runtimeInput.value?.click()
}

function handleRuntimeSelection(event) {
  runtimeFile.value = event.target.files?.[0] || null
  event.target.value = ''
}

function sanitizeFilename(name) {
  return String(name || 'lemontea')
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

function runtimeProgressForStage(stage, fallback = 75) {
  switch (stage) {
    case 'uploading':
      return runtimeState.value.progress || 0
    case 'scheduled':
      return 76
    case 'launcher_started':
      return 84
    case 'replacing_binary':
      return 90
    case 'binary_replaced':
      return 94
    case 'restarting':
      return 97
    case 'restart_launched':
      return 100
    case 'error':
      return runtimeState.value.progress || fallback
    default:
      return fallback
  }
}

function runtimeMessageForStage(stage) {
  switch (stage) {
    case 'uploading':
      return '正在上传 LemonTea 新程序'
    case 'scheduled':
      return 'LemonTea 更新已提交，等待重启'
    case 'launcher_started':
      return '已启动 LemonTea 更新脚本'
    case 'replacing_binary':
      return '正在替换 LemonTea 可执行程序'
    case 'binary_replaced':
      return '新版本已写入，准备重启'
    case 'restarting':
      return '正在拉起新的 LemonTea 进程'
    case 'restart_launched':
      return 'LemonTea 重启命令已发出'
    case 'error':
      return runtimeState.value.message || '更新失败'
    default:
      return '等待操作'
  }
}

function stopRuntimePolling() {
  if (runtimePollTimer) {
    clearInterval(runtimePollTimer)
    runtimePollTimer = null
  }
}

async function pollRuntimeStatus() {
  try {
    const data = await fetchLemonRuntimeStatus()
    const stage = data?.stage || 'scheduled'
    const logs = [data?.launcher_log_excerpt, data?.log_excerpt].filter(Boolean).join('\n')
    runtimeState.value = {
      ...runtimeState.value,
      active: stage !== 'restart_launched',
      stage,
      progress: runtimeProgressForStage(stage, runtimeState.value.progress),
      message: runtimeMessageForStage(stage),
      logs: logs || runtimeState.value.logs
    }
    if (stage === 'restart_launched') {
      stopRuntimePolling()
    }
  } catch (err) {
    runtimeState.value = {
      ...runtimeState.value,
      message: 'LemonTea 正在重启，等待服务恢复',
      progress: Math.max(runtimeState.value.progress, 92)
    }
  }
}

function startRuntimePolling() {
  stopRuntimePolling()
  pollRuntimeStatus()
  runtimePollTimer = window.setInterval(pollRuntimeStatus, 1500)
}

async function installRuntime() {
  if (!runtimeFile.value) {
    error.value = '请先选择 LemonTea 可执行程序'
    return
  }

  error.value = ''
  runtimeUpdating.value = true
  try {
    const bytes = new Uint8Array(await runtimeFile.value.arrayBuffer())
    const stageName = `${Date.now()}-${sanitizeFilename(runtimeFile.value.name)}`
    runtimeState.value = {
      active: true,
      fileName: runtimeFile.value.name,
      uploadedBytes: 0,
      totalBytes: bytes.length,
      progress: 0,
      stage: 'uploading',
      message: '正在上传 LemonTea 新程序',
      logs: ''
    }
    const stagedPath = await writeServerRuntimeBytesChunked(stageName, bytes, {
      onProgress(written, total) {
        runtimeState.value = {
          ...runtimeState.value,
          uploadedBytes: written,
          totalBytes: total,
          progress: Math.min(70, Math.round((written / Math.max(total, 1)) * 70)),
          stage: 'uploading',
          message: '正在上传 LemonTea 新程序'
        }
      }
    })
    runtimeState.value = {
      ...runtimeState.value,
      progress: 76,
      stage: 'scheduled',
      message: 'LemonTea 更新已提交，等待重启'
    }
    const payload = await updateLemonRuntime(runtimeFile.value.name, stagedPath)
    result.value = JSON.stringify(payload, null, 2)
    runtimeFile.value = null
    startRuntimePolling()
  } catch (err) {
    error.value = err.message
    runtimeState.value = {
      ...runtimeState.value,
      active: false,
      stage: 'error',
      message: err.message
    }
  } finally {
    runtimeUpdating.value = false
  }
}

async function restartLemonTea() {
  error.value = ''
  runtimeUpdating.value = true
  try {
    runtimeState.value = {
      active: true,
      fileName: 'lemontea',
      uploadedBytes: 0,
      totalBytes: 0,
      progress: 72,
      stage: 'scheduled',
      message: '正在请求 LemonTea 重启',
      logs: runtimeState.value.logs
    }
    const payload = await updateLemonRuntime('lemontea', '', true)
    result.value = JSON.stringify(payload, null, 2)
    startRuntimePolling()
  } catch (err) {
    error.value = err.message
    runtimeState.value = {
      ...runtimeState.value,
      active: false,
      stage: 'error',
      message: err.message
    }
  } finally {
    runtimeUpdating.value = false
  }
}

const runtimeTransferLabel = computed(() => {
  if (!runtimeState.value.totalBytes) {
    return '等待状态更新'
  }
  return `${formatBytes(runtimeState.value.uploadedBytes)} / ${formatBytes(runtimeState.value.totalBytes)}`
})

onBeforeUnmount(() => {
  stopRuntimePolling()
})

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
      <p class="eyebrow">LemonTea Runtime</p>
      <p class="muted">上传新的 LemonTea 可执行程序后，服务端会自动替换当前程序并重启。</p>
      <input ref="runtimeInput" type="file" class="hidden-file-input" @change="handleRuntimeSelection" />
      <div class="stack-actions">
        <button class="ghost-button" @click="chooseRuntimeFile">选择 LemonTea 可执行文件</button>
      </div>
      <div v-if="runtimeFile" class="plugin-install-summary">
        <strong>{{ runtimeFile.name }}</strong>
        <small>大小 {{ formatBytes(runtimeFile.size) }}</small>
      </div>
      <div class="stack-actions">
        <button class="danger-button" :disabled="runtimeUpdating || !runtimeFile" @click="installRuntime">
          {{ runtimeUpdating ? '更新中...' : '更新 LemonTea' }}
        </button>
        <button class="ghost-button" :disabled="runtimeUpdating" @click="restartLemonTea">
          {{ runtimeUpdating ? '处理中...' : '仅重启 LemonTea' }}
        </button>
        <button class="ghost-button" :disabled="runtimeUpdating" @click="pollRuntimeStatus">刷新状态</button>
      </div>
      <div class="plugin-install-summary">
        <strong>{{ runtimeState.message }}</strong>
        <small>{{ runtimeState.progress }}% · {{ runtimeTransferLabel }}</small>
        <div class="upload-progress-bar">
          <div class="upload-progress-bar-inner" :style="{ width: `${runtimeState.progress}%` }"></div>
        </div>
      </div>
      <div class="code-output">{{ runtimeState.logs || 'LemonTea 更新日志会显示在这里。' }}</div>
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