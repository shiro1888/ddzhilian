# Admin 接口接入规范

这份文档只服务于当前 `ddzhilian` 的 `/admin` 接入交接。

- 目标：把现有 admin 的功能清单、接口契约、权限边界、响应结构、页面动作到接口映射一次写全，方便下一个 agent 直接接模板。
- 范围：仅覆盖当前 admin 页面真实依赖的 HTTP 接口，以及 `themes` 工作区依赖的上游写入端。
- 不在范围内：模板设计、组件重写、普通前台接口、WebSocket 协议、后端实现原理扩写。

## 1. 文档事实来源

以下文件是本规范的唯一事实来源：

- `server/src/index.ts`
- `src/lib/use-admin.ts`
- `src/lib/use-admin-permissions.ts`
- `src/lib/ddzhilian-types.ts`
- `src/app/components/AdminStage.tsx`
- `src/app/components/admin/*`

不要以 `README` 里的摘要替代这里的契约说明。

## 2. 当前 admin 工作区总览

当前后台固定为 7 个工作区：

| 工作区 | 主要用途 | 读取接口 | 写入接口 | 权限 |
| --- | --- | --- | --- | --- |
| `dashboard` | 仪表盘、统计、系统提示词、供应商概览、危险操作 | `GET /api/admin/session` | `POST /api/admin/ai-config`、`POST /api/admin/ai-config/detect`、`POST /api/admin/ai-config/detect-anthropic`、`POST /api/admin/ai-config/refresh-models`、`POST /api/admin/history/clear` | 查看 `admin`，部分写操作 `super_admin` |
| `models` | 模型总目录、启用状态、默认模型 | `GET /api/admin/session` | `POST /api/admin/ai-config` | 查看 `admin`，保存 `super_admin` |
| `providers` | 供应商切换、OpenAI 兼容接口配置、Anthropic 配置、模型探测 | `GET /api/admin/session` | `POST /api/admin/ai-config`、`POST /api/admin/ai-config/detect`、`POST /api/admin/ai-config/detect-anthropic`、`POST /api/admin/ai-config/refresh-models` | `super_admin` |
| `online` | 在线设备列表、设备改名 | `GET /api/admin/session`、`GET /api/admin/online-devices` | `POST /api/admin/online-devices/name` | `admin` |
| `users` | 用户额度管理 | `GET /api/admin/session` | `POST /api/admin/users/quota` | `admin` |
| `themes` | 查看 SnapLink 主题反馈 | `GET /api/admin/session` | admin 页面自身无写接口；上游写入是 `POST /api/snaplink/theme-submissions` | 只读 `admin` |
| `roles` | 管理员角色管理 | `GET /api/admin/session` | `POST /api/admin/roles`、`DELETE /api/admin/roles/:userId` | `super_admin` |

补充说明：

- `providers` 和 `roles` 在当前 UI 中对非超级管理员直接禁用入口。
- `themes` 页面是只读页，admin 不负责发起主题反馈提交。
- `dashboard`、`models`、`providers` 里的模型和配置编辑都先改本地 React 状态，真正落库/落服务端配置只有一次 `POST /api/admin/ai-config`。

## 3. 通用接入约定

### 3.1 API base 解析

admin 前端统一通过 `resolveAdminApiBaseUrl()` 计算基址：

1. 如果存在 `NEXT_PUBLIC_SIGNALING_HTTP_URL`，使用这个值并去掉末尾 `/`。
2. 浏览器 hostname 为 `localhost` 或 `127.0.0.1` 时，使用 `http://{hostname}:8787`。
3. 浏览器 hostname 为 `::1` 时，使用 `http://[::1]:8787`。
4. 其他情况下走当前站点同源：`${protocol}//${host}`。

结论：下一个模板只要复用这个规则，admin 就会继续命中现有后端。

### 3.2 认证与传输

- 所有 admin 请求都走 `fetch(..., { credentials: 'include' })`。
- 当前 admin 不使用 Bearer Token。
- JSON `POST` 请求统一带 `content-type: application/json`。
- admin 会话依赖 HttpOnly Cookie `ddzhilian_admin_session`。
- `POST /api/admin/login` 成功时，除了 admin Cookie，还会顺带写入账号 Cookie `ddzhilian_user_session`。
- `POST /api/admin/logout` 只清理 admin Cookie，不会主动清理 `ddzhilian_user_session`。

### 3.3 权限等级

| 等级 | 说明 |
| --- | --- |
| `anonymous` | 未登录也可调用，例如登录入口本身、上游主题提交通道 |
| `admin` | 只要是管理员账号即可 |
| `super_admin` | 只有 `ADMIN_SUPER_EMAILS` 命中的超级管理员可调用 |
| `dev-only` | 仅开发环境开放 |

### 3.4 错误体约定

绝大多数失败响应都遵循：

```json
{
  "error": "错误信息"
}
```
前端统一用 `readAdminApiError()` 读取 `error` 字段；如果响应体不是 JSON 或没有 `error`，才退回默认文案。

### 3.5 当前 UI 中没有单独后端接口的功能

这些能力是纯前端行为，不要误以为缺接口：

- `dashboard` 小组件显示/隐藏、排序、拖拽和尺寸调整：当前没有后端持久化接口。
- `users`、`themes`、`online` 的搜索、排序、分页：当前都是前端本地处理。
- `users`、`themes` 导出 CSV：当前是前端本地导出，不经过后端。
- `themes` 页面自身没有“审核通过/驳回”类接口。
- `models` 页面没有单独的“拉模型目录”接口，模型目录来自 `GET /api/admin/session` 返回的 `ai` 快照。

## 4. 共享响应与请求模型

### 4.1 `AdminStateResponse`

`GET /api/admin/session` 是 admin 主快照入口。多个写接口也会直接返回同一套聚合快照或其大部分字段。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `admin` | `AdminSessionInfo` | 当前管理员基础信息：`userId`、`email`、`role`、`isSuperAdmin` |
| `history` | `AdminHistoryStats` | 历史文本/文件/房间统计 |
| `ai` | `AdminAiSettings` | 当前 AI 供应商配置、系统提示词、模型开关、反馈供应商配置 |
| `usage` | `AdminUsageSnapshot` | 模型调用统计、趋势、Cloudflare 配额、OpenRouter 余额 |
| `onlineDevices` | `AdminOnlineDevicesSnapshot` | 在线设备快照 |
| `users` | `AdminUsersSnapshot` | 用户额度快照 |
| `roles` | `AdminRolesSnapshot` | 管理员角色快照，仅 `super_admin` 才会返回 |
| `themeSubmissions` | `AdminThemeSubmissionsSnapshot` | 主题反馈快照 |
| `serverTime` | `string` | 服务器当前时间，ISO 字符串 |

额外约束：

- 非超级管理员拿到的 `ai` 是脱敏版本，不应该期待里面有原始密钥。
- 非超级管理员通常拿不到 `roles`。
- `users`、`roles`、`themeSubmissions` 都是“快照”概念，不是单独分页接口。

### 4.2 `AdminPermissionsResponse`

`GET /api/admin/permissions` 返回：

```ts
type AdminPermissionsResponse = {
  authenticated: boolean
  canRecallAnyMessage: boolean
  admin?: AdminSessionInfo
}
```

这个接口更轻量，主要给非 admin 页判断“当前管理员是否有全局撤回权限”。

### 4.3 关键写入请求模型

#### `POST /api/admin/ai-config`

请求体是 `AdminAiSettings`，核心结构如下：

```ts
type AdminAiSettings = {
  provider: string
  systemPrompt: string
  cloudflare: AdminCloudflareConfig
  openrouter: AdminOpenRouterConfig
  feedbackProviders: AdminFeedbackProviderConfig[]
}
```

可直接把它理解成“后台当前全部 AI 配置快照回写”。

#### `POST /api/admin/ai-config/detect`

```ts
type AdminOpenAiCompatibleDetectInput = {
  baseUrl: string
  apiKey: string
  modelId?: string
  wireApi?: 'chat_completions' | 'responses'
  reasoningEffort?: '' | 'low' | 'medium' | 'high'
}
```

#### `POST /api/admin/ai-config/detect-anthropic`

```ts
type AdminAnthropicDetectInput = {
  baseUrl: string
  authToken: string
  modelId?: string
}
```

#### `POST /api/admin/online-devices/name`

```ts
type AdminOnlineDeviceNameUpdate = {
  deviceId: string
  deviceName: string
}
```

#### `POST /api/admin/users/quota`

```ts
type AdminUserQuotaUpdate = {
  imageQuotaUsed: number
  imagePaidQuotaRemaining: number
  imagePaidQuotaUsed: number
}
```

真实请求体还会额外带一个 `userId`。

## 5. 页面动作到接口映射

| 页面动作 | 工作区 | 接口 | 请求体 / 参数 | 成功后前端如何处理 |
| --- | --- | --- | --- | --- |
| 首次加载后台 | 全局 | `GET /api/admin/session` | 无 | 初始化 `admin`、`history`、`ai`、`usage`、`onlineDevices`、`users`、`roles`、`themeSubmissions` |
| 管理员登录 | 登录页 | `POST /api/admin/login` | `{ email, password }` | 直接用返回的聚合快照完成登录，不会再立刻补一次 `session` |
| 开发环境一键登录 | 登录页 | `POST /api/admin/dev-login` | 无 | 同上，但只在开发环境存在 |
| 退出后台 | 全局 | `POST /api/admin/logout` | 无 | 当前前端不依赖响应体，直接清本地 admin 状态 |
| 非 admin 页检查全局撤回权限 | 非后台页面 | `GET /api/admin/permissions` | 无 | 只读取 `authenticated` 和 `canRecallAnyMessage` |
| 在线设备轮询刷新 | `online` 及全局状态 | `GET /api/admin/online-devices` | 无 | 每 2 秒刷新一次 `onlineDevices` |
| 检测 OpenAI 兼容模型 | `dashboard` / `providers` | `POST /api/admin/ai-config/detect` | `AdminOpenAiCompatibleDetectInput` | 只拿检测结果，不写回当前配置 |
| 检测 Anthropic 模型 | `providers` | `POST /api/admin/ai-config/detect-anthropic` | `AdminAnthropicDetectInput` | 只拿检测结果，不写回当前配置 |
| 刷新 OpenAI 兼容模型列表 | `dashboard` / `providers` | `POST /api/admin/ai-config/refresh-models` | 当前 UI 发送 `{}` | 返回 `refresh` 结果和新的后台快照，前端整体覆盖相关状态 |
| 保存 AI 配置 | `dashboard` / `models` / `providers` | `POST /api/admin/ai-config` | `AdminAiSettings` | 返回新的后台快照，前端整体覆盖相关状态 |
| 清空历史记录 | `dashboard` | `POST /api/admin/history/clear` | 当前 UI 发送 `{}` | 返回新的后台快照，前端整体覆盖相关状态 |
| 修改在线设备名称 | `online` | `POST /api/admin/online-devices/name` | `{ deviceId, deviceName }` | 只刷新 `onlineDevices`，并显示成功 Toast |
| 保存用户额度 | `users` | `POST /api/admin/users/quota` | `{ userId, imageQuotaUsed, imagePaidQuotaRemaining, imagePaidQuotaUsed }` | 只刷新 `users` 快照 |
| 添加管理员 | `roles` | `POST /api/admin/roles` | `{ email }` | 只刷新 `roles` 快照 |
| 删除管理员 | `roles` | `DELETE /api/admin/roles/:userId` | 路径参数 | 只刷新 `roles` 快照 |
| SnapLink 上游提交主题反馈 | 非 admin 页面 | `POST /api/snaplink/theme-submissions` | `{ source, colors, deviceId, deviceName, accountId }` | admin 不主动调用；`themes` 页下一次拿 `session` 时读取结果 |

关键接入判断：

- 如果新模板需要后台初始化数据，优先用 `GET /api/admin/session`，不要拆成多次请求。
- 如果新模板里要做搜索、排序、分页、CSV 导出，当前后端没有专门接口，继续在前端本地处理即可。
- 如果新模板里要做模型启用/默认值调整，修改的是本地 `AdminAiSettings` 草稿，最终仍然统一提交到 `POST /api/admin/ai-config`。

## 6. 接口目录

以下目录只列出当前 admin 真实接入的端点。

### 6.1 `POST /api/admin/login`

- 用途：管理员邮箱密码登录。
- 调用工作区/动作：登录页点击“进入后台”。
- 权限要求：`anonymous`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：

```json
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

- 成功响应关键字段：
  - `200`
  - `{ ok: true, authenticated: true, ...AdminStateResponse }`
  - 服务端会设置 `ddzhilian_admin_session`
  - 同时也会设置 `ddzhilian_user_session`
- 常见失败：
  - `400` 请求体不是合法 JSON
  - `403` 当前账号不是管理员
  - `503` 未配置 Supabase，无法走管理员账号登录
  - 其他 `AccountAuthError` 会直接透传状态码和错误消息
- 前端接入备注：
  - 当前前端不会在登录成功后再补一次 `GET /api/admin/session`。
  - 登录成功返回的聚合快照就是后台首帧数据。

### 6.2 `POST /api/admin/dev-login`

- 用途：开发环境快捷进入后台。
- 调用工作区/动作：登录页开发环境按钮。
- 权限要求：`dev-only`。
- 请求头 / Cookie：`credentials: 'include'`。
- 请求体：无。
- 成功响应关键字段：
  - `200`
  - `{ ok: true, authenticated: true, ...AdminStateResponse }`
  - 只设置 `ddzhilian_admin_session`
- 常见失败：
  - `404` 当前后端不是开发环境，接口不存在
  - `500` 本地开发 admin 会话创建失败
- 前端接入备注：
  - 当前前端通过 `process.env.NODE_ENV === 'development'` 控制按钮显示。
  - 这个接口不应该出现在生产模板里。

### 6.3 `POST /api/admin/logout`

- 用途：退出后台。
- 调用工作区/动作：侧边栏“退出后台”。
- 权限要求：`admin`。
- 请求头 / Cookie：`credentials: 'include'`。
- 请求体：无。
- 成功响应关键字段：

```json
{
  "ok": true
}
```

- 常见失败：当前实现基本不把“无会话”视为错误。
- 前端接入备注：
  - 当前前端不依赖响应体内容，调用后直接清空本地 admin 状态。
  - 这个接口只清 `ddzhilian_admin_session`，不会清 `ddzhilian_user_session`。

### 6.4 `GET /api/admin/session`

- 用途：admin 主快照入口。
- 调用工作区/动作：
  - 后台首次加载
  - 登录成功后的状态种子
  - 所有工作区的数据基础
- 权限要求：`admin`。
- 请求头 / Cookie：`credentials: 'include'`。
- 查询参数：无。
- 成功响应关键字段：
  - 未登录或会话无效时：

```json
{
  "authenticated": false
}
```

  - 已登录时：

```json
{
  "authenticated": true,
  "admin": {},
  "history": {},
  "ai": {},
  "usage": {},
  "onlineDevices": {},
  "users": {},
  "roles": {},
  "themeSubmissions": {},
  "serverTime": "2026-05-25T00:00:00.000Z"
}
```

- 字段拆解：
  - `admin`：当前管理员身份，决定是否 `isSuperAdmin`
  - `history`：仪表盘历史统计
  - `ai`：供应商、系统提示词、模型列表和反馈供应商配置
  - `usage`：模型调用统计、趋势、余额
  - `onlineDevices`：在线设备快照
  - `users`：Supabase 用户与额度快照
  - `roles`：管理员角色快照，仅超级管理员可见
  - `themeSubmissions`：主题反馈快照
  - `serverTime`：服务器时间
- 常见失败：
  - `500` 后台状态构建失败
- 前端接入备注：
  - 这是当前 admin 的单一真相入口。
  - 下一个模板如果要重写页面，建议仍然保留“先取一次 `session` 再进入各工作区”的模式。
  - `themes` 页面没有单独读接口，数据来自这里的 `themeSubmissions`。

### 6.5 `GET /api/admin/online-devices`

- 用途：在线设备列表轻量轮询。
- 调用工作区/动作：admin 登录后，每 2 秒自动轮询一次。
- 权限要求：`admin`。
- 请求头 / Cookie：`credentials: 'include'`。
- 查询参数：无。
- 成功响应关键字段：

```json
{
  "onlineDevices": {
    "devices": [],
    "loadedAt": "2026-05-25T00:00:00.000Z"
  }
}
```

- 常见失败：
  - `401` / `403` admin 会话失效
  - `500` 读取在线设备失败
- 前端接入备注：
  - 当前前端收到 `401/403` 会直接把 admin 状态打回未登录。
  - 搜索和筛选都在前端完成，后端不会分页。

### 6.6 `GET /api/admin/permissions`

- 用途：轻量权限探测。
- 调用工作区/动作：`use-admin-permissions.ts`，当前主要给非 admin 页判断是否允许“全局撤回消息”。
- 权限要求：`anonymous` 可调用，但只有 admin 会返回能力。
- 请求头 / Cookie：`credentials: 'include'`。
- 查询参数：无。
- 成功响应关键字段：
  - 未登录时：

```json
{
  "authenticated": false,
  "canRecallAnyMessage": false
}
```

  - 已登录 admin：

```json
{
  "authenticated": true,
  "canRecallAnyMessage": true,
  "admin": {
    "userId": "xxx",
    "email": "admin@example.com",
    "role": "admin",
    "isSuperAdmin": false
  }
}
```

- 常见失败：
  - `500` 权限读取失败
- 前端接入备注：
  - 这个接口不是 admin 仪表盘主数据源。
  - 它的价值是轻量，不要拿它替代 `GET /api/admin/session`。

### 6.7 `POST /api/admin/ai-config/detect`

- 用途：探测 OpenAI 兼容接口可用模型。
- 调用工作区/动作：供应商配置页、仪表盘里的供应商配置组件。
- 权限要求：`super_admin`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：`AdminOpenAiCompatibleDetectInput`。
- 成功响应关键字段：

```json
{
  "ok": true,
  "baseUrl": "https://api.openai.com/v1",
  "selectedModelId": "gpt-4.1-mini",
  "models": [
    { "id": "gpt-4.1-mini", "label": "gpt-4.1-mini" }
  ],
  "checkedModelCount": 12,
  "failedModelCount": 3
}
```

- 常见失败：
  - `400` JSON 无效，或缺少 `baseUrl` / `apiKey`
  - `401` / `403` 非超级管理员
  - `502` 没检测到可用模型，或上游网络失败
- 前端接入备注：
  - 当前前端把结果只当“检测回显”，不会自动写回当前配置。
  - 要真正保存到服务端，还要再走一次 `POST /api/admin/ai-config`。

### 6.8 `POST /api/admin/ai-config/detect-anthropic`

- 用途：探测 Anthropic 兼容接口可用模型。
- 调用工作区/动作：供应商配置页。
- 权限要求：`super_admin`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：`AdminAnthropicDetectInput`。
- 成功响应关键字段：

```json
{
  "ok": true,
  "baseUrl": "https://api.anthropic.com",
  "selectedModelId": "claude-3-5-sonnet",
  "models": [
    { "id": "claude-3-5-sonnet", "label": "Claude 3.5 Sonnet" }
  ]
}
```

- 常见失败：
  - `400` JSON 无效，或缺少 `baseUrl` / `authToken`
  - `401` / `403` 非超级管理员
  - `502` 模型读取失败
- 前端接入备注：
  - 同样只返回检测结果，不自动保存当前配置。

### 6.9 `POST /api/admin/ai-config/refresh-models`

- 用途：刷新当前 OpenAI 兼容接口的模型列表，并回灌到后台状态。
- 调用工作区/动作：供应商页“刷新模型列表”。
- 权限要求：`super_admin`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：当前前端发送空对象 `{}`。
- 成功响应关键字段：

```json
{
  "ok": true,
  "refresh": {
    "refreshed": true,
    "baseUrl": "https://api.openai.com/v1",
    "selectedModelId": "gpt-4.1-mini",
    "models": [],
    "checkedModelCount": 0,
    "failedModelCount": 0,
    "refreshedAt": "2026-05-25T00:00:00.000Z"
  },
  "admin": {},
  "history": {},
  "ai": {},
  "usage": {},
  "onlineDevices": {},
  "users": {},
  "roles": {},
  "themeSubmissions": {},
  "serverTime": "2026-05-25T00:00:00.000Z"
}
```

- 常见失败：
  - `400` 当前 OpenAI 兼容接口未配置，或刷新被跳过
  - `401` / `403` 非超级管理员
  - `502` 刷新失败
- 前端接入备注：
  - 这是“检测 + 刷新当前配置”的接口，不等于单纯探测。
  - 当前前端会用返回的完整快照覆盖 `admin`、`ai`、`history`、`usage`、`onlineDevices`、`users`、`roles`、`themeSubmissions`。

### 6.10 `POST /api/admin/ai-config`

- 用途：保存后台当前 AI 配置。
- 调用工作区/动作：
  - 仪表盘里的供应商配置和 System Prompt 保存
  - `models` 页面保存模型开关和默认模型
  - `providers` 页面保存供应商配置
- 权限要求：`super_admin`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：完整 `AdminAiSettings`。
- 成功响应关键字段：

```json
{
  "ok": true,
  "admin": {},
  "history": {},
  "ai": {},
  "usage": {},
  "onlineDevices": {},
  "users": {},
  "roles": {},
  "themeSubmissions": {},
  "serverTime": "2026-05-25T00:00:00.000Z"
}
```

- 常见失败：
  - `400` JSON 无效或配置结构不合法
  - `401` / `403` 非超级管理员
  - `500` 保存失败
- 前端接入备注：
  - 当前 UI 的模型启用状态、默认模型、系统提示词、供应商参数编辑都在本地 state 里暂存。
  - 只有调用这个接口后，修改才真正持久化。

### 6.11 `POST /api/admin/history/clear`

- 用途：清空后端历史记录并重建后台快照。
- 调用工作区/动作：仪表盘危险操作区。
- 权限要求：`admin`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：当前前端发送空对象 `{}`。
- 成功响应关键字段：

```json
{
  "ok": true,
  "admin": {},
  "history": {},
  "ai": {},
  "usage": {},
  "onlineDevices": {},
  "users": {},
  "roles": {},
  "themeSubmissions": {},
  "serverTime": "2026-05-25T00:00:00.000Z"
}
```

- 常见失败：
  - `401` / `403` admin 会话失效
  - `500` 清空失败或后台快照重建失败
- 前端接入备注：
  - 当前前端和 `POST /api/admin/ai-config` 一样，会把返回的快照整体覆盖到本地状态。

### 6.12 `POST /api/admin/online-devices/name`

- 用途：修改在线设备显示名称。
- 调用工作区/动作：`online` 页面表格行内保存。
- 权限要求：`admin`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：

```json
{
  "deviceId": "device-123",
  "deviceName": "新的显示名称"
}
```

- 成功响应关键字段：

```json
{
  "ok": true,
  "device": {},
  "onlineDevices": {
    "devices": [],
    "loadedAt": "2026-05-25T00:00:00.000Z"
  },
  "serverTime": "2026-05-25T00:00:00.000Z"
}
```

- 常见失败：
  - `400` JSON 无效、`deviceId` 为空、`deviceName` 为空
  - `401` / `403` admin 会话失效
  - `404` 设备已离线
  - `500` 保存失败
- 前端接入备注：
  - 服务端改名成功后会 `broadcastSnapshots()`，在线客户端会同步看到新名称。
  - 当前前端只更新 `onlineDevices` 快照，不重新拉整页 `session`。

### 6.13 `POST /api/admin/users/quota`

- 用途：修改用户免费/付费额度。
- 调用工作区/动作：`users` 页面行内保存。
- 权限要求：`admin`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：

```json
{
  "userId": "user-123",
  "imageQuotaUsed": 1,
  "imagePaidQuotaRemaining": 20,
  "imagePaidQuotaUsed": 3
}
```

- 成功响应关键字段：

```json
{
  "ok": true,
  "user": {},
  "users": {
    "configured": true,
    "users": [],
    "loadedAt": "2026-05-25T00:00:00.000Z"
  },
  "serverTime": "2026-05-25T00:00:00.000Z"
}
```

- 常见失败：
  - `400` JSON 无效，或额度字段不是非负整数
  - `401` / `403` admin 会话失效
  - `503` Supabase 账号系统未配置
  - `500` 保存失败
- 前端接入备注：
  - 当前表格的搜索、排序、分页是本地完成的。
  - 保存后只替换 `users` 快照，不重新请求整页 `session`。

### 6.14 `POST /api/admin/roles`

- 用途：添加管理员角色。
- 调用工作区/动作：`roles` 页面添加管理员。
- 权限要求：`super_admin`。
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`。
- 请求体：

```json
{
  "email": "admin@example.com"
}
```

- 成功响应关键字段：

```json
{
  "ok": true,
  "role": {},
  "roles": {
    "configured": true,
    "roles": [],
    "loadedAt": "2026-05-25T00:00:00.000Z"
  },
  "serverTime": "2026-05-25T00:00:00.000Z"
}
```

- 常见失败：
  - `400` JSON 无效
  - `401` / `403` 非超级管理员
  - `503` Supabase 账号系统未配置
  - `500` 添加失败
- 前端接入备注：
  - 当前前端只刷新 `roles` 快照。
  - UI 里只有超级管理员能看到并使用这个动作。

### 6.15 `DELETE /api/admin/roles/:userId`

- 用途：删除数据库型普通管理员角色。
- 调用工作区/动作：`roles` 页面行内删除。
- 权限要求：`super_admin`。
- 请求头 / Cookie：`credentials: 'include'`。
- 路径参数：
  - `userId`：管理员账号的用户 ID
- 请求体：无。
- 成功响应关键字段：

```json
{
  "ok": true,
  "roles": {
    "configured": true,
    "roles": [],
    "loadedAt": "2026-05-25T00:00:00.000Z"
  },
  "serverTime": "2026-05-25T00:00:00.000Z"
}
```

- 常见失败：
  - `401` / `403` 非超级管理员
  - `503` Supabase 账号系统未配置
  - `500` 删除失败
- 前端接入备注：
  - 当前 UI 只允许删除 `role === 'admin'` 且 `source === 'database'` 的记录。
  - 来自 `ADMIN_SUPER_EMAILS` 的 `super_admin` 记录在 UI 中是不可删除的。

## 7. 附录接口

这些接口和 admin 相关，但不是当前 admin 页的主接入面。

### 7.1 `GET /api/admin/state`

- 用途：读取严格受保护的后台状态。
- 当前状态：存在于后端，但当前 admin 页没有直接调用。
- 与 `GET /api/admin/session` 的关键区别：
  - 未授权时不会返回 `{ authenticated: false }`
  - 未授权时会直接返回错误状态码和 `{ error }`
  - 成功时直接返回 `AdminStateResponse`，没有 `authenticated` 包装
- 适用场景：
  - 如果未来模板已经有单独的登录态守卫，想在进入后台后只打严格受保护接口，可以考虑它。
- 当前建议：
  - 仍然优先保留 `GET /api/admin/session` 作为首帧入口，减少接入偏差。

### 7.2 `POST /api/snaplink/theme-submissions`

- 用途：SnapLink 前台把 Beta 主题配色提交到后端。
- 当前状态：不是 admin 页面发起，但 `themes` 工作区的数据来源依赖它。
- 当前调用方：`src/app/components/SnapLinkStage.tsx`
- 权限要求：`anonymous`
- 请求头 / Cookie：`content-type: application/json`，`credentials: 'include'`
- 请求体：

```json
{
  "source": "snaplink-beta",
  "colors": {
    "self": "#95ec69",
    "peer": "#ffffff",
    "ai": "#f5f5f5"
  },
  "deviceId": "device-123",
  "deviceName": "My Device",
  "accountId": "user-123"
}
```

- 成功响应关键字段：

```json
{
  "ok": true,
  "storedIn": "supabase"
}
```

- 常见失败：
  - `400` 请求体不合法
  - `413` 请求体过大
  - `500` 提交失败
- 前端接入备注：
  - 当前 SnapLink 会对配色提交做防抖。
  - 提交失败不会打断前台即时换色。
  - admin 的 `themes` 页面不直接打这个接口，只通过 `GET /api/admin/session` 读取聚合后的 `themeSubmissions`。

## 8. 对下一个模板 agent 的直接建议

- 后台首帧不要自己拼多个接口，直接从 `GET /api/admin/session` 起。
- 所有“改配置再保存”的交互，都先在前端本地 state 编辑，最后统一走后端写接口。
- `themes` 是只读工作区，不要误加不存在的审核接口。
- `users`、`themes`、`online` 的搜索/分页/导出继续做前端本地逻辑即可。
- 如果要拆更细的页面组件，优先围绕这几个快照来拆：
  - `AdminStateResponse`
  - `AdminOnlineDevicesSnapshot`
  - `AdminUsersSnapshot`
  - `AdminRolesSnapshot`
  - `AdminThemeSubmissionsSnapshot`
