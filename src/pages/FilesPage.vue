<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import RemoteTerminal from '../components/RemoteTerminal.vue'
import { appState, decodeBase64, listFiles, readFile } from '../api.js'

const loading = ref(false)
const previewLoading = ref(false)
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
const contextMenu = ref({ visible: false, x: 0, y: 0, entry: null })
const terminalPanel = ref({ visible: false, cwd: '~', title: '终端' })

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

async function browse(path = '') {
  loading.value = true
  error.value = ''
  try {
    const payload = await listFiles(path)
    const data = payload?.data || {}
    rootPath.value = data.root || rootPath.value || appState.remoteRoot
    currentPath.value = data.path || ''
    items.value = sortEntries(data.entries || [])
    treeCache[currentPath.value] = items.value
    selectedItem.value = null
    rememberPath(currentPath.value)
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
    filePreview.value = content.slice(0, 24000)
  } catch (err) {
    error.value = err.message
  } finally {
    previewLoading.value = false
  }
}

async function openDirectory(targetPath) {
  await browse(targetPath)
}

async function activateEntry(entry) {
  selectedItem.value = entry
  closeContextMenu()
  if (entry.is_directory) {
    await openDirectory(entry.path)
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

function openContextMenu(event, entry) {
  if (!entry.is_directory) {
    return
  }
  event.preventDefault()
  selectedItem.value = entry
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
    cwd: buildAbsolutePath(rootPath.value, path),
    title: `终端 · ${label}`
  }
  closeContextMenu()
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
  <section class="finder-shell">
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

    <div class="finder-main panel-card">
      <header class="finder-toolbar">
        <div class="inline-actions">
          <button class="ghost-button" :disabled="!currentPath" @click="browse(parentPath(currentPath))">上一级</button>
          <button class="ghost-button" :disabled="loading" @click="browse(currentPath)">{{ loading ? '读取中...' : '刷新' }}</button>
        </div>
        <div class="view-switcher">
          <button class="mode-button" :class="{ active: viewMode === 'icons' }" @click="viewMode = 'icons'">图标</button>
          <button class="mode-button" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">列表</button>
          <button class="mode-button" :class="{ active: viewMode === 'columns' }" @click="viewMode = 'columns'">分栏</button>
        </div>
      </header>

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
            右键目录可在此处打开终端，双击可进入目录。
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

      <div
        v-if="contextMenu.visible"
        class="finder-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <button class="finder-context-item" @click="openTerminalAt(contextMenu.entry.path, contextMenu.entry.name)">在此处打开终端</button>
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
          <RemoteTerminal :title="terminalPanel.title" :initial-cwd="terminalPanel.cwd" compact />
        </div>
      </div>
    </div>
  </section>
</template>