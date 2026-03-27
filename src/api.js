import { reactive, watch } from 'vue'

const initialBaseUrl = localStorage.getItem('lemontea.baseUrl') || 'http://127.0.0.1:18080'
const initialClientId = localStorage.getItem('lemontea.clientId') || ''

export const appState = reactive({
  baseUrl: initialBaseUrl,
  clientId: initialClientId,
  connected: false,
  transportMode: 'unknown',
  availableClients: [],
  remoteRoot: '',
  lastHealth: null
})

watch(
  () => appState.baseUrl,
  (value) => localStorage.setItem('lemontea.baseUrl', value)
)

watch(
  () => appState.clientId,
  (value) => localStorage.setItem('lemontea.clientId', value)
)

function updateHealthState(payload) {
  appState.transportMode = payload.transport_mode || 'unknown'
  appState.availableClients = Array.isArray(payload.clients) ? payload.clients : []
  appState.lastHealth = payload
  return payload
}

function clientApiPath(suffix) {
  return `/api/clients/${encodeURIComponent(appState.clientId)}/${suffix}`
}

async function request(path, options = {}) {
  const response = await fetch(`${appState.baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  })

  const text = await response.text()
  let payload = {}
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { message: text }
    }
  }
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `HTTP ${response.status}`)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export async function fetchHealth() {
  return updateHealthState(await request('/health'))
}

export async function connectClient() {
  const clientId = appState.clientId.trim()
  if (!appState.baseUrl.trim()) {
    throw new Error('请输入客户端地址')
  }
  if (!clientId) {
    throw new Error('请选择客户端 ID')
  }

  await fetchHealth()
  const hasClient = appState.availableClients.some((client) => client.client_id === clientId)
  if (!hasClient) {
    const knownClients = appState.availableClients.map((client) => client.client_id).join('、') || '无'
    throw new Error(`目标客户端未连接到服务端，当前可用客户端：${knownClients}`)
  }

  appState.connected = true
}

export function disconnectClient() {
  appState.connected = false
}

export function buildWebSocketUrl(path) {
  const url = new URL(path, appState.baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function listClients() {
  return request('/api/clients')
}

export function runShell(command, options = {}) {
  return request(clientApiPath('shell'), {
    method: 'POST',
    body: JSON.stringify({ command }),
    signal: options.signal
  })
}

export async function listFiles(path = '') {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  const payload = await request(`${clientApiPath('files')}${query}`)
  if (payload?.data?.root) {
    appState.remoteRoot = payload.data.root
  }
  return payload
}

export function readFile(path) {
  return request(`${clientApiPath('file')}?path=${encodeURIComponent(path)}`)
}

export function writeFile(path, contentBase64) {
  return request(clientApiPath('file/write'), {
    method: 'POST',
    body: JSON.stringify({ path, content_base64: contentBase64 })
  })
}

export function createDirectory(path) {
  return request(clientApiPath('directory/create'), {
    method: 'POST',
    body: JSON.stringify({ path })
  })
}

export function renamePath(oldPath, newPath) {
  return request(clientApiPath('path/rename'), {
    method: 'POST',
    body: JSON.stringify({ old_path: oldPath, new_path: newPath })
  })
}

export function deletePath(path, recursive = true) {
  return request(clientApiPath('path/delete'), {
    method: 'POST',
    body: JSON.stringify({ path, recursive })
  })
}

export function listHoneyPlugins() {
  return request(clientApiPath('plugins'))
}

export function callHoneyPlugin(pluginName, action, payload = {}) {
  return request(`${clientApiPath(`plugins/${pluginName}/call`)}`, {
    method: 'POST',
    body: JSON.stringify({ action, payload })
  })
}

export function startHoneyPlugin(pluginName) {
  return request(`${clientApiPath(`plugins/${pluginName}/start`)}`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function stopHoneyPlugin(pluginName) {
  return request(`${clientApiPath(`plugins/${pluginName}/stop`)}`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function installHoneyPlugin(manifest, files, replace = false) {
  return request(clientApiPath('plugins/install'), {
    method: 'POST',
    body: JSON.stringify({ manifest, files, replace })
  })
}

export function updateHoneyFirmware(filename, contentBase64) {
  return request(clientApiPath('firmware'), {
    method: 'POST',
    body: JSON.stringify({ filename, content_base64: contentBase64 })
  })
}

export function listLemonPlugins() {
  return request('/api/server/plugins')
}

export function callLemonPlugin(pluginName, action, payload = {}) {
  return request(`/api/server/plugins/${pluginName}/call`, {
    method: 'POST',
    body: JSON.stringify({ action, payload })
  })
}

export function startLemonPlugin(pluginName) {
  return request(`/api/server/plugins/${pluginName}/start`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function stopLemonPlugin(pluginName) {
  return request(`/api/server/plugins/${pluginName}/stop`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function installLemonPlugin(manifest, files, replace = false) {
  return request('/api/server/plugins/install', {
    method: 'POST',
    body: JSON.stringify({ manifest, files, replace })
  })
}

export function encodeBase64(content) {
  const bytes = new TextEncoder().encode(content)
  return encodeBytesBase64(bytes)
}

export function encodeBytesBase64(bytes) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

export function decodeBase64(content) {
  return new TextDecoder().decode(decodeBase64ToBytes(content))
}

export function decodeBase64ToBytes(content) {
  const binary = atob(content)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}