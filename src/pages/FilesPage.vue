<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import RemoteTerminal from '../components/RemoteTerminal.vue'
import {
  appState,
  createDirectory,
  decodeBase64,
  decodeBase64ToBytes,
  deletePath,
  encodeBytesBase64,
  listFiles,
  readFile,
  renamePath,
  writeFile
} from '../api.js'

const loading = ref(false)
const previewLoading = ref(false)
const actionLoading = ref(false)
const error = ref('')
const viewMode = ref('icons')
const currentPath = ref('')
const rootPath = ref('')
const items = ref([])
const selectedItem = ref(null)
const selectedFile = ref('')
const filePreview = ref('')
const recentPaths = ref([])
const expandedPaths = ref(new Set())
const treeCache = reactive({})
const dragActive = ref(false)
const fileInput = ref(null)
const contextMenu = ref({ visible: false, x: 0, y: 0, entry: null, blankArea: false })
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

function basename(path) {
  return path.split('/').filter(Boolean).pop() || '~'
}

function parentPath(path) {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function joinPath(base, name) {
  return base ? `${base}/${name}` : name
}

function buildAbsolutePath(root, relativePath) {
  if (!root) {
    return relativePath || '~'
  }
  if (!relativePath) {
    return root
  }
  return `${root.replace(/\/$/, '')}/${relativePath}`
}

function rememberPath(path) {
  recentPaths.value = [path, ...recentPaths.value.filter((item) => item !== path)].slice(0, 8)
}

async function ensureCached(path) {
  if (treeCache[path]) {
    return treeCache[path]
  }
  const payload = await listFiles(path)
  if (payload?.data?.root) {
    rootPath.value = payload.data.root
  }
  const entries = sortEntries(payload?.data?.entries || [])
  treeCache[path] = entries
  return entries
}

async function browse(path = currentPath.value) {
  loading.value = true
  error.value = ''
  try {
    const payload = await listFiles(path)
    const data = payload?.data || {}
    rootPath.value = data.root || rootPath.value || appState.remoteRoot
    currentPath.value = data.path || ''
    items.value = sortEntries(data.entries || [])
    treeCache[currentPath.value] = items.value
    rememberPath(currentPath.value)

    if (selectedItem.value) {
      selectedItem.value = items.value.find((entry) => entry.path === selectedItem.value.path) || null
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function openFile(targetPath) {
  error.value = ''
  previewLoading.value = true
  try {
    selectedFile.value = targetPath
    selectedItem.value = items.value.find((entry) => entry.path === targetPath) || selectedItem.value
    const payload = await readFile(targetPath)
    const content = decodeBase64(payload?.data?.content_base64 || '')
    filePreview.value = content.slice(0, 32000)
  } catch (err) {
    error.value = err.message
  } finally {
    previewLoading.value = false
  }
}

async function activateEntry(entry) {
  selectedItem.value = entry
  closeContextMenu()
  if (entry.is_directory) {
    await browse(entry.path)
    return
  }
  await openFile(entry.path)
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
    const row = [{ ...entry, depth }]
    if (entry.is_directory && expandedPaths.value.has(entry.path) && treeCache[entry.path]) {
      row.push(...flattenRows(entry.path, depth + 1))
    }
    return row
  })
}

function openContextMenu(event, entry = null, blankArea = false) {
  event.preventDefault()
  if (entry) {
    selectedItem.value = entry
  }
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    entry,
    blankArea
  }
}

function closeContextMenu() {
  contextMenu.value = { visible: false, x: 0, y: 0, entry: null, blankArea: false }
}

function openTerminalAt(path, label) {
  terminalPanel.value = {
    visible: true,
    cwd: buildAbsolutePath(rootPath.value, path),
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
      const targetPath = joinPath(currentPath.value, file.name)
      await writeFile(targetPath, encodeBytesBase64(bytes))
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
        selectedFile.value = ''
        filePreview.value = ''
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

const currentAbsolutePath = computed(() => buildAbsolutePath(rootPath.value, currentPath.value))
const rowItems = computed(() => flattenRows(currentPath.value))
const favoriteItems = computed(() => {
  const favorites = [{ label: '主目录', path: '' }]
  if (currentPath.value) {
    favorites.push({ label: '上一级', path: parentPath(currentPath.value) })
  }
  recentPaths.value
    .filter((path) => path && path !== currentPath.value)
    .forEach((path) => favorites.push({ label: basename(path), path }))
  return favorites
})
const columnPaths = computed(() => {
  const segments = currentPath.value.split('/').filter(Boolean)
  const paths = ['']
  let cursor = ''
  segments.forEach((segment) => {
    cursor = cursor ? `${cursor}/${segment}` : segment
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
  await browse('')
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
          <button v-for="favorite in favoriteItems" :key="favorite.path || favorite.label" class="finder-favorite" @click="browse(favorite.path)">
            <span>{{ favorite.label }}</span>
            <small>{{ favorite.path || '~' }}</small>
          </button>
        </div>
      </div>
      <div class="finder-sidebar-footer">
        <p class="eyebrow">路径</p>
        <div class="path-display">{{ currentAbsolutePath }}</div>
      </div>
    </aside>

    <div
      class="finder-main panel-card"
      @contextmenu="openContextMenu($event, null, true)"
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
          <button class="ghost-button" :disabled="!currentPath" @click="browse(parentPath(currentPath))">上一级</button>
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

      <div class="finder-action-bar">
        <div class="finder-action-copy">
          <strong>{{ basename(currentPath) }}</strong>
          <span class="muted">{{ currentAbsolutePath }}</span>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" :disabled="!canDownload || actionLoading" @click="downloadEntry()">下载</button>
          <button class="ghost-button" :disabled="!canRename || actionLoading" @click="openDialog('rename', selectedItem)">重命名</button>
          <button class="ghost-button" :disabled="!canDelete || actionLoading" @click="openDialog('delete', selectedItem)">删除</button>
        </div>
      </div>

      <p v-if="error" class="muted">{{ error }}</p>

      <div class="finder-content">
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
        </div>

        <div v-else class="finder-columns">
          <div v-for="column in columns" :key="column.path || '~'" class="finder-column">
            <div class="finder-column-title">{{ column.path ? basename(column.path) : '~' }}</div>
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
        </div>

        <aside class="finder-preview">
          <p class="eyebrow">预览</p>
          <div v-if="selectedItem" class="preview-meta">
            <strong>{{ selectedItem.name }}</strong>
            <small>{{ selectedItem.is_directory ? '目录' : `文件 ${selectedItem.size} bytes` }}</small>
            <small>{{ buildAbsolutePath(rootPath, selectedItem.path) }}</small>
          </div>
          <div v-if="selectedItem?.is_directory" class="preview-placeholder">
            右键目录可打开终端、重命名或删除，也可以在当前目录继续拖拽上传文件。
          </div>
          <div v-else class="code-output finder-preview-output">
            {{ previewLoading ? '正在读取文件...' : (selectedFile ? filePreview : '选择文件后会显示文本预览。') }}
          </div>
        </aside>
      </div>

      <footer class="finder-footer">
        <span>当前路径</span>
        <div class="path-display">{{ currentAbsolutePath }}</div>
      </footer>

      <div v-if="dragActive" class="finder-drop-overlay">
        <div>
          <strong>拖拽文件到这里上传</strong>
          <p class="muted">文件将上传到当前目录 {{ currentAbsolutePath }}</p>
        </div>
      </div>

      <div
        v-if="contextMenu.visible"
        class="finder-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <button v-if="contextMenu.entry?.is_directory" class="finder-context-item" @click="openTerminalAt(contextMenu.entry.path, contextMenu.entry.name)">在此处打开终端</button>
        <button v-if="contextMenu.entry" class="finder-context-item" @click="activateEntry(contextMenu.entry)">打开</button>
        <button v-if="contextMenu.entry && !contextMenu.entry.is_directory" class="finder-context-item" @click="downloadEntry(contextMenu.entry)">下载</button>
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