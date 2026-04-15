# CCConnect

[English README](C:/Users/12467/Documents/707/CCConnect/README.md)

CCConnect 是一个面向跨设备快速传输的桌面式应用，用来在设备之间发送文件和长文本。当前仓库包含一个 React 前端原型，以及一个负责设备发现、配对、会话管理和 WebRTC 信令的服务端。

## 项目能力

- 发现同账号或当前网络下可用的设备
- 使用短互传码完成设备配对
- 通过传输会话发送文件并展示进度状态
- 在设备之间交换长文本或聊天消息
- 以聊天工作台风格查看活跃会话和历史会话
- 使用单一的聊天桌面界面承载设备消息与传输流程

## 仓库结构

```text
.
|-- src/                   # React 前端
|-- public/                # 静态资源
|-- server/                # WebSocket 信令后端
|-- DESIGN.md              # 产品与视觉系统说明
|-- DESIGN.zh-CN.md        # 中文设计文档
|-- package.json           # 前端脚本
`-- server/package.json    # 后端脚本
```

## 技术栈

- 前端：React 19、TypeScript、Vite
- 后端：Node.js、TypeScript、`ws`
- 传输模型：WebSocket 信令 + 面向 WebRTC 的会话流转

## 前端特性

- 带连接状态和快捷操作的设备列表
- 支持拖拽上传的文件发送流程
- 接收队列与已完成传输历史
- 长文本与聊天对话视图
- 会话搜索与会话详情面板
- 单一聊天桌面界面与分区路由工作台
- 基于浏览器历史的路由导航：`connect`、`send`、`receive`、`text`、`sessions`
- 已拆分的应用壳层与主视图区组件
- 可直接插入聊天输入框的浮动 Emoji 面板
- 基于 Google Fonts 的界面字体方案

## 后端职责

[`server/README.md`](C:/Users/12467/Documents/707/CCConnect/server/README.md) 中的信令服务负责：

- 设备在线状态与重连身份
- 短码与 pair token
- 同账号自动连接
- 基于局域网启发式的设备发现
- 会话生命周期协调
- 点对点传输的信令转发

服务端不会长期保存文件内容。它的核心职责是帮助设备彼此发现、建立连接并进入传输会话。

## 快速开始

### 环境要求

- 推荐 Node.js 20+
- npm

### 安装依赖

```bash
npm install
cd server
npm install
```

### 运行前端

在仓库根目录执行：

```bash
npm run dev
```

默认会启动 Vite 开发服务器，一般地址为 `http://localhost:5173`。

### 前端路由

前端使用 `react-router-dom` 的浏览器历史路由：

- `/connect`
- `/send`
- `/receive`
- `/text`
- `/sessions`

当前应用只保留聊天桌面体验。文件发送和接收流程会收敛到对话工作区，并跳转到 `/text`。

### 运行后端

在 [`server`](C:/Users/12467/Documents/707/CCConnect/server) 目录执行：

```bash
npm run dev
```

默认情况下，信令服务监听 `http://0.0.0.0:8787`，WebSocket 端点为 `/ws`。

## 构建

### 前端

```bash
npm run build
```

### 后端

```bash
cd server
npm run build
```

## 环境变量

### 前端

可选的前端环境变量：

- `VITE_SIGNALING_WS_URL`：显式指定信令服务的 WebSocket 地址
- `VITE_SIGNALING_HTTP_URL`：显式指定历史记录或调试接口的 HTTP 基地址

如果不设置，前端在本地开发时默认使用 `ws://localhost:8787/ws`，生产环境会基于当前站点地址自动推导 `/ws`。

后端环境配置位于 [`server/.env.example`](C:/Users/12467/Documents/707/CCConnect/server/.env.example)。如果你需要自定义运行参数，可以复制为 `server/.env` 再修改。

重要变量包括：

- `PORT`
- `HOST`
- `PUBLIC_WS_URL`
- `PING_INTERVAL_MS`
- `SESSION_IDLE_MS`
- `HISTORY_RETENTION_MS`
- `TURN_URL`
- `TURN_URLS`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

## 部署说明

### 前端静态托管

前端使用 `BrowserRouter`，所以 Web 服务器必须把未知前端路由回退到 `index.html`。否则在刷新 `/connect` 或 `/text` 这类子路径时，服务器会直接返回 404。

典型生产部署流程：

1. 执行 `npm run build`
2. 部署生成的 `dist/` 目录
3. 将非静态文件请求重写到 `dist/index.html`
4. 暴露 `/ws` 到信令后端，或通过 `VITE_SIGNALING_WS_URL` / `VITE_SIGNALING_HTTP_URL` 显式指定

当前生产前端地址为 `https://cc.changr888.com`。

### 后端

生产环境下可以在 `server/` 目录执行：

```bash
cd server
npm install
npm run build
npm run start
```

如果后端位于 `nginx` 之后，请确保正确透传 WebSocket Upgrade 头和 `X-Forwarded-For`。

## 设计文档

项目方向与界面行为说明见：

- [`DESIGN.md`](C:/Users/12467/Documents/707/CCConnect/DESIGN.md)
- [`DESIGN.zh-CN.md`](C:/Users/12467/Documents/707/CCConnect/DESIGN.zh-CN.md)

这些文档定义了桌面对话工作区布局、克制的聊天式视觉语言，以及消息和传输交互的预期行为。

## 当前状态

仓库目前处于 MVP / 原型阶段：

- 前端已经覆盖核心交互模型
- 后端已具备信令与设备发现能力
- WebRTC 与传输流程已经搭好继续演进的结构

## 可用脚本

根目录：

- `npm run dev`：启动前端开发服务器
- `npm run build`：类型检查并构建前端
- `npm run lint`：运行 ESLint
- `npm run preview`：预览前端构建产物

`server/` 目录：

- `npm run dev`：以 watch 模式启动后端
- `npm run build`：编译后端
- `npm run start`：运行 `dist` 中的后端构建结果
