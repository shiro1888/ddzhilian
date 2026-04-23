# ddzhilian

[English README](README.md)

ddzhilian 是一个面向跨设备协作的轻量传输与聊天工作台。它把设备发现、短码配对、文件传输、长文本发送、公共对话和历史内容管理收敛到一个桌面聊天式界面中，适合在电脑、手机和浏览器设备之间快速交换内容。

当前仓库包含：

- 基于 Next.js、React 和 TypeScript 的前端应用
- 基于 Node.js、TypeScript 和 `ws` 的信令后端
- 面向 WebRTC 数据通道的配对、会话和中转协调逻辑
- 静态部署、nginx 代理和自托管运行所需的基础配置与文档

## 核心能力

- 设备发现：展示同账号或当前网络环境下可连接的设备。
- 短码配对：通过短互传码快速建立设备关系。
- 聊天工作台：以桌面聊天界面承载文本、文件和会话状态。
- 文件传输：支持拖拽选择、传输进度、接收队列和完成历史。
- 长文本交换：支持普通文本、富文本粘贴和 Markdown 显示。
- 公共对话：支持公共 room 入口和 room 内历史内容。
- 历史内容：文本历史独立保存，历史文件按保留时间和容量自动清理。
- 实时信令：通过 WebSocket 协调设备在线状态、配对和 WebRTC 连接。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Next.js 静态导出、React 19、TypeScript、react-router-dom |
| 后端 | Node.js、TypeScript、ws |
| 实时通信 | WebSocket 信令 + WebRTC 数据通道 |
| 构建检查 | ESLint、TypeScript、Next.js build |
| 部署形态 | 静态前端 + Node.js 信令服务 + nginx 反向代理 |

## 目录结构

```text
.
|-- src/                   # 前端源码
|-- app/                   # Next.js app 入口与静态导出入口
|-- public/                # 静态资源
|-- server/                # WebSocket 信令后端
|-- deploy/                # 自托管部署相关配置
|-- scripts/               # 构建、压缩和预览脚本
|-- DESIGN.md              # 英文设计说明
|-- DESIGN.zh-CN.md        # 中文设计说明
|-- package.json           # 前端脚本与依赖
`-- server/package.json    # 后端脚本与依赖
```

## 快速开始

### 环境要求

- Node.js 20 或更高版本
- npm

### 安装依赖

```bash
npm install
cd server
npm install
```

### 启动前端

在仓库根目录执行：

```bash
npm run dev
```

默认地址通常是 `http://localhost:3000`。

### 启动后端

在 `server/` 目录执行：

```bash
cd server
npm run dev
```

默认监听地址是 `http://0.0.0.0:8787`，WebSocket 端点是 `/ws`。

## 前端路由

前端使用浏览器历史路由，主要入口包括：

- `/connect`
- `/send`
- `/receive`
- `/text`
- `/sessions`

当前产品形态以聊天桌面体验为主，文件发送和接收流程会收敛到对话工作区。

## 消息与 Markdown

聊天消息支持普通文本、粘贴富文本和常用 Markdown 显示。

纯文本消息会识别以下 Markdown 子集：

- `#`、`##`、`###` 标题
- `**加粗**`、`*斜体*`、`~~删除线~~`
- `>` 引用块
- `-` / `*` / `+` 无序列表
- `1.` / `1)` 有序列表
- `` `行内代码` ``
- 三反引号围栏代码块
- `[链接](https://example.com)`
- `![图片](https://example.com/image.png)`

如果消息本身包含 HTML 或从外部复制的富文本，前端会继续使用现有 HTML 白名单清洗流程，以保留富文本粘贴、代码粘贴和安全边界。

## 后端职责

后端主要负责连接协调，不承担长期文件存储职责。它的职责包括：

- 设备在线状态和重连身份
- 短码与 pair token
- 同账号自动连接
- 局域网启发式设备发现
- room 与 session 生命周期
- WebRTC 信令转发
- 历史文本与历史文件元数据管理
- Cloudflare AI 代理接口

更详细的后端协议说明见 [server/README.md](server/README.md)。

## 历史内容清理

公共 room 和普通 room 使用同一套历史文件临时存储规则：

- 文件保存在 `server/data/history/files/<roomId>/...`。
- 元数据索引保存在 `server/data/history/index.json`。
- `HISTORY_RETENTION_MS` 控制历史文件保留时长，默认 6 小时。
- `HISTORY_MAX_BYTES` 控制单个 room 的历史文件容量上限，默认 10 GiB。
- 清理会在服务启动、查询历史、保存历史、上传文件和定期维护时触发。
- 文本历史不受 `HISTORY_RETENTION_MS` 自动过期影响，用户撤回文本时通过历史文本删除接口移除。

## 环境变量

### 前端

可选变量：

- `VITE_SIGNALING_WS_URL`：显式指定 WebSocket 信令地址。
- `VITE_SIGNALING_HTTP_URL`：显式指定历史记录或调试接口 HTTP 地址。

未设置时，本地开发默认使用 `ws://localhost:8787/ws`；生产环境会基于当前站点地址推导 `/ws`。

### 后端

后端环境变量模板位于 [server/.env.example](server/.env.example)。常用变量包括：

- `PORT`
- `HOST`
- `PUBLIC_WS_URL`
- `PING_INTERVAL_MS`
- `SESSION_IDLE_MS`
- `HISTORY_RETENTION_MS`
- `HISTORY_MAX_BYTES`
- `CLOUDFLARE_AI_ACCOUNT_ID`
- `CLOUDFLARE_AI_API_TOKEN`
- `CLOUDFLARE_AI_MODEL`
- `CLOUDFLARE_AI_FREE_ONLY`
- `CLOUDFLARE_AI_DAILY_NEURON_BUDGET`
- `TURN_URL`
- `TURN_URLS`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

不要把真实密钥、令牌或密码提交到仓库。

## 构建与检查

### 前端

```bash
npm run lint
npm run build
```

`npm run build` 会执行 Next.js 生产构建，并输出静态站点。

### 后端

```bash
cd server
npm run build
```

后端构建产物位于 `server/dist/`。

## 部署

### 前端静态部署

典型流程：

1. 在根目录执行 `npm run build`
2. 部署生成的 `out/` 目录
3. 将未知前端路由回退到 `out/index.html`
4. 将 `/ws` 代理到信令后端，或通过前端环境变量显式指定信令地址

如果需要压缩构建产物，可以使用：

```bash
npm run build:compressed
```

### 后端自托管

生产环境可以在 `server/` 目录执行：

```bash
cd server
npm install
npm run build
npm run start
```

如果后端位于 nginx 之后，需要正确透传 WebSocket Upgrade 头和 `X-Forwarded-For`。

当前自托管部署相关配置可查看 `deploy/` 目录。

## 可用脚本

根目录：

- `npm run dev`：启动前端开发服务器。
- `npm run build`：构建前端静态站点。
- `npm run build:compressed`：构建并压缩前端产物。
- `npm run lint`：运行 ESLint。
- `npm run preview`：预览前端构建产物。

`server/` 目录：

- `npm run dev`：以 watch 模式启动后端。
- `npm run build`：编译后端 TypeScript。
- `npm run start`：运行 `dist/index.js`。

## 设计文档

产品方向、界面布局和交互原则见：

- [DESIGN.md](DESIGN.md)
- [DESIGN.zh-CN.md](DESIGN.zh-CN.md)

这些文档定义了桌面对话工作区、克制的聊天式视觉语言，以及消息和传输流程的设计约束。

## 当前状态

项目仍处于持续迭代阶段：

- 前端已经覆盖主要聊天、文本、文件和历史交互。
- 后端已经覆盖信令、设备发现、room/session 和历史内容接口。
- WebRTC 连接质量、跨网络 TURN 配置和生产部署环境仍需要按实际服务器状态持续验证。
