<script setup>
import { computed } from 'vue'
import RemoteTerminal from '../components/RemoteTerminal.vue'
import { appState } from '../api.js'

const initialCwd = computed(() => appState.remoteRoot || '~')
</script>

<template>
  <section class="page-stack">
    <div class="panel-card note-card">
      <p class="eyebrow">SSH Control</p>
      <p class="muted">
        当前页面已经切换为真实 PTY 会话，键盘输入、控制字符、窗口缩放和远端 shell 回显都通过 WebSocket 与 HoneyTea 的终端主设备实时同步。
      </p>
    </div>
    <RemoteTerminal title="SSH 控制" :initial-cwd="initialCwd" />
  </section>
</template>