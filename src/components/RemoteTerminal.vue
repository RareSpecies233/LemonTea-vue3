<script setup>
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { appState, runShell } from '../api.js'

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
const busy = ref(false)
const currentCwd = ref(props.initialCwd || '~')
const currentInput = ref('')
const terminalStatus = computed(() => busy.value ? '命令执行中' : '就绪')

const promptSuffix = ' % '
const cwdMarker = '__LEMONTEA_PWD__='
const history = []
let historyIndex = -1
let term
let fitAddon
let abortController = null
let removeResizeListener = null

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`
}

function promptText() {
  return `${currentCwd.value || '~'}${promptSuffix}`
}

function normalizeOutput(text) {
  return text.replace(/\r?\n/g, '\r\n')
}

function printPrompt() {
  term.write(`\r\n${promptText()}`)
  currentInput.value = ''
}

function replaceInput(value) {
  currentInput.value = value
  term.write(`\u001b[2K\r${promptText()}${value}`)
}

function clearTerminal() {
  term.clear()
  term.write(`${props.title}\r\n`)
  term.write(`目标客户端 ${appState.clientId}，当前为终端式交互壳。\r\n`)
  term.write(`工作目录 ${currentCwd.value || '~'}\r\n${promptText()}`)
  currentInput.value = ''
}

function parseOutput(rawOutput) {
  const markerIndex = rawOutput.lastIndexOf(cwdMarker)
  if (markerIndex === -1) {
    return { output: rawOutput, cwd: currentCwd.value }
  }

  const output = rawOutput.slice(0, markerIndex).replace(/\n$/, '')
  const nextLine = rawOutput.slice(markerIndex + cwdMarker.length).split(/\r?\n/, 1)[0].trim()
  return {
    output,
    cwd: nextLine || currentCwd.value
  }
}

function buildWrappedCommand(userInput) {
  const delimiter = '__LEMONTEA_COMMAND__'
  const cwd = currentCwd.value || '~'
  return [
    `cat <<'${delimiter}' | /bin/zsh`,
    `cd ${shellQuote(cwd)} || exit 1`,
    userInput,
    'status=$?',
    `printf '\n${cwdMarker}%s\n' "$PWD"`,
    'exit $status',
    delimiter
  ].join('\n')
}

async function executeInput(rawInput) {
  const input = rawInput.trimEnd()
  if (!input.trim()) {
    printPrompt()
    return
  }

  if (input.trim() === 'clear') {
    clearTerminal()
    return
  }

  if (!history.length || history[history.length - 1] !== input) {
    history.push(input)
  }
  historyIndex = history.length

  busy.value = true
  abortController = new AbortController()

  try {
    const payload = await runShell(buildWrappedCommand(input), { signal: abortController.signal })
    const parsed = parseOutput(payload?.data?.output || '')
    currentCwd.value = parsed.cwd
    if (parsed.output) {
      term.write(normalizeOutput(parsed.output))
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      term.write('^C')
    } else {
      term.write(normalizeOutput(`\n[error] ${err.message}`))
    }
  } finally {
    abortController = null
    busy.value = false
    printPrompt()
  }
}

function handleData(data) {
  if (busy.value) {
    if (data === '\u0003' && abortController) {
      abortController.abort()
    }
    return
  }

  switch (data) {
    case '\r':
      term.write('\r\n')
      executeInput(currentInput.value)
      return
    case '\u007f':
      if (!currentInput.value) {
        return
      }
      currentInput.value = currentInput.value.slice(0, -1)
      term.write('\b \b')
      return
    case '\u001b[A':
      if (!history.length) {
        return
      }
      historyIndex = Math.max(0, historyIndex - 1)
      replaceInput(history[historyIndex])
      return
    case '\u001b[B':
      if (!history.length) {
        return
      }
      historyIndex = Math.min(history.length, historyIndex + 1)
      replaceInput(history[historyIndex] || '')
      return
    case '\u0003':
      term.write('^C')
      printPrompt()
      return
    default:
      if (data >= ' ') {
        currentInput.value += data
        term.write(data)
      }
  }
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
  fitAddon.fit()
  term.onData(handleData)
  clearTerminal()

  const onResize = () => fitAddon.fit()
  window.addEventListener('resize', onResize)
  removeResizeListener = () => window.removeEventListener('resize', onResize)
}

watch(() => props.initialCwd, (value) => {
  if (!busy.value && value) {
    currentCwd.value = value
  }
})

onMounted(mountTerminal)

onBeforeUnmount(() => {
  if (removeResizeListener) {
    removeResizeListener()
  }
  if (abortController) {
    abortController.abort()
  }
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
        <span class="mini-pill">{{ terminalStatus }}</span>
        <span class="terminal-cwd">{{ currentCwd }}</span>
        <button class="ghost-button" @click="clearTerminal">清屏</button>
      </div>
    </header>
    <div ref="terminalHost" class="terminal-host"></div>
  </section>
</template>