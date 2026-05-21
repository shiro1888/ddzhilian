# ddzhilian

[English README](README.md)

ddzhilian 是一个面向跨设备协作的轻量传输与聊天工作台。它把设备发现、文件传输、长文本发送、公共对话、AI Chat、生图和历史内容管理收敛到 SnapLink 风格界面中，适合在电脑、手机和浏览器设备之间快速交换内容。

当前仓库包含：

- 基于 Next.js、React 和 TypeScript 的前端应用
- 基于 Node.js、TypeScript 和 `ws` 的信令后端
- 面向 WebRTC 数据通道的配对、会话和中转协调逻辑
- 静态部署、nginx 代理和自托管运行所需的基础配置与文档

## 核心能力

- 设备发现：展示同账号或当前网络环境下可连接的设备。
- 短码配对：通过短互传码快速建立设备关系。
- SnapLink 工作台：用一个轻量对话界面承载 room、文本、文件和历史状态。
- 文件传输：支持拖拽选择、传输进度、接收队列和完成历史。
- 长文本交换：支持普通文本、富文本粘贴和 Markdown 显示。
- 公共对话：支持公共 room 入口和 room 内历史内容。
- 历史内容：文本历史默认保留 24 小时，历史文件按保留时间和容量自动清理。
- 账号生图：登录后使用图片生成，每个账号默认每天 3 张免费额度，免费次数和付费余额都保存在 Supabase 用户表；免费额度每日 04:00 刷新且不累加，生图时优先消耗免费额度，不足部分再消耗付费额度。
- 账号后台：后台入口使用 Supabase 账号邮箱和密码登录，超级管理员来自 `ADMIN_SUPER_EMAILS`，普通管理员写入 Supabase `admin_roles` 表；API 密钥配置仅超级管理员可管理。
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

- `/text`
- `/chat`
- `/image`
- `/admin`

旧的 `/`、`/connect`、`/send`、`/receive` 和 `/sessions` 路径仅作为兼容入口保留，都会回到 `/text`，不再是独立 UI 页面。

当前产品形态以 SnapLink 体验为主，文件发送、接收、文本交换、room 历史、AI Chat 和生图入口都从 SnapLink 外壳进入。`/admin` 仍是直接路由，但不在 SnapLink 导航中展示。

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
- 基于 Supabase Auth 的账号会话、文本生图、上传图片修改、多图参考、每日免费额度、付费额度余额和按账号游标分页加载的生图历史
- 基于 Supabase Auth 的后台管理员账号验证、超级管理员配置和普通管理员增删
- 生成图会保存为服务端图片文件，并以账号鉴权的图片链接返回给前端，而不是把 base64 直接塞进 JSON
- Cloudflare AI 或 OpenRouter 的文本 AI 代理接口
- 通过 Codex 反代地址接入上游图片生成与图片编辑接口

更详细的后端协议说明见 [server/README.md](server/README.md)。生图功能的账号鉴权、API 接入、图片上传、异步返回、图片落盘、历史记录和额度扣减流程见 [docs/IMAGE_GENERATION_IMPLEMENTATION.zh-CN.md](docs/IMAGE_GENERATION_IMPLEMENTATION.zh-CN.md)。

## 历史内容清理

公共 room 和普通 room 使用同一套历史文件临时存储规则：

- 文件保存在 `server/data/history/files/<roomId>/...`。
- 元数据在配置 Supabase 后写入 Supabase；未配置时回退到 `server/data/history/index.json`。
- `HISTORY_RETENTION_MS` 控制历史文件保留时长，默认 6 小时，最大 24 小时。
- `HISTORY_TEXT_RETENTION_MS` 控制历史文本保留时长，默认 24 小时，最大 24 小时。
- `HISTORY_MAX_BYTES` 控制单个 room 的历史文件容量上限，默认 10 GiB。
- 清理会在服务启动、查询历史、保存历史、上传文件和定期维护时触发。
- 超过保留期的历史文本会从元数据索引中删除；超过保留期的历史文件会同时删除元数据和磁盘文件。

## 环境变量

### 前端

可选变量：

- `NEXT_PUBLIC_SIGNALING_WS_URL`：显式指定 WebSocket 信令地址。
- `NEXT_PUBLIC_SIGNALING_HTTP_URL`：显式指定历史记录或调试接口 HTTP 地址。

未设置时，本地开发默认使用 `ws://localhost:8787/ws`；生产环境会基于当前站点地址推导 `/ws`。

### 后端

后端环境变量模板位于 [server/.env.example](server/.env.example)。常用变量包括：

- `PORT`
- `HOST`
- `PUBLIC_WS_URL`
- `PING_INTERVAL_MS`
- `SESSION_IDLE_MS`
- `HISTORY_RETENTION_MS`
- `HISTORY_TEXT_RETENTION_MS`
- `HISTORY_MAX_BYTES`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_HISTORY_FILES_TABLE`
- `SUPABASE_HISTORY_TEXTS_TABLE`
- `SUPABASE_USER_PROFILES_TABLE`
- `SUPABASE_IMAGE_GENERATIONS_TABLE`
- `SUPABASE_ADMIN_ROLES_TABLE`
- `SUPABASE_AUTH_EMAIL_REDIRECT_URL`
- `RESEND_API_KEY`
- `RESEND_TEST_FROM`
- `RESEND_TEST_TO`
- `RESEND_TEST_SUBJECT`
- `RESEND_TEST_ACTION_URL`
- `RESEND_TEST_BRAND_NAME`
- `RESEND_TEST_SUPPORT_EMAIL`
- `RESEND_TEST_TEMPLATE_PATH`
- `ADMIN_SUPER_EMAILS`
- `AI_PROVIDER`
- `AI_WEB_SEARCH_ENABLED`
- `SEARXNG_BASE_URL`
- `SEARXNG_MAX_RESULTS`
- `SEARXNG_TIMEOUT_MS`
- `SEARXNG_SAFE_SEARCH`
- `SEARXNG_LANGUAGE`
- `SEARXNG_CATEGORIES`
- `CLOUDFLARE_AI_ACCOUNT_ID`
- `CLOUDFLARE_AI_API_TOKEN`
- `CLOUDFLARE_AI_MODEL`
- `CLOUDFLARE_AI_MODELS`
- `CLOUDFLARE_AI_FREE_ONLY`
- `CLOUDFLARE_AI_DAILY_NEURON_BUDGET`
- `OPENROUTER_API_KEY`
- `OPENROUTER_API_KEY_FILE`
- `OPENROUTER_MODEL`
- `OPENROUTER_MODELS`
- `OPENROUTER_PREFERRED_MODELS`
- `OPENROUTER_SYNC_SET_PROVIDER`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_REASONING_EFFORT`
- `OPENROUTER_SITE_URL`
- `OPENROUTER_SITE_NAME`
- `CODEX_IMAGE_BASE_URL`
- `CODEX_IMAGE_API_KEY`
- `CODEX_IMAGE_MODEL`
- `CODEX_IMAGE_FALLBACK_MODELS`
- `CODEX_IMAGE_SIZE`
- `CODEX_IMAGE_QUALITY`
- `CODEX_IMAGE_MAX_PROMPT_CHARS`
- `CODEX_IMAGE_PARALLEL_REQUESTS`
- `CODEX_IMAGE_DAILY_FREE_QUOTA`
- `CODEX_IMAGE_QUOTA_RESET_HOUR`
- `CODEX_IMAGE_QUOTA_TIMEZONE_OFFSET_MINUTES`
- `TURN_URL`
- `TURN_URLS`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

不要把真实密钥、令牌或密码提交到仓库。

如果启用 Supabase 历史元数据、账号生图历史或后台管理员角色，需要先执行 [supabase/schema.sql](supabase/schema.sql) 或 [supabase/migrations](supabase/migrations) 下的 SQL，再配置后端环境变量。生图额度准入依赖 `image_quota_reservations` 迁移，用于在调用上游前做数据库级额度预占。账号注册会发送 Supabase 确认邮件，确认前不会创建站内登录会话；生产环境中把你的超级管理员邮箱写入 `ADMIN_SUPER_EMAILS`，把邮箱确认回跳地址写入 `SUPABASE_AUTH_EMAIL_REDIRECT_URL`，不要把邮箱或密钥硬编码进源码。

如果要启用 AI 联网搜索，先部署一个 SearXNG 实例并确认它允许 `format=json`，然后在后端配置 `AI_WEB_SEARCH_ENABLED=true` 和 `SEARXNG_BASE_URL`。前端 `/chat` 的高级设置里打开“联网搜索”后，请求会先由后端查询 SearXNG，再把搜索结果和来源链接注入 AI prompt；普通未开启搜索的聊天不受影响。

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
