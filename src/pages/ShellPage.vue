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
        当前后端仍提供按行执行的 shell 接口，因此这里实现的是终端式交互壳：支持直接在仿真终端里输入、查看历史输出、保持当前目录、清屏与命令历史。
      </p>
    </div>
    <RemoteTerminal title="SSH 控制" :initial-cwd="initialCwd" />
  </section>
</template>