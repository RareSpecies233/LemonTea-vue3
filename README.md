# LemonTea-vue3

LemonTea-vue3 是 LemonTea 远程控制系统的 Vue 3 图形前端，用于把 LemonTea 服务端暴露出来的 HTTP API 整理成可操作的控制台界面。

当前版本聚焦于联调和功能验证，适合作为 LemonTea 与 HoneyTea 的操作入口。

## 当前功能

- 连接页默认先探测服务端并以在线客户端下拉框建立会话
- 控制台主页与系统状态展示
- SSH 控制页，用于发起远程命令执行
- 文件管理页，用于浏览和写入 HoneyTea 暴露的文件，并支持地址栏输入绝对路径
- HoneyTea 子进程管理页
- LemonTea 子进程管理页

路由入口见 [src/router.js](src/router.js)。

## 技术栈

- Vue 3
- Vue Router 4
- Vite 6

## 依赖安装

```bash
npm install
```

## 开发启动

```bash
npm run dev
```

默认启动 Vite 本地开发服务器。前端通过界面中的“服务端地址”字段访问 LemonTea 的 HTTP API，默认值为 http://127.0.0.1:18080。

## 生产构建

```bash
npm run build
```

构建产物输出到 dist/ 目录，可通过以下命令本地预览：

```bash
npm run preview
```

## 使用前提

在启动前端之前，建议先完成以下步骤：

1. 启动 LemonTea 服务端
2. 启动 HoneyTea 客户端
3. 确认 LemonTea 的 /health 接口可访问
4. 在前端中填写正确的服务端地址，并从在线客户端下拉框中选择目标客户端

## 页面说明

- 主页: 仅展示四个核心入口与 Clients 列表
- SSH 控制: 调用 LemonTea 转发 shell 请求到 HoneyTea
- 文件管理: 调用 LemonTea 文件接口访问客户端文件系统，支持 Home、Root、任意绝对路径与拖拽上传，不再显示文件预览
- HoneyTea 子进程: 管理客户端插件
- LemonTea 子进程: 管理服务端插件

主界面布局和状态栏逻辑见 [src/App.vue](src/App.vue)。

## 接口来源

LemonTea-vue3 不直接连接 HoneyTea，所有请求都先发送到 LemonTea，再由 LemonTea 转发给 HoneyTea。

接口和整体链路说明见：

- [../LemonTea-doc/README.md](../LemonTea-doc/README.md)
- [../LemonTea-doc/architecture.md](../LemonTea-doc/architecture.md)
- [../LemonTea-doc/http-api.md](../LemonTea-doc/http-api.md)