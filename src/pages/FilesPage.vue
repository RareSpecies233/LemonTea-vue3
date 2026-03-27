<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import RemoteTerminal from '../components/RemoteTerminal.vue'
import { decodeBase64ToBytes, deletePath, listFiles, readFile, renamePath } from '../api.js'

const loading = ref(false)
const actionLoading = ref(false)
const error = ref('')
const currentPath = ref('')
const rootPath = ref('/')
const items = ref([])
const directoryWarnings = ref([])
const selectedItem = ref(null)
const recentPaths = ref([])
const locationInput = ref('~')
const contextMenu = ref({ visible: false, x: 0, y: 0, entry: null })
const terminalPanel = ref({ visible: false, cwd: '~', title: '终端' })
const dialog = ref({ visible: false, type: '', title: '', value: '', entry: null })

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.is_directory !== right.is_directory) {
      return left.is_directory ? -1 : 1
    }
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
  })
}

function normalizePath(path) {
  if (!path || path === '.') {
    return '/'
  }
  return path
}

function basename(path) {
  if (!path || path === '/') {
    return '/'
  }
  return path.split('/').filter(Boolean).pop() || path
}

function parentPath(path) {
  if (!path || path === '/' || path === '~') {
    return '/'
  }
  const normalized = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join('/')}` : '/'
}

function joinPath(base, name) {
  if (!base || base === '/') {
    return `/${name}`
  }
  return `${base.replace(/\/$/, '')}/${name}`
}

function rememberPath(path) {
  const normalized = normalizePath(path)
  recentPaths.value = [normalized, ...recentPaths.value.filter((item) => item !== normalized)].slice(0, 8)
}

async function browse(path = currentPath.value || '~') {
  loading.value = true
  error.value = ''
  try {
    const payload = await listFiles(path)
    const data = payload?.data || {}
    rootPath.value = normalizePath(data.root || '/')
    currentPath.value = normalizePath(data.path || path || '/')
    directoryWarnings.value = Array.isArray(data.warnings) ? data.warnings : []
    locationInput.value = currentPath.value
    items.value = sortEntries(data.entries || [])
    rememberPath(currentPath.value)
    if (selectedItem.value) {
      selectedItem.value = items.value.find((entry) => entry.path === selectedItem.value.path) || null
    }
  } catch (err) {
    directoryWarnings.value = []
    error.value = err.status === 504 ? '客户端连接超时，当前无法完成文件请求，请检查 HoneyTea 与 LemonTea 的连接状态。' : err.message
  } finally {
    loading.value = false
  }
}

async function activateEntry(entry) {
  selectedItem.value = entry
  closeContextMenu()
  if (entry.is_directory) {
    await browse(entry.path)
  }
}

function openContextMenu(event, entry = null) {
  event.preventDefault()
  if (entry) {
    selectedItem.value = entry
  }
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    entry
  }
}

function closeContextMenu() {
  contextMenu.value = { visible: false, x: 0, y: 0, entry: null }
}

function openTerminalAt(path, label) {
  terminalPanel.value = {
    visible: true,
    cwd: path,
    title: `终端 · ${label}`
  }
  closeContextMenu()
}

async function downloadEntry(entry = selectedItem.value) {
  if (!entry || entry.is_directory) {
    return
  }
  actionLoading.value = true
  error.value = ''
  try {
    const payload = await readFile(entry.path)
    const bytes = decodeBase64ToBytes(payload?.data?.content_base64 || '')
    const blob = new Blob([bytes])
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = entry.name
    link.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    error.value = err.message
  } finally {
    actionLoading.value = false
    closeContextMenu()
  }
}

function openDialog(type, entry = null) {
  if (type === 'rename' && entry) {
    dialog.value = { visible: true, type, title: '重命名', value: entry.name, entry }
  } else if (type === 'delete' && entry) {
    dialog.value = { visible: true, type, title: '删除确认', value: entry.name, entry }
  }
  closeContextMenu()
}

function closeDialog() {
  dialog.value = { visible: false, type: '', title: '', value: '', entry: null }
}

async function submitDialog() {
  actionLoading.value = true
  error.value = ''
  try {
    if (dialog.value.type === 'rename' && dialog.value.entry) {
      await renamePath(dialog.value.entry.path, joinPath(parentPath(dialog.value.entry.path), dialog.value.value.trim()))
    } else if (dialog.value.type === 'delete' && dialog.value.entry) {
      await deletePath(dialog.value.entry.path, true)
      if (selectedItem.value?.path === dialog.value.entry.path) {
        selectedItem.value = null
      }
    }
    closeDialog()
    await browse(currentPath.value)
  } catch (err) {
    error.value = err.message
  } finally {
    actionLoading.value = false
  }
}

function handleGlobalClick() {
  closeContextMenu()
}

async function submitLocation() {
  await browse(locationInput.value.trim() || '/')
}

const favoriteItems = computed(() => {
  const favorites = [
    { label: 'Home', path: '~', description: '用户主目录' },
    { label: 'Root', path: '/', description: '文件系统根目录' },
    { label: '启动目录', path: rootPath.value, description: 'HoneyTea 启动目录' }
  ]

  recentPaths.value
    .filter((path) => path && path !== currentPath.value && !favorites.some((item) => item.path === path))
    .forEach((path) => favorites.push({ label: basename(path), path, description: path }))

  return favorites
})
const canDownload = computed(() => selectedItem.value && !selectedItem.value.is_directory)
const canRename = computed(() => Boolean(selectedItem.value))
const canDelete = computed(() => Boolean(selectedItem.value))
const itemCountLabel = computed(() => `${items.value.length} 个项目`)
const explorerRows = computed(() => items.value)
const selectedSummary = computed(() => {
  if (!selectedItem.value) {
    return null
  }
  return {
    title: selectedItem.value.name,
    type: selectedItem.value.is_directory ? '目录' : '文件',
    size: selectedItem.value.is_directory ? '—' : `${selectedItem.value.size} bytes`,
    path: selectedItem.value.path
  }
})

onMounted(async () => {
  window.addEventListener('click', handleGlobalClick)
  await browse('~')
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick)
})
</script>

<template>
  <section class="file-workspace">
    <aside class="file-sidebar panel-card">
      <div>
        <p class="eyebrow">快捷访问</p>
        <div class="file-shortcut-list">
          <button v-for="favorite in favoriteItems" :key="favorite.path + favorite.label" class="file-shortcut-item" @click="browse(favorite.path)">
            <span>{{ favorite.label }}</span>
            <small>{{ favorite.description }}</small>
          </button>
        </div>
      </div>

      <div class="file-sidebar-footer">
        <p class="eyebrow">当前选择</p>
        <div v-if="selectedSummary" class="file-selection-card">
          <strong>{{ selectedSummary.title }}</strong>
          <small>{{ selectedSummary.type }}</small>
          <small>{{ selectedSummary.size }}</small>
          <small>{{ selectedSummary.path }}</small>
        </div>
        <div v-else class="file-selection-empty">选择文件或目录后，这里会显示当前项目信息。</div>
      </div>
    </aside>

    <div class="file-main panel-card" @contextmenu="openContextMenu($event, null)">
      <header class="file-main-header">
        <div>
          <p class="eyebrow">文件管理</p>
          <h2>浏览远程文件</h2>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" :disabled="currentPath === '/'" @click="browse(parentPath(currentPath))">上一级</button>
          <button class="ghost-button" :disabled="loading" @click="browse(currentPath)">{{ loading ? '读取中...' : '刷新' }}</button>
          <button class="ghost-button" :disabled="!selectedItem?.is_directory" @click="selectedItem && openTerminalAt(selectedItem.path, selectedItem.name)">在此处打开终端</button>
        </div>
      </header>

      <form class="file-location-bar" @submit.prevent="submitLocation">
        <input v-model="locationInput" class="text-input" placeholder="输入 ~/、/home、/tmp 等路径" />
        <button class="primary-button" type="submit">进入</button>
      </form>

      <div class="file-status-bar">
        <span class="header-chip">当前目录 {{ currentPath }}</span>
        <span class="header-chip">启动目录 {{ rootPath }}</span>
        <span class="header-chip">{{ itemCountLabel }}</span>
      </div>

      <div v-if="error" class="finder-alert finder-alert-error">
        <strong>文件请求失败</strong>
        <p class="muted">{{ error }}</p>
      </div>

      <div v-if="directoryWarnings.length" class="finder-alert finder-alert-warning">
        <strong>目录部分条目不可读</strong>
        <p class="muted">已跳过 {{ directoryWarnings.length }} 个异常条目，当前目录其余内容仍可继续浏览。</p>
      </div>

      <div class="file-explorer">
        <div class="file-explorer-head">
          <span>名称</span>
          <span>类型</span>
          <span>大小</span>
        </div>
        <button
          v-for="entry in explorerRows"
          :key="entry.path"
          class="file-row"
          :class="{ active: selectedItem?.path === entry.path }"
          @click="selectedItem = entry"
          @dblclick="activateEntry(entry)"
          @contextmenu="openContextMenu($event, entry)"
        >
          <span class="file-row-name">
            <span>{{ entry.is_directory ? '📁' : '📄' }}</span>
            <span>{{ entry.name }}</span>
          </span>
          <span>{{ entry.is_directory ? '目录' : '文件' }}</span>
          <span>{{ entry.is_directory ? '—' : `${entry.size} bytes` }}</span>
        </button>

        <div v-if="!explorerRows.length && !loading" class="finder-empty-state finder-empty-state-inline">
          <strong>当前目录为空</strong>
          <p class="muted">你可以切换到其他目录继续浏览。</p>
        </div>
      </div>

      <div
        v-if="contextMenu.visible"
        class="finder-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <button v-if="contextMenu.entry?.is_directory" class="finder-context-item" @click="openTerminalAt(contextMenu.entry.path, contextMenu.entry.name)">在此处打开终端</button>
        <button v-if="contextMenu.entry?.is_directory" class="finder-context-item" @click="activateEntry(contextMenu.entry)">进入目录</button>
        <button v-if="contextMenu.entry && !contextMenu.entry.is_directory" class="finder-context-item" @click="downloadEntry(contextMenu.entry)">下载文件</button>
        <button v-if="contextMenu.entry" class="finder-context-item" @click="openDialog('rename', contextMenu.entry)">重命名</button>
        <button v-if="contextMenu.entry" class="finder-context-item" @click="openDialog('delete', contextMenu.entry)">删除</button>
        <button class="finder-context-item" @click="browse(currentPath)">刷新目录</button>
      </div>

      <div v-if="terminalPanel.visible" class="terminal-modal">
        <div class="terminal-modal-card">
          <div class="terminal-modal-header">
            <div>
              <p class="eyebrow">Embedded Terminal</p>
              <strong>{{ terminalPanel.title }}</strong>
            </div>
            <button class="ghost-button" @click="terminalPanel.visible = false">关闭</button>
          </div>
          <RemoteTerminal :key="terminalPanel.cwd" :title="terminalPanel.title" :initial-cwd="terminalPanel.cwd" compact />
        </div>
      </div>

      <div v-if="dialog.visible" class="finder-dialog-mask">
        <div class="finder-dialog-card">
          <p class="eyebrow">Action</p>
          <h3>{{ dialog.title }}</h3>

          <template v-if="dialog.type === 'delete'">
            <p class="muted">将删除 {{ dialog.value }}。目录会递归删除，请确认。</p>
          </template>
          <template v-else>
            <label class="field-label">
              <span>新名称</span>
              <input v-model="dialog.value" class="text-input" />
            </label>
          </template>

          <div class="stack-actions">
            <button class="primary-button" :disabled="actionLoading || (!dialog.value.trim() && dialog.type !== 'delete')" @click="submitDialog">
              {{ actionLoading ? '处理中...' : '确认' }}
            </button>
            <button class="ghost-button" :disabled="actionLoading" @click="closeDialog">取消</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>