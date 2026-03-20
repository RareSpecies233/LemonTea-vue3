function toBase64(bytes) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '')
}

function pickManifestFile(files) {
  return files.find((file) => {
    const path = normalizePath(file.webkitRelativePath || file.name)
    return path.endsWith('.manifest.json') || path.endsWith('/plugin.manifest.json') || file.name === 'plugin.manifest.json'
  })
}

function computeRootPrefix(manifestFile) {
  const relativePath = normalizePath(manifestFile.webkitRelativePath || '')
  if (!relativePath.includes('/')) {
    return ''
  }
  return relativePath.slice(0, relativePath.lastIndexOf('/') + 1)
}

function relativePackagePath(file, rootPrefix) {
  const rawPath = normalizePath(file.webkitRelativePath || file.name)
  if (rootPrefix && rawPath.startsWith(rootPrefix)) {
    return rawPath.slice(rootPrefix.length)
  }
  return rawPath
}

export async function buildPluginPackage(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length) {
    throw new Error('请选择插件文件或插件目录')
  }

  const manifestFile = pickManifestFile(files)
  if (!manifestFile) {
    throw new Error('未找到插件 manifest，请确保包含 *.manifest.json 或 plugin.manifest.json')
  }

  let manifest
  try {
    manifest = JSON.parse(await manifestFile.text())
  } catch {
    throw new Error('插件 manifest 不是合法 JSON')
  }

  const rootPrefix = computeRootPrefix(manifestFile)
  const payloadFiles = []
  for (const file of files) {
    if (file === manifestFile) {
      continue
    }
    const path = relativePackagePath(file, rootPrefix)
    const bytes = new Uint8Array(await file.arrayBuffer())
    payloadFiles.push({
      path,
      content_base64: toBase64(bytes)
    })
  }

  return {
    manifest,
    files: payloadFiles,
    summary: {
      name: manifest.name || '未命名插件',
      version: manifest.version || '1.0.0',
      entry: manifest.script || '未声明',
      fileCount: payloadFiles.length
    }
  }
}