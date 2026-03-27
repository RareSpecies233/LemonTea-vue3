<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import RemoteTerminal from '../components/RemoteTerminal.vue'
import {
  createDirectory,
  decodeBase64ToBytes,
  deletePath,
  encodeBytesBase64,
  listFiles,
  readFile,
  renamePath,
  writeFile
} from '../api.js'

const loading = ref(false)
const actionLoading = ref(false)
const error = ref('')
const viewMode = ref('icons')
const currentPath = ref('')
const rootPath = ref('/')
const items = ref([])
const directoryWarnings = ref([])
const selectedItem = ref(null)
const recentPaths = ref([])
const expandedPaths = ref(new Set())
const treeCache = reactive({})
const dragActive = ref(false)
const fileInput = ref(null)
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

async function ensureCached(path) {
  const normalized = normalizePath(path)
  if (treeCache[normalized]) {
    return treeCache[normalized]
  }
  const payload = await listFiles(normalized)
  const data = payload?.data || {}
  const targetPath = normalizePath(data.path || normalized)
  const entries = sortEntries(data.entries || [])
  treeCache[targetPath] = entries
  return entries
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
    treeCache[currentPath.value] = items.value
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

async function toggleExpand(entry) {
  const next = new Set(expandedPaths.value)
  if (next.has(entry.path)) {
    next.delete(entry.path)
    expandedPaths.value = next
    return
  }
  await ensureCached(entry.path)
  next.add(entry.path)
  expandedPaths.value = next
}

function flattenRows(path, depth = 0) {
  const source = path === currentPath.value ? items.value : treeCache[path] || []
  return source.flatMap((entry) => {
    const rows = [{ ...entry, depth }]
    if (entry.is_directory && expandedPaths.value.has(entry.path) && treeCache[entry.path]) {
      rows.push(...flattenRows(entry.path, depth + 1))
    }
    return rows
  })
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

function triggerUpload() {
  fileInput.value?.click()
  closeContextMenu()
}

async function handleUploadSelection(event) {
  const files = Array.from(event.target.files || [])
  await uploadFiles(files)
  event.target.value = ''
}

async function uploadFiles(files) {
  if (!files.length) {
    return
  }
  actionLoading.value = true
  error.value = ''
  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await writeFile(joinPath(currentPath.value, file.name), encodeBytesBase64(bytes))
    }
    await browse(currentPath.value)
  } catch (err) {
    error.value = err.message
  } finally {
    actionLoading.value = false
    dragActive.value = false
  }
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
  if (type === 'mkdir') {
    dialog.value = { visible: true, type, title: '新建文件夹', value: '', entry: null }
  } else if (type === 'rename' && entry) {
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
    if (dialog.value.type === 'mkdir') {
      await createDirectory(joinPath(currentPath.value, dialog.value.value.trim()))
    } else if (dialog.value.type === 'rename' && dialog.value.entry) {
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

function onDragEnter(event) {
  event.preventDefault()
  dragActive.value = true
}

function onDragOver(event) {
  event.preventDefault()
  dragActive.value = true
}

function onDragLeave(event) {
  event.preventDefault()
  if (event.currentTarget === event.target) {
    dragActive.value = false
  }
}

async function onDrop(event) {
  event.preventDefault()
  const files = Array.from(event.dataTransfer?.files || [])
  await uploadFiles(files)
}

function handleGlobalClick() {
  closeContextMenu()
}

async function submitLocation() {
  await browse(locationInput.value.trim() || '/')
}

const rowItems = computed(() => flattenRows(currentPath.value))
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
const columnPaths = computed(() => {
  if (!currentPath.value || currentPath.value === '/') {
    return ['/']
  }
  const segments = currentPath.value.split('/').filter(Boolean)
  const paths = ['/']
  let cursor = ''
  segments.forEach((segment) => {
    cursor = `${cursor}/${segment}`
    paths.push(cursor)
  })
  return paths
})
const columns = computed(() => columnPaths.value.map((path) => ({
  path,
  entries: path === currentPath.value ? items.value : treeCache[path] || []
})))
const canDownload = computed(() => selectedItem.value && !selectedItem.value.is_directory)
const canRename = computed(() => Boolean(selectedItem.value))
const canDelete = computed(() => Boolean(selectedItem.value))
const itemCountLabel = computed(() => `${items.value.length} 个项目`)
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

watch(viewMode, async (mode) => {
  if (mode !== 'columns') {
    return
  }
  for (const path of columnPaths.value) {
    await ensureCached(path)
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
  <section class="finder-shell finder-shell-rich">
    <input ref="fileInput" type="file" multiple class="hidden-file-input" @change="handleUploadSelection" />

    <aside class="finder-sidebar panel-card">
      <div>
        <p class="eyebrow">收藏</p>
        <div class="finder-favorites">
          <button v-for="favorite in favoriteItems" :key="favorite.path + favorite.label" class="finder-favorite" @click="browse(favorite.path)">
            <span>{{ favorite.label }}</span>
            <small>{{ favorite.description }}</small>
          </button>
        </div>
      </div>

      <div class="finder-sidebar-footer finder-sidebar-footer-stack">
        <p class="eyebrow">已选项目</p>
        <div v-if="selectedSummary" class="finder-selection-card">
          <strong>{{ selectedSummary.title }}</strong>
          <small>{{ selectedSummary.type }}</small>
          <small>{{ selectedSummary.size }}</small>
          <small>{{ selectedSummary.path }}</small>
        </div>
        <div v-else class="preview-placeholder">选择文件或目录后，会在这里显示基本信息与可执行动作。</div>
      </div>
    </aside>

    <div
      class="finder-main panel-card"
      @contextmenu="openContextMenu($event, null)"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <header class="finder-toolbar finder-toolbar-rich">
        <div class="finder-window-controls">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" :disabled="currentPath === '/'" @click="browse(parentPath(currentPath))">上一级</button>
          <button class="ghost-button" :disabled="loading" @click="browse(currentPath)">{{ loading ? '读取中...' : '刷新' }}</button>
          <button class="ghost-button" @click="triggerUpload">上传文件</button>
          <button class="ghost-button" @click="openDialog('mkdir')">新建文件夹</button>
        </div>
        <div class="view-switcher">
          <button class="mode-button" :class="{ active: viewMode === 'icons' }" @click="viewMode = 'icons'">图标</button>
          <button class="mode-button" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">列表</button>
          <button class="mode-button" :class="{ active: viewMode === 'columns' }" @click="viewMode = 'columns'">分栏</button>
        </div>
      </header>

      <div class="finder-action-bar finder-action-bar-wrap">
        <form class="finder-location-form" @submit.prevent="submitLocation">
          <label class="field-label finder-location-field">
            <span>地址栏</span>
            <input v-model="locationInput" class="text-input" placeholder="输入 ~/、/Users、/tmp 等路径" />
          </label>
          <button class="primary-button" type="submit">进入</button>
        </form>
        <div class="inline-actions">
          <button class="ghost-button" :disabled="!selectedItem?.is_directory" @click="selectedItem && openTerminalAt(selectedItem.path, selectedItem.name)">打开终端</button>
          <button class="ghost-button" :disabled="!canDownload || actionLoading" @click="downloadEntry()">下载</button>
          <button class="ghost-button" :disabled="!canRename || actionLoading" @click="openDialog('rename', selectedItem)">重命名</button>
          <button class="ghost-button" :disabled="!canDelete || actionLoading" @click="openDialog('delete', selectedItem)">删除</button>
        </div>
      </div>

      <div class="finder-status-strip">
        <span class="header-chip">当前目录 {{ currentPath }}</span>
        <span class="header-chip">启动目录 {{ rootPath }}</span>
        <span class="header-chip">{{ itemCountLabel }}</span>
        <span class="header-chip">视图 {{ viewMode }}</span>
      </div>

      <div v-if="error" class="finder-alert finder-alert-error">
        <strong>文件请求失败</strong>
        <p class="muted">{{ error }}</p>
      </div>

      <div v-if="directoryWarnings.length" class="finder-alert finder-alert-warning">
        <strong>目录部分条目不可读</strong>
        <p class="muted">已跳过 {{ directoryWarnings.length }} 个异常条目，当前目录其余内容仍可继续浏览。</p>
      </div>

      <div class="finder-content finder-content-wide">
        <div v-if="viewMode === 'icons'" class="finder-icons">
          <button
            v-for="entry in items"
            :key="entry.path"
            class="finder-tile"
            :class="{ active: selectedItem?.path === entry.path }"
            @click="selectedItem = entry"
            @dblclick="activateEntry(entry)"
            @contextmenu="openContextMenu($event, entry)"
          >
            <div class="finder-tile-icon">{{ entry.is_directory ? '📁' : '📄' }}</div>
            <strong>{{ entry.name }}</strong>
            <small>{{ entry.is_directory ? '目录' : `${entry.size} bytes` }}</small>
          </button>
          <div v-if="!items.length && !loading" class="finder-empty-state">
            <strong>当前目录为空</strong>
            <p class="muted">可以上传文件、新建文件夹，或在地址栏中输入其他路径继续浏览。</p>
          </div>
        </div>

        <div v-else-if="viewMode === 'list'" class="finder-list">
          <div class="finder-list-header">
            <span>名称</span>
            <span>类型</span>
            <span>大小</span>
          </div>
          <button
            v-for="entry in rowItems"
            :key="`${entry.path}:${entry.depth}`"
            class="finder-list-row"
            :class="{ active: selectedItem?.path === entry.path }"
            @click="selectedItem = entry"
            @dblclick="activateEntry(entry)"
            @contextmenu="openContextMenu($event, entry)"
          >
            <span class="finder-list-name" :style="{ paddingLeft: `${entry.depth * 20 + 12}px` }">
              <button
                v-if="entry.is_directory"
                class="disclosure-button"
                @click.stop="toggleExpand(entry)"
              >
                {{ expandedPaths.has(entry.path) ? '▾' : '▸' }}
              </button>
              <span v-else class="disclosure-placeholder"></span>
              <span>{{ entry.name }}</span>
            </span>
            <span>{{ entry.is_directory ? '目录' : '文件' }}</span>
            <span>{{ entry.is_directory ? '—' : `${entry.size} bytes` }}</span>
          </button>
          <div v-if="!rowItems.length && !loading" class="finder-empty-state finder-empty-state-inline">
            <strong>当前目录为空</strong>
            <p class="muted">列表视图下没有可显示项目。</p>
          </div>
        </div>

        <div v-else class="finder-columns">
          <div v-for="column in columns" :key="column.path" class="finder-column">
            <div class="finder-column-title">{{ column.path }}</div>
            <button
              v-for="entry in column.entries"
              :key="entry.path"
              class="finder-column-row"
              :class="{ active: currentPath === entry.path || selectedItem?.path === entry.path }"
              @click="selectedItem = entry"
              @dblclick="activateEntry(entry)"
              @contextmenu="openContextMenu($event, entry)"
            >
              <span>{{ entry.is_directory ? '📁' : '📄' }}</span>
              <span>{{ entry.name }}</span>
              <span v-if="entry.is_directory">›</span>
            </button>
          </div>
          <div v-if="!columns.at(-1)?.entries?.length && !loading" class="finder-empty-state finder-empty-state-inline">
            <strong>当前目录为空</strong>
            <p class="muted">分栏视图下没有可显示项目。</p>
          </div>
        </div>
      </div>

      <footer class="finder-footer finder-footer-rich">
        <span>当前路径</span>
        <div class="path-display">{{ currentPath }}</div>
      </footer>

      <div v-if="dragActive" class="finder-drop-overlay">
        <div>
          <strong>拖拽文件到这里上传</strong>
          <p class="muted">文件会直接上传到当前目录 {{ currentPath }}</p>
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
        <button class="finder-context-item" @click="openDialog('mkdir')">新建文件夹</button>
        <button class="finder-context-item" @click="triggerUpload">上传文件</button>
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
              <span>{{ dialog.type === 'mkdir' ? '文件夹名称' : '新名称' }}</span>
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