<script setup>
const actions = [
  { to: '/shell', title: 'SSH 控制', desc: '进入交互终端进行远程命令控制', glyph: '>_' },
  { to: '/files', title: '文件管理', desc: '浏览、上传、下载和管理远程文件', glyph: 'FS' },
  { to: '/lemon-plugins', title: 'LemonTea 子进程管理', desc: '管理服务端插件运行状态', glyph: 'LT' },
  { to: '/honey-plugins', title: 'HoneyTea 子进程管理', desc: '管理客户端插件与固件更新', glyph: 'HT' }
]
</script>

<template>
  <section class="dashboard-stack">
    <div class="home-grid">
      <RouterLink v-for="item in actions" :key="item.to" :to="item.to" class="home-button-card panel-card">
        <span class="home-button-glyph">{{ item.glyph }}</span>
        <span>
          <strong>{{ item.title }}</strong>
          <small class="muted">{{ item.desc }}</small>
        </span>
      </RouterLink>
    </div>
  </section>
</template>