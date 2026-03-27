import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './styles.css'

const app = createApp(App)

if (import.meta.env.DEV) {
	app.config.devtools = true
	app.config.performance = true
}

app.use(router).mount('#app')