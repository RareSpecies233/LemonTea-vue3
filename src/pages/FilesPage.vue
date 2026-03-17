<script setup>
import { ref } from 'vue'
import { decodeBase64, encodeBase64, listFiles, readFile, writeFile } from '../api.js'

const path = ref('')
const items = ref([])
const selectedFile = ref('')
const filePreview = ref('')
const writePath = ref('tmp/from-vue3.txt')
const writeContent = ref('hello from LemonTea-vue3')
const loading = ref(false)
const error = ref('')

async function browse() {
  loading.value = true
  error.value = ''
  try {
    const payload = await listFiles(path.value)
    items.value = payload?.data?.entries || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function openFile(targetPath) {
  error.value = ''
  try {
    selectedFile.value = targetPath
    const payload = await readFile(targetPath)
    filePreview.value = decodeBase64(payload?.data?.content_base64 || '')
  } catch (err) {
    error.value = err.message
  }
}

async function saveFile() {
  error.value = ''
  try {
    await writeFile(writePath.value, encodeBase64(writeContent.value))
    await browse()
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <section class="workspace-grid">
    <div class="file-card">
      <p class="eyebrow">Browser</p>
      <label class="field-label">
        <span>目录</span>
        <input v-model="path" class="text-input" placeholder="留空表示 file_root" />
      </label>
      <div class="stack-actions">
        <button class="primary-button" :disabled="loading" @click="browse">{{ loading ? '读取中...' : '读取目录' }}</button>
      </div>
      <p v-if="error" class="muted">{{ error }}</p>
      <div class="file-list">
        <div v-for="item in items" :key="item.path" class="list-item">
          <strong>{{ item.name }}</strong>
          <small>{{ item.is_directory ? '目录' : `文件 ${item.size} bytes` }}</small>
          <div class="pill-row">
            <button v-if="!item.is_directory" class="ghost-button" @click="openFile(item.path)">读取</button>
          </div>
        </div>
      </div>
    </div>

    <div class="file-card">
      <p class="eyebrow">Editor</p>
      <label class="field-label">
        <span>写入路径</span>
        <input v-model="writePath" class="text-input" />
      </label>
      <label class="field-label">
        <span>文本内容</span>
        <textarea v-model="writeContent" class="text-area"></textarea>
      </label>
      <div class="stack-actions">
        <button class="primary-button" @click="saveFile">写入文件</button>
      </div>
      <p class="eyebrow" style="margin-top: 20px">Preview</p>
      <div class="code-output">{{ selectedFile ? `${selectedFile}\n\n${filePreview}` : '选择文件后会显示内容预览。' }}</div>
    </div>
  </section>
</template>