<script setup>
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { appState, buildWebSocketUrl, decodeBase64ToBytes, encodeBytesBase64 } from '../api.js'

const props = defineProps({
  title: {
    type: String,
    default: 'SSH 控制'
  },
  initialCwd: {
    type: String,
    default: '~'
  },
  compact: {
    type: Boolean,
    default: false
  }
})

const terminalHost = ref(null)
const terminalStatus = ref('正在连接')
const currentCwd = ref(props.initialCwd || '~')
const isConnected = ref(false)

let term
let fitAddon
let socket
let resizeListener
let hostResizeObserver
let ptySessionId = ''
const decoder = new TextDecoder()

const statusPill = computed(() => isConnected.value ? '已连接' : terminalStatus.value)

function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return
  }
  socket.send(JSON.stringify(message))
}

function fitTerminal() {
  if (!fitAddon || !term) {
    return
  }
  fitAddon.fit()
  if (isConnected.value) {
    sendMessage({
      action: 'resize',
      rows: term.rows,
      cols: term.cols
    })
  }
}

function writeBytes(base64Content) {
  const chunk = decodeBase64ToBytes(base64Content)
  term.write(decoder.decode(chunk, { stream: true }))
}

function attachSocket() {
  socket = new WebSocket(buildWebSocketUrl('/ws/pty'))

  socket.addEventListener('open', () => {
    terminalStatus.value = '握手中'
    fitTerminal()
    sendMessage({
      action: 'open',
      client_id: appState.clientId,
      cwd: props.initialCwd || '~',
      rows: term.rows,
      cols: term.cols
    })
  })

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    switch (payload.type) {
      case 'pty_opened':
        ptySessionId = payload.session_id || ''
        currentCwd.value = payload.cwd || currentCwd.value
        terminalStatus.value = '就绪'
        isConnected.value = true
        term.focus()
        break
      case 'pty_output':
        if (payload.data_base64) {
          writeBytes(payload.data_base64)
        }
        break
      case 'pty_exit':
        terminalStatus.value = `已退出(${payload.exit_code ?? 0})`
        isConnected.value = false
        term.write(`\r\n[session exited: ${payload.exit_code ?? 0}]\r\n`)
        break
      case 'error':
        terminalStatus.value = '错误'
        term.write(`\r\n[error] ${payload.message}\r\n`)
        break
      default:
        break
    }
  })

  socket.addEventListener('close', () => {
    if (isConnected.value) {
      term.write('\r\n[connection closed]\r\n')
    }
    isConnected.value = false
    if (terminalStatus.value === '正在连接' || terminalStatus.value === '握手中') {
      terminalStatus.value = '连接关闭'
    }
  })

  socket.addEventListener('error', () => {
    terminalStatus.value = '连接错误'
  })
}

function closeTerminal() {
  if (socket && socket.readyState === WebSocket.OPEN && ptySessionId) {
    sendMessage({ action: 'close' })
  }
  socket?.close()
  socket = null
  isConnected.value = false
}

function clearTerminal() {
  term?.clear()
}

function mountTerminal() {
  fitAddon = new FitAddon()
  term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: props.compact ? 12 : 13,
    lineHeight: 1.25,
    theme: {
      background: '#101010',
      foreground: '#f8ead5',
      cursor: '#f8ead5',
      selectionBackground: 'rgba(245, 210, 170, 0.26)',
      black: '#181818',
      red: '#ff8d72',
      green: '#8ccf7e',
      yellow: '#f5c96f',
      blue: '#84b6ff',
      magenta: '#d0a3ff',
      cyan: '#77d6d4',
      white: '#f8ead5',
      brightBlack: '#6f655f',
      brightWhite: '#fff7ef'
    }
  })
  term.loadAddon(fitAddon)
  term.open(terminalHost.value)
  fitTerminal()
  term.focus()
  term.write(`${props.title}\r\n目标客户端 ${appState.clientId}\r\n`)
  term.write('正在建立 PTY 会话...\r\n')

  term.onData((data) => {
    if (!isConnected.value) {
      return
    }
    const bytes = new TextEncoder().encode(data)
    sendMessage({
      action: 'input',
      data_base64: encodeBytesBase64(bytes)
    })
  })

  term.onResize(({ rows, cols }) => {
    if (!isConnected.value) {
      return
    }
    sendMessage({ action: 'resize', rows, cols })
  })

  resizeListener = () => fitTerminal()
  window.addEventListener('resize', resizeListener)
  if (typeof ResizeObserver !== 'undefined' && terminalHost.value) {
    hostResizeObserver = new ResizeObserver(() => fitTerminal())
    hostResizeObserver.observe(terminalHost.value)
  }
  attachSocket()
}

watch(() => props.initialCwd, (value) => {
  currentCwd.value = value || '~'
})

onMounted(mountTerminal)

onBeforeUnmount(() => {
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener)
  }
  if (hostResizeObserver) {
    hostResizeObserver.disconnect()
    hostResizeObserver = null
  }
  closeTerminal()
  term?.dispose()
})
</script>

<template>
  <section class="terminal-card terminal-shell" :class="{ compact }">
    <header class="terminal-toolbar">
      <div>
        <p class="eyebrow">Terminal</p>
        <strong>{{ title }}</strong>
      </div>
      <div class="terminal-toolbar-meta">
        <span class="mini-pill">{{ statusPill }}</span>
        <span class="terminal-cwd">{{ currentCwd }}</span>
        <button class="ghost-button" @click="clearTerminal">清屏</button>
      </div>
    </header>
    <div ref="terminalHost" class="terminal-host"></div>
  </section>
</template>