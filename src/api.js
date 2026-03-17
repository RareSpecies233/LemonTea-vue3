import { reactive, watch } from 'vue'

const initialBaseUrl = localStorage.getItem('lemontea.baseUrl') || 'http://127.0.0.1:18080'
const initialClientId = localStorage.getItem('lemontea.clientId') || 'raspi-dev-01'

export const appState = reactive({
  baseUrl: initialBaseUrl,
  clientId: initialClientId,
  transportMode: 'unknown'
})

watch(
  () => appState.baseUrl,
  (value) => localStorage.setItem('lemontea.baseUrl', value)
)

watch(
  () => appState.clientId,
  (value) => localStorage.setItem('lemontea.clientId', value)
)

async function request(path, options = {}) {
  const response = await fetch(`${appState.baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `HTTP ${response.status}`)
  }
  return payload
}

export async function fetchHealth() {
  const payload = await request('/health')
  appState.transportMode = payload.transport_mode || 'unknown'
  return payload
}

export function listClients() {
  return request('/api/clients')
}

export function runShell(command) {
  return request(`/api/clients/${appState.clientId}/shell`, {
    method: 'POST',
    body: JSON.stringify({ command })
  })
}

export function listFiles(path = '') {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  return request(`/api/clients/${appState.clientId}/files${query}`)
}

export function readFile(path) {
  return request(`/api/clients/${appState.clientId}/file?path=${encodeURIComponent(path)}`)
}

export function writeFile(path, contentBase64) {
  return request(`/api/clients/${appState.clientId}/file/write`, {
    method: 'POST',
    body: JSON.stringify({ path, content_base64: contentBase64 })
  })
}

export function listHoneyPlugins() {
  return request(`/api/clients/${appState.clientId}/plugins`)
}

export function callHoneyPlugin(pluginName, action, payload = {}) {
  return request(`/api/clients/${appState.clientId}/plugins/${pluginName}/call`, {
    method: 'POST',
    body: JSON.stringify({ action, payload })
  })
}

export function startHoneyPlugin(pluginName) {
  return request(`/api/clients/${appState.clientId}/plugins/${pluginName}/start`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function stopHoneyPlugin(pluginName) {
  return request(`/api/clients/${appState.clientId}/plugins/${pluginName}/stop`, {
    method: 'POST',
    body: JSON.stringify({})
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

export function encodeBase64(content) {
  return btoa(unescape(encodeURIComponent(content)))
}

export function decodeBase64(content) {
  return decodeURIComponent(escape(atob(content)))
}