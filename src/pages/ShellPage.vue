<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import RemoteTerminal from '../components/RemoteTerminal.vue'
import { appState } from '../api.js'

const route = useRoute()
const initialCwd = computed(() => String(route.query.cwd || appState.remoteRoot || '~'))
</script>

<template>
  <section class="page-stack">
    <RemoteTerminal title="SSH 控制" :initial-cwd="initialCwd" />
  </section>
</template>