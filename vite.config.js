import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [vue(), VueDevTools()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false
  }
})