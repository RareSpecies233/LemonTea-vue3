<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createDirectory, deletePath, listFiles, readFileBytesChunked, renamePath, writeFileBytesChunked } from '../api.js'

const loading = ref(false)
const actionLoading = ref(false)
const error = ref('')
const router = useRouter()
const currentPath = ref('')
const rootPath = ref('/')
const items = ref([])
const directoryWarnings = ref([])
const selectedItem = ref(null)
const locationInput = ref('~')
const contextMenu = ref({ visible: false, x: 0, y: 0, entry: null })
const dialog = ref({ visible: false, type: '', title: '', value: '', entry: null })
const fileInput = ref(null)
const shortcutDialog = ref({ visible: false, index: -1, label: '', path: '' })
const customShortcuts = ref([])
const shortcutMenu = ref({ visible: false, x: 0, y: 0, index: -1 })
const uploadState = ref({ visible: false, fileName: '', fileIndex: 0, fileCount: 0, uploadedBytes: 0, totalBytes: 0 })

const CUSTOM_SHORTCUTS_KEY = 'lemontea.files.shortcuts'

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

function displayPath(path) {
  if (!path || path === '~') {
    return '用户主目录'
  }
  if (path === '/') {
    return '文件系统根目录'
  }
  return path
}

function loadCustomShortcuts() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_SHORTCUTS_KEY) || '[]')
  } catch {
    return []
  }
}

function persistCustomShortcuts() {
  localStorage.setItem(CUSTOM_SHORTCUTS_KEY, JSON.stringify(customShortcuts.value))
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
  event.stopPropagation()
  closeShortcutMenu()
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

function openShortcutMenu(event, index) {
  event.preventDefault()
  closeContextMenu()
  shortcutMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    index
  }
}

function closeShortcutMenu() {
  shortcutMenu.value = { visible: false, x: 0, y: 0, index: -1 }
}

function openTerminalAt(path, label) {
  const target = router.resolve({ name: 'shell', query: { cwd: path, title: label } })
  window.open(target.href, '_blank', 'noopener,noreferrer')
  closeContextMenu()
}

function triggerUpload() {
  fileInput.value?.click()
  closeContextMenu()
  closeShortcutMenu()
}

async function handleUploadSelection(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) {
    return
  }
  actionLoading.value = true
  error.value = ''
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  uploadState.value = {
    visible: true,
    fileName: files[0].name,
    fileIndex: 1,
    fileCount: files.length,
    uploadedBytes: 0,
    totalBytes
  }
  try {
    let uploadedBefore = 0
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const bytes = new Uint8Array(await file.arrayBuffer())
      uploadState.value.fileName = file.name
      uploadState.value.fileIndex = index + 1
      await writeFileBytesChunked(joinPath(currentPath.value, file.name), bytes, {
        onProgress(written) {
          uploadState.value.uploadedBytes = uploadedBefore + written
        }
      })
      uploadedBefore += bytes.length
      uploadState.value.uploadedBytes = uploadedBefore
    }
    await browse(currentPath.value)
  } catch (err) {
    error.value = err.message
  } finally {
    actionLoading.value = false
    uploadState.value.visible = false
  }
}

async function downloadEntry(entry = selectedItem.value) {
  if (!entry || entry.is_directory) {
    return
  }
  actionLoading.value = true
  error.value = ''
  try {
    const bytes = await readFileBytesChunked(entry.path, entry.size)
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

function handleGlobalClick() {
  closeContextMenu()
  closeShortcutMenu()
}

function openShortcutDialog(index = -1) {
  closeShortcutMenu()
  const existing = index >= 0 ? customShortcuts.value[index] : { label: '', path: '' }
  shortcutDialog.value = {
    visible: true,
    index,
    label: existing.label,
    path: existing.path
  }
}

function closeShortcutDialog() {
  shortcutDialog.value = { visible: false, index: -1, label: '', path: '' }
}

function saveShortcut() {
  const next = [...customShortcuts.value]
  const payload = {
    label: shortcutDialog.value.label.trim(),
    path: shortcutDialog.value.path.trim()
  }
  if (!payload.label || !payload.path) {
    error.value = '快捷访问名称和地址不能为空'
    return
  }
  if (shortcutDialog.value.index >= 0) {
    next.splice(shortcutDialog.value.index, 1, payload)
  } else {
    next.push(payload)
  }
  customShortcuts.value = next
  persistCustomShortcuts()
  closeShortcutDialog()
}

function removeShortcut(index) {
  customShortcuts.value = customShortcuts.value.filter((_, itemIndex) => itemIndex !== index)
  persistCustomShortcuts()
  closeShortcutMenu()
}

async function submitLocation() {
  await browse(locationInput.value.trim() || '/')
}

function formatFileSize(value) {
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

const favoriteItems = computed(() => {
  const favorites = [
    { label: 'Home', path: '~', description: '用户主目录' },
    { label: 'Root', path: '/', description: '文件系统根目录' }
  ]

  customShortcuts.value.forEach((shortcut) => {
    favorites.push({ label: shortcut.label, path: shortcut.path, description: shortcut.path, custom: true })
  })

  return favorites
})
const canDownload = computed(() => selectedItem.value && !selectedItem.value.is_directory)
const canRename = computed(() => Boolean(selectedItem.value))
const canDelete = computed(() => Boolean(selectedItem.value))
const itemCountLabel = computed(() => `${items.value.length} 个项目`)
const explorerRows = computed(() => items.value)
const selectedPath = computed(() => selectedItem.value?.path || '未选择')
const uploadPercent = computed(() => {
  const total = uploadState.value.totalBytes
  if (!total) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round((uploadState.value.uploadedBytes / total) * 100)))
})
const uploadProgressLabel = computed(() => {
  const uploaded = formatFileSize(uploadState.value.uploadedBytes)
  const total = formatFileSize(uploadState.value.totalBytes)
  return `${uploaded} / ${total}`
})

onMounted(async () => {
  customShortcuts.value = loadCustomShortcuts()
  window.addEventListener('click', handleGlobalClick)
  await browse('~')
})

watch(customShortcuts, persistCustomShortcuts, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick)
})
</script>

<template>
  <section class="file-workspace">
    <input ref="fileInput" type="file" multiple class="hidden-file-input" @change="handleUploadSelection" />

    <aside class="file-sidebar panel-card">
      <div>
        <p class="eyebrow">快捷访问</p>
        <div class="file-shortcut-list">
          <div v-for="(favorite, index) in favoriteItems" :key="favorite.path + favorite.label" class="file-shortcut-item-wrap">
            <button class="file-shortcut-item" @click="browse(favorite.path)" @contextmenu="favorite.custom ? openShortcutMenu($event, index - 2) : undefined">
              <span>{{ favorite.label }}</span>
              <small>{{ favorite.description }}</small>
            </button>
          </div>
        </div>
        <div class="stack-actions">
          <button class="ghost-button" @click="openShortcutDialog()">新增快捷访问</button>
        </div>
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
          <button class="ghost-button" @click="triggerUpload">上传文件</button>
          <button class="ghost-button" @click="openDialog('mkdir')">新建文件夹</button>
          <button class="ghost-button" :disabled="!currentPath" @click="openTerminalAt(currentPath, displayPath(currentPath))">在当前目录打开终端</button>
        </div>
      </header>

      <form class="file-location-bar" @submit.prevent="submitLocation">
        <input v-model="locationInput" class="text-input" placeholder="输入 ~/、/home、/tmp 等路径" />
        <button class="primary-button" type="submit">进入</button>
      </form>

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
          <span>{{ entry.is_directory ? '—' : formatFileSize(entry.size) }}</span>
        </button>

        <div v-if="!explorerRows.length && !loading" class="finder-empty-state finder-empty-state-inline">
          <strong>当前目录为空</strong>
          <p class="muted">你可以切换到其他目录继续浏览。</p>
        </div>
      </div>

      <footer class="file-path-footer">
        <span>当前目录：{{ currentPath || '/' }}</span>
        <span>选中路径：{{ selectedPath }}</span>
      </footer>

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

      <div
        v-if="shortcutMenu.visible"
        class="finder-context-menu"
        :style="{ left: `${shortcutMenu.x}px`, top: `${shortcutMenu.y}px` }"
      >
        <button class="finder-context-item" @click="openShortcutDialog(shortcutMenu.index)">编辑快捷访问</button>
        <button class="finder-context-item" @click="removeShortcut(shortcutMenu.index)">删除快捷访问</button>
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

      <div v-if="shortcutDialog.visible" class="finder-dialog-mask">
        <div class="finder-dialog-card">
          <p class="eyebrow">Shortcut</p>
          <h3>{{ shortcutDialog.index >= 0 ? '编辑快捷访问' : '新增快捷访问' }}</h3>
          <label class="field-label">
            <span>名称</span>
            <input v-model="shortcutDialog.label" class="text-input" />
          </label>
          <label class="field-label">
            <span>地址</span>
            <input v-model="shortcutDialog.path" class="text-input" placeholder="例如：~/workspace 或 /opt/honeytea" />
          </label>
          <div class="stack-actions">
            <button class="primary-button" @click="saveShortcut">保存</button>
            <button class="ghost-button" @click="closeShortcutDialog">取消</button>
          </div>
        </div>
      </div>

      <div v-if="uploadState.visible" class="finder-dialog-mask upload-progress-mask">
        <div class="finder-dialog-card upload-progress-card">
          <p class="eyebrow">上传中</p>
          <h3>正在上传文件，请勿关闭页面</h3>
          <p class="muted">当前文件 {{ uploadState.fileIndex }}/{{ uploadState.fileCount }}：{{ uploadState.fileName }}</p>
          <div class="upload-progress-bar">
            <div class="upload-progress-bar-inner" :style="{ width: `${uploadPercent}%` }"></div>
          </div>
          <p class="muted">{{ uploadPercent }}% · {{ uploadProgressLabel }}</p>
        </div>
      </div>
    </div>
  </section>
</template>