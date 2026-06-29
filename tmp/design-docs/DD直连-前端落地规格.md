# DD直连 / ddzhilian 前端落地规格（Codex 实现版）

> 目标读者：Codex（代码实现 Agent）。本文不是视觉描述，而是「照着改代码」的规格。
> 全部基于当前仓库真实结构：`src/app/components/SnapLinkStage.tsx`、`src/app/types.ts`、`src/lib/ddzhilian-types.ts`、`src/app/routes.ts`、`src/index.css`、`src/App.css`。
> 配套高保真原型：`DD直连工作台.dc.html`（桌面 + 移动 + 8 态传输 + 弹窗，可交互）。

---

## 0. 阅读现状结论（先读这段）

当前代码已经实现了一个「工作台外壳」，并不是从零开始：

- **路由层**（`routes.ts`）：`NavView = 'text' | 'chat' | 'image' | 'admin' | 'command'`，映射 `/text /chat /image /admin /web-command`，默认 `text`。`App.tsx::handleViewChange(view)` 负责切换。
- **主工作台**（`SnapLinkStage.tsx`，4800+ 行）：内部用 `workbenchMode = 'nearby' | 'rooms' | 'files' | 'transfers'` 切换中央内容，渲染函数已存在：`renderWorkbenchNearbySection()`、`renderWorkbenchRoomsSection()`、`renderWorkbenchDropZone()`、`renderWorkbenchTransferBoard()`、`renderWorkbenchModeContent()`、`renderWorkbenchView()`。
- **左侧 72px 导航**已存在：附近设备 / 房间 / 文件 / 传输 / AI / 命令 + 设置 + 头像，handler 为 `handleShowWorkbenchNearby` / `handleShowWorkbenchRooms` / `handleWorkbenchFilePick` / `handleShowWorkbenchQueue` / `handleOpenAiChat` / `handleOpenCommand`。
- **数据模型已就绪**（`ddzhilian-types.ts`）：`TransferItem` 已经定义了完整 8 态机；`PeerSummary` / `RoomSummary` / `HistoryFileSummary` / `HistoryTextSummary` / `ChannelMessage` 等齐全。

**核心问题（本规格要解决的）**：

1. 左侧导航的「文件 / 传输」点击行为弱：`文件`直接弹文件选择器、`传输`只是切 workbenchMode，页面区分不强 → 用户感觉「点了没反应」。
2. `nearby / rooms / files / transfers` 四个模式塞在一个巨型组件里，缺少独立页面骨架与统一空/加载/错误状态。
3. 文本 / 设置 / 历史 没有作为一等页面，散落在弹层或会话里。
4. 设备卡缺「连接方式 / 信任态」表达；传输卡缺「速度 / 剩余时间」——但这些字段后端没有（见 §4 字段可用性）。
5. 空状态太多时页面发空。

> **本规格不要求重写 WebRTC / 文件分块 / 信令逻辑**，只重构 UI 结构、组件拆分与状态呈现。

---

## 一、产品级设计原则

- **核心心智**：DD直连是「附近设备直传工作台」。第一屏第一眼必须是「这台设备 + 附近还有谁 + 把文件丢过去」。不是聊天软件、不是网盘、不是后台。
- **主任务（Primary）**：① 发现附近设备；② 向设备/房间发送文件、图片、文本。这两件事永远占据视觉主轴（左导航前两项 + 中央区 + 右队列）。
- **次级任务（Secondary）**：房间会话、历史记录、文本长文、设置、AI 辅助、命令行。可达但不抢主轴。
- **导航原则**：
  - 左侧 72px 图标栏 = 全局一级导航，顺序固定：附近设备 → 房间 → 文件 → 传输 →（分隔）→ 文本 → 历史 → AI → 命令 →（底部）设置 + 头像。
  - 主任务（附近/房间/文件/传输）走 `workbenchMode`，**同屏切换、右侧传输队列常驻**。
  - 重场景（AI / 命令 / 生图 / Admin）走 `NavView` 整页路由切换。
  - 任何页面右侧都保留「传输队列」常驻（或可折叠），让传输态全局可见。
- **信任与安全是卖点**：「文件不经过服务器 / 仅在设备之间传输 / 端到端」必须在状态条常驻表达。
- **进度诚实原则（硬规则）**：连接阶段（connecting/ready）进度条恒为 0%，只有 `transferring` 阶段、且基于对方 `file-ack` 的 `acknowledgedBytes` 才增长；只有收到 `file-complete`/`completed` 才显示 100%。**禁止用连接动画假装传输进度。**

---

## 二、信息架构（左侧导航 → 主区域）

| 导航项 | 机制 | 点击后主区域显示 | 优先级 |
|---|---|---|---|
| 附近设备 | `workbenchMode='nearby'` | 设备发现区（列表/网格）+ 拖拽发送区 + 右侧队列 | 必须 |
| 房间 | `workbenchMode='rooms'` | 房间列表（公共/历史会话），点进入会话页 | 必须 |
| 文件 | `workbenchMode='files'` | **大号拖拽发送页**（不再只弹文件选择器），含目标选择 + 最近发送 | 必须 |
| 传输 | `workbenchMode='transfers'` | 传输队列全屏视图（进行中 / 已完成 / 失败分组） | 必须 |
| 文本 | `NavView='text'` 内子页 或独立 | 长文本发送页（输入 + 目标 + 历史文本） | 必须 |
| 历史 | 新增子页 | 历史文件 + 历史文本时间线（来自 `historyFiles`/`historyTexts`） | 可选增强 |
| AI | `NavView='chat'` → `/chat` | `ChatAiStage`（已存在） | 保留 |
| 命令 | `NavView='command'` → `/web-command` | `WebCommandStage`（已存在） | 保留 |
| 设置 | 抽屉/弹层 `setIsThemePanelOpen` | 设备名、可发现性、主题、偏好 | 必须（提级为页/抽屉） |

> 生图 `image` / 后台 `admin` 路由保留，不在本次主线，但导航不暴露给普通用户（保持现状）。

---

## 三、页面设计规格（逐页）

> 通用约定：桌面三栏 = `72px 左导航 | 弹性主区 | 280–360px 右队列`；移动端 = 顶部状态 + 主体 + 底部固定操作区 + 队列抽屉。加载/错误/空状态若与 §6 一致则引用，不重复描述。

### 3.1 附近设备页（必须）
1. **目标**：一眼看到本机身份 + 附近设备 + 一键发送。
2. **桌面**：顶部状态条（身份 + 连接胶囊 + 在线数 + 重新扫描）；中央设备区（列表或网格，tweak 可切）；下方拖拽发送区；右侧常驻队列。
3. **移动**：顶部身份 + 连接胶囊（横向滚动）；设备列表；底部「选择文件 / 拍照 / 发送文本」；队列抽屉。
4. **核心组件**：`DeviceIdentityChip`、`StatusPills`、`NearbyDevicesPanel`、`DeviceCard`、`DropZone`、`TransferQueuePanel`。
5. **空状态**：扫描波纹 + 「暂无附近设备 / 请确认同一 Wi-Fi 并在对方打开 DD直连」+「重新扫描」。
6. **加载**：首次快照拉取时设备区显示 3 个骨架卡；`重新扫描`时按钮转圈 + 列表顶部扫描扫光带。
7. **错误**：信令/快照失败 → 顶部细条「无法连接发现服务，正在重试…」+ 手动重试。
8. **交互**：点设备=选中；点「发送文件」=选中并触发文件选择/拖拽队列；拖文件到设备卡=直接对该设备发起。
9. **文案**：附近设备 / 等待同一 Wi-Fi 内的设备出现 / 重新扫描 / 局域网直传 / 仅在设备之间传输。
10. **Codex 要点**：从 `renderWorkbenchNearbySection()` 抽出 `NearbyDevicesPanel` + `DeviceCard`，数据用现有 `onlineDeviceItems`（见 `OnlineDeviceListItem`）。连接方式/信任态见 §4。

### 3.2 房间页（必须）
1. **目标**：进入公共房间或历史会话做会话式文件/文本传输。
2. **桌面**：房间列表（卡片：标题、成员数/在线数、最近预览、未读角标、置顶）；右侧仍可保留队列；顶部「创建公共房间 / 加入（短码）」。
3. **移动**：房间列表纵向；FAB「创建/加入」；点进入会话页（全屏）。
4. **核心组件**：`RoomsPage`、`RoomCard`、`CreateOrJoinRoomBar`、`EmptyState`。
5. **空状态**：「暂无房间 / 创建或加入公共房间后会出现在这里」+ 主按钮。
6. **加载**：房间列表骨架行 ×3。
7. **错误**：创建/加入失败 → 行内错误提示 + 重试（用 `ServerEvent.error.code/message`）。
8. **交互**：点卡进入会话；右键/长按=置顶/退出；未读在 `RoomListItem.unreadCount`。
9. **文案**：房间 / 公共房间 / 创建房间 / 输入短码加入 / 暂无房间。
10. **Codex 要点**：复用 `RoomListItem`（`src/app/types.ts`）与 `create-public-room` / `join-room` 事件，从 `renderWorkbenchRoomsSection()` 抽 `RoomsPage`。

### 3.3 房间会话页（必须）
1. **目标**：在房间内收发文本与文件，看到成员与连接态。
2. **桌面**：左=会话流（`UnifiedConversationEntry`：text/notice/file 混排）；右=成员/共享内容标签（`SharedContentTab`：chat/media/files/links）；底部=输入条（文本 + 附件 + 发送）。
3. **移动**：全屏会话流 + 底部输入条；成员/共享内容走顶部入口抽屉。
4. **核心组件**：`RoomConversationPage`、`ConversationStream`、`MessageBubble`（self `#95ec69` / peer `#fff`）、`FileMessageCard`（即 `FileConversationEntry`）、`Composer`、`MemberList`、`SharedContentTabs`。
5. **空状态**：「这里还没有消息 / 发送第一条文本或文件开始」。
6. **加载**：历史拉取骨架气泡；文件接收中走传输态。
7. **错误**：文本发送失败 `status:'failed'` 显示重发；文件失败走传输卡 `failed` + 重试。
8. **交互**：Enter 发送（受 `DevicePreferencesPayload.enterToSend`）；撤回 `canRecall`；文件下载 `onDownload`；文档预览 `onOpenDocumentPreview` → `DocumentPreviewDialog`。
9. **文案**：发送文本 / 拖文件到此发送 / 已撤回 / 等待对方确认 / 正在发送。
10. **Codex 要点**：会话流已有 `UnifiedConversationEntry`，重点是把气泡/文件卡/输入条拆成可复用子组件，不动通道收发逻辑（`ChannelMessage`）。

### 3.4 文件发送页（必须）
1. **目标**：把「文件」一级入口做成真正的发送工作页（解决「点文件只弹选择器」）。
2. **桌面**：超大 `DropZone`（占主区 60%）+「选择文件 / 发送图片 / 发送文本」；上方「发送到：[设备/房间选择器]」；下方「最近发送」缩略；右侧队列。
3. **移动**：大拖拽区 + 底部操作；目标选择器在顶部。
4. **核心组件**：`FileSendPage`、`DropZone`、`SendTargetSelector`、`RecentSendsStrip`。
5. **空状态**：未选目标时 DropZone 副标题「先选择一个已连接设备」；选了则「发送到 xxx」。
6. **加载**：选文件后立即建任务（`queued`）进队列，不空等。
7. **错误**：无目标 → 提示选目标；目标离线 → `waiting_for_target`。
8. **交互**：拖入=对当前目标建任务；目标选择器可切设备或房间。
9. **文案**：拖拽文件到这里 / 或选择一个设备发送 / 仅在设备之间传输 · 文件不经过服务器。
10. **Codex 要点**：`workbenchMode='files'` 当前 = `renderWorkbenchDropZone('full')`，扩成带目标选择器的页；任务统一进 `TransferItem` 队列（§4）。

### 3.5 传输队列页（必须）
1. **目标**：集中查看/管理所有传输任务（全局可见）。
2. **桌面**：分组「进行中 / 已完成 / 失败」，每条 `TransferTaskCard`：图标、文件名、目标、状态点、百分比、速度、剩余、操作；顶部统计（进行中 N · 已完成 M）。
3. **移动**：同列表 + 底部抽屉形态复用。
4. **核心组件**：`TransferQueuePanel`（常驻窄版）+ `TransferQueuePage`（全屏版）+ `TransferTaskCard`。
5. **空状态**：「还没有传输任务 / 选择设备并发送文件，任务会出现在这里」。
6. **加载**：任务自身即加载态（connecting/transferring）。
7. **错误**：`failed` 卡红边 + `errorMessage` + 「重试」。
8. **交互**：取消（queued→transferring 可取消）、重试（failed）、打开（completed，`objectUrl`）、清除（cancelled）。
9. **文案**：传输队列 / 正在发送 / 发送成功 / 发送失败 / 已取消 / 重试 / 取消 / 打开。
10. **Codex 要点**：从 `renderWorkbenchTransferBoard()` 抽 `TransferTaskCard`，状态/进度严格按 §4/§6；窄版与全屏版共用卡片组件。

### 3.6 历史记录页（可选增强）
1. **目标**：回看历史文件与文本，可下载/复制。
2. **桌面**：时间线/分组（按房间或日期），文件项可下载、文本项可复制。
3. **移动**：纵向时间线 + 搜索。
4. **核心组件**：`HistoryPage`、`HistoryFileRow`、`HistoryTextRow`、`EmptyState`。
5. **空状态**：「暂无历史记录」。
6. **加载**：骨架行。
7. **错误**：拉取失败 + 重试。
8. **交互**：下载（`HistoryFileSummary.downloadPath`）、复制文本、撤回（权限 `canRecallAnyMessage`）。
9. **文案**：历史记录 / 文件 / 文本 / 下载 / 复制 / 暂无历史记录。
10. **Codex 要点**：直接用 `DirectorySnapshotPayload.historyFiles/historyTexts`，纯读，不需新接口。

### 3.7 文本发送页（必须）
1. **目标**：快速把一段文本/链接发给设备或房间。
2. **桌面**：大输入框 + 目标选择器 + 「发送」+ 右侧/下方历史文本；字符数提示。
3. **移动**：全屏输入 + 底部发送条。
4. **核心组件**：`TextSendPage`、`SendTargetSelector`、`TextHistoryList`。
5. **空状态**：历史为空「还没有发送过文本」。
6. **加载**：发送中 `status:'sending'`。
7. **错误**：`status:'failed'` + 重发。
8. **交互**：Enter/Cmd+Enter 发送（`enterToSend`）；粘贴链接识别。
9. **文案**：发送文本 / 输入文本、链接或一段消息 / 发送到 xxx / 发送成功。
10. **Codex 要点**：复用 `TextRecord` 与文本通道；目标选择器与文件页共用 `SendTargetSelector`。

### 3.8 设置页（必须，提级为抽屉/页）
1. **目标**：管理设备身份、可发现性、主题、偏好。
2. **桌面**：右侧抽屉或独立页：设备名（可编辑）、平台、短码、`discoverable`/`allowShortCode`/`autoConnect` 开关、`enterToSend`、主题色（self/peer/ai）。
3. **移动**：整页设置列表。
4. **核心组件**：`SettingsPanel`、`SettingRow`（toggle/text/segmented）、`ThemeColorPicker`。
5. **空状态**：无。
6. **加载**：保存中按钮 loading。
7. **错误**：保存失败 toast + 回滚。
8. **交互**：改名→`update-settings`；开关→`update-settings`；偏好→`update-preferences`；主题→现有 `SnapLinkThemeColors`。
9. **文案**：设置 / 设备名 / 允许被发现 / 允许短码连接 / 自动连接同账号设备 / 回车发送。
10. **Codex 要点**：复用 `DeviceSettingsPayload` / `DevicePreferencesPayload` 与现有 `setIsThemePanelOpen`，把零散设置收敛到 `SettingsPanel`。

### 3.9 AI 辅助页（保留）
- 保留现有 `ChatAiStage`（`/chat`）。本次只统一左导航入口样式与返回工作台路径，不改 AI 逻辑。

### 3.10 命令行页（保留）
- 保留现有 `WebCommandStage`（`/web-command`）。统一导航入口与外壳留白，不改沙箱逻辑（`web-command-sandbox.ts`）。

### 3.11 移动端布局（必须）
- 顶部：身份 + 连接胶囊（横向滚动）。
- 主体：当前 `workbenchMode` 内容（附近设备列表优先）。
- 底部固定操作区：选择文件 / 拍照 / 发送文本，热区 ≥ 54px。
- 传输队列 = 底部上拉抽屉，复用桌面 `TransferTaskCard`。
- 一级导航 = 底部 `MobileBottomNav`（附近/房间/文件/传输/更多）或顶部抽屉。

---

## 四、组件拆分建议（含字段可用性）

> 命名沿用现有 BEM 前缀 `dd-snaplink__*`。每个组件：props / 显示 / 事件 / 复用数据。

**外壳**
- `AppShell` — props: `activeView`, `children`；显示：路由级整页容器；事件：—；复用：`routes.ts`。
- `SidebarNav` — props: `workbenchMode`, `activeView`, `onSelectMode`, `onOpenView`, `deviceInitial`；显示：72px 图标导航 + 设置 + 头像；事件：上述 handler；复用：现有 `handleShow*`。
- `TopStatusBar` — props: `deviceName`, `onlineCount`, `transport`（lan/webrtc）；显示：身份 + 连接胶囊 + 在线数 + 重新扫描；复用：`self`、`onlineDeviceItems.length`。
- `DeviceIdentityChip` — props: `name`, `platform`, `discoverable`；显示：头像 + 名 + 在线态；事件：`onRename`。
- `StatusPills` — props: `lanDiscoverable`, `webrtc`, `serverless`；纯展示。

**发现 / 发送**
- `NearbyDevicesPage` / `NearbyDevicesPanel` — props: `devices: OnlineDeviceListItem[]`, `selectedId`, `scanning`, `onSelect`, `onSendFile`, `onSendText`, `onRescan`；显示：列表/网格 + 扫描态 + 空态。
- `DeviceCard` — props: `device`, `selected`, `onSelect`, `onSendFile`, `onSendText`, `onDropFiles`；显示：图标/名/平台/连接方式/信任/最近在线/操作。
- `DropZone` — props: `target`, `onFiles`, `onPickFile`, `onSendText`, `onSendImage`, `active`；事件：拖拽 + 点击。
- `SendTargetSelector` — props: `devices`, `rooms`, `value`, `onChange`。

**传输**
- `TransferQueuePanel`（常驻）/ `TransferQueuePage`（全屏）— props: `items: TransferItem[]`, `onCancel`, `onRetry`, `onOpen`, `onRemove`。
- `TransferTaskCard` — props: `item: TransferItem`, `onAction`；显示：图标/名/目标/状态点/百分比/速度/剩余/操作。

**房间 / 会话 / 文本 / 历史 / 设置**
- `RoomsPage` + `RoomCard`（`RoomListItem`）；`RoomConversationPage` + `ConversationStream` + `MessageBubble` + `FileMessageCard`（`FileConversationEntry`）+ `Composer` + `MemberList` + `SharedContentTabs`。
- `TextSendPage` + `TextHistoryList`（`TextRecord` / `HistoryTextSummary`）。
- `HistoryPage` + `HistoryFileRow` + `HistoryTextRow`。
- `SettingsPanel` + `SettingRow` + `ThemeColorPicker`（`DeviceSettingsPayload` / `DevicePreferencesPayload` / `SnapLinkThemeColors`）。

**通用 / 弹层**
- `EmptyState` — props: `icon`, `title`, `desc`, `action`。
- `ConfirmReceiveDialog` — props: `sender`, `file`, `transport`, `rememberTrust`, `onAccept`, `onReject`。
- `TrustDeviceDialog` + `PinInput`。
- `MobileBottomNav`。

### 4.1 字段可用性对照（关键！Codex 必读）

| 字段 / 概念 | 当前是否有 | 实现方式 |
|---|---|---|
| 传输状态（8 态） | ✅ `TransferItem.status` | 直接用 |
| 进度 progress | ✅ `TransferItem.progress` / `acknowledgedBytes` | 直接用（基于 `file-ack`） |
| 已发字节 sentBytes / 确认字节 acknowledgedBytes | ✅ | 直接用 |
| **传输速度** | ❌ 无字段 | **前端计算**：相邻 tick `ΔacknowledgedBytes / Δt` 滑动平均 |
| **剩余时间 ETA** | ❌ 无字段 | **前端计算**：`(fileSize - acknowledgedBytes) / speed` |
| 目标设备名 | ✅ `targetDeviceName` | 直接用 |
| 在线设备列表 | ✅ `OnlineDeviceListItem` / `PeerSummary` | 直接用 |
| 连接方式 局域网 | ✅ 派生 `PeerSummary.relation.sameLan` | LAN=sameLan |
| 连接方式 远程 | ✅ 派生（非 sameLan） | remote=非 LAN |
| 连接方式 TURN 中继 | ⚠️ 后端无显式字段 | **前端从 WebRTC `RTCIceCandidate.type==='relay'` 推断**，或后端补充 |
| **设备信任态** | ⚠️ 无显式 `trusted` | 近似：`relation.sameAccount`/`autoConnectEligible` ⇒「已信任」；否则「未验证」。真正可信存储 **需后端补充** |
| 设备指纹 / PIN | ⚠️ 有 `shortCode`/`pairToken`，无指纹 | 短码可做指纹占位；正式指纹/PIN **需后端补充**，前端先用 `shortCode` 占位 |
| 房间未读 unreadCount | ✅ `RoomListItem.unreadCount` | 直接用（前端按 `lastReadAt` 派生） |
| 历史文件 / 文本 | ✅ `historyFiles` / `historyTexts` | 直接用 |

> 凡标 **前端计算 / 占位** 的，UI 必须能在字段缺失时优雅降级（不显示而非显示 `NaN/—` 堆叠）。

---

## 五、CSS / Tailwind 设计 Token（对齐 `src/index.css` 真实值）

> 现有变量已在 `:root` 定义，**直接复用，不要新造同义变量**。下表左=语义名，右=现有 CSS 变量/值。

**颜色**
```
background      #f5f5f5   var(--shell-bg)
surface         #ffffff   var(--surface)
surfaceMuted    #f0f0f0   var(--surface-soft)   /面板 var(--panel-bg)=#f7f7f7
border          #d9d9d9   var(--line)           /软 var(--line-soft)=#e5e5e5
textPrimary     #111111   var(--ink)
textSecondary   #666666   var(--ink-soft)
textMuted       #999999   var(--muted)
primary         #07c160   var(--brand)
primaryHover    #06ad56   var(--brand-strong)
success         #07c160   var(--success)        /soft rgba(7,193,96,.12)
warning         #fa9d3b   var(--warning)
danger          #fa5151   var(--danger)         /soft rgba(250,81,81,.12)
info / link     #576b95   var(--link)
bubbleSelf      #95ec69   var(--bubble-self)
```
**尺寸**
```
sidebarWidth    72px      var(--sidebar-width)
topbarHeight    58px      (新增，建议 --topbar-height:58px)
rightPanelWidth 280–360px var(--detail-column-width)=280px / 队列建议 360px
pagePadding     22–24px   (compact 16–20px)
cardRadius      11–12px   var(--radius-2xl)=12px
buttonRadius    8px       var(--radius-sm)
controlHeight   30/34/38/42px (badge/按钮次/按钮主/对话框按钮)
gap            8/10/12/16px (4px 基准)
shadow          none      所有 --shadow-* 现为 none（保持零/弱阴影，层次靠分割线）
```
**字体**
```
中文 UI    var(--font-ui)   Maple UI / PingFang SC / Microsoft YaHei / Noto Sans SC
等宽（数字/文件大小/速度/短码/指纹）var(--font-mono)  Maple Mono / Cascadia / Consolas
基础字号   15px var(--base-font-size)，行高 1.5
```
**深色方案（仅 Token，按需接入 `:root[data-theme="dark"]` 覆盖）**
```
--shell-bg #1b1b1d  --sidebar-bg #161617  --panel-bg #242427  --surface #2b2b2f
--row-hover #323237 --line #35353b  --ink #f2f2f3  --ink-soft #a8a8ad
--brand #2fd574  --bubble-self #3f6f33  --danger #ff6b6b  --warning #ffb454  --link #7e9cd8
```

---

## 六、交互状态规格（15 态）

| 状态 | 触发 | UI 表现 | 进度 | 数据来源 |
|---|---|---|---|---|
| 无设备 | 在线列表空 | 扫描波纹空态 + 重新扫描 | — | `onlineDeviceItems.length===0` |
| 有设备 | 列表非空 | 设备卡列表/网格 | — | `OnlineDeviceListItem[]` |
| 设备离线 | `online=false` | 卡降透明 + 灰点 + 禁发送 | — | `PeerSummary.online` |
| 设备未信任 | 非 sameAccount | 「未验证」徽标 + 发送前可触发信任弹窗 | — | 派生（§4） |
| 等待对方确认 | 已建连待接收方接受 | 状态点蓝「等待对方确认」 | 0% | 本地态 |
| 正在建立直连 | `connecting` | 蓝点脉冲「正在建立连接」 | **0%** | `TransferItem.status` |
| 准备发送 | `ready` | 「准备发送」 | **0%** | 同上 |
| 正在发送 | `transferring` | 绿点脉冲 + 进度条增长 + 速度/剩余 | **真实 %** | `acknowledgedBytes`/`fileSize` |
| 发送成功 | `completed` | 绿点「发送成功」100% | 100% | `file-complete` |
| 发送失败 | `failed` | 红边 + `errorMessage` + 重试 | 保留失败前 % | `TransferItem.errorMessage` |
| 已取消 | `cancelled` | 灰「已取消」+ 移除 | — | 本地态 |
| 接收文件确认 | 收到 `file-meta` 待确认 | `ConfirmReceiveDialog` + 信任此设备 | — | `ChannelMessage:file-meta` |
| 拖拽进入页面 | dragover | DropZone 高亮绿虚线 | — | DOM 事件 |
| 移动端选择文件 | 底部按钮 | 系统选择器/相机 | — | `<input capture>` |
| 网络断开 / WS 断 | socket close | 顶部细条「连接已断开，正在重连…」+ 禁发送 | — | `SessionState='closed'` |
| WebRTC 不可用 | 无 RTC / ICE 失败 | 降级提示「当前网络无法直连，文件可能走中继或暂不可用」 | — | `peer-state='failed'` |

---

## 七、交给 Codex 的实现计划（任务清单）

> 原则：**先必须、后增强**；每个任务小步可验证，禁止一次性大改导致功能损坏。每步完成后跑 `typecheck + lint + build` 并截图桌面/移动。

**任务 1：抽出 AppShell + SidebarNav（必须）**
- 修改文件：`SnapLinkStage.tsx`、新增 `components/workbench/SidebarNav.tsx`、`components/workbench/TopStatusBar.tsx`。
- 要做什么：把 `renderWorkbenchView()` 顶部 `<aside class="dd-snaplink__rail">` 与 status header 抽成独立组件，props 透传现有 handler/state，不改行为。
- 保留：`workbenchMode` 状态、所有 `handleShow*`/`handleOpen*`。
- 不要破坏：路由切换、AI/命令入口。
- 验收：四模式切换与现状一致；导航高亮正确；`aria-pressed` 保留。

**任务 2：统一 workbench 页面骨架与空/加载/错误态（必须）**
- 修改文件：`SnapLinkStage.tsx`、新增 `components/common/EmptyState.tsx`、`components/common/SkeletonRows.tsx`。
- 要做什么：为 nearby/rooms/files/transfers 四区套统一 `PageHeader + Body + EmptyState`；首屏快照未到显示骨架。
- 保留：现有数据获取逻辑。
- 验收：空/加载/错误三态可见且文案统一。

**任务 3：附近设备页 + DeviceCard（必须）**
- 修改文件：`SnapLinkStage.tsx`、新增 `components/devices/NearbyDevicesPanel.tsx`、`DeviceCard.tsx`。
- 要做什么：列表渲染抽组件；加「连接方式」（`relation.sameLan`→局域网/远程；ICE relay→TURN）与「信任态」（`sameAccount`→已信任/未验证，缺字段不显示）。
- 复用：`onlineDeviceItems`、`request-connect`。
- 不要破坏：点击连接/发送链路。
- 验收：5 类平台（Mac/Win/iOS/Android/iPad）图标正确；离线卡降级；拖文件到卡发起传输。

**任务 4：传输状态机收敛 + TransferTaskCard（必须，最高价值）**
- 修改文件：新增 `state/useTransferStore.ts`（或 hook）、`components/transfer/TransferTaskCard.tsx`；改 `SnapLinkStage.tsx` 传输渲染。
- 要做什么：以 `TransferItem`（已存在）为唯一事实源；speed/eta 在 store 内由 `acknowledgedBytes` 时间差**前端计算**；卡片按 8 态渲染。
- 硬规则：connecting/ready 进度恒 0%，仅 transferring 增长，completed 才 100%。
- 保留：`ChannelMessage` 收发、`file-ack`/`file-complete` 处理。
- 不要破坏：分块续传 `file-resume`。
- 验收：手动制造 connecting→transferring→completed，进度只在发送阶段增长；failed 可重试；cancel 生效。

**任务 5：文件发送页升级（必须）**
- 修改文件：`SnapLinkStage.tsx`（`workbenchMode='files'`）、新增 `FileSendPage.tsx`、`SendTargetSelector.tsx`。
- 要做什么：`文件`入口从「直接弹选择器」改为发送工作页（目标选择器 + 大 DropZone + 最近发送）；保留快捷选择器为页内按钮。
- 验收：未选目标有引导；选目标后拖拽/选择文件进队列。

**任务 6：传输队列页 + 常驻面板（必须）**
- 修改文件：`SnapLinkStage.tsx`、`TransferQueuePanel.tsx`、`TransferQueuePage.tsx`。
- 要做什么：窄版常驻右栏 + `workbenchMode='transfers'` 全屏分组视图，共用 `TransferTaskCard`。
- 验收：两处数据一致；分组（进行中/已完成/失败）正确。

**任务 7：房间页 + 会话页拆分（必须）**
- 修改文件：`SnapLinkStage.tsx`、`RoomsPage.tsx`、`RoomCard.tsx`、`RoomConversationPage.tsx` 及会话子组件。
- 要做什么：把房间列表与会话流抽组件，复用 `RoomListItem` / `UnifiedConversationEntry`。
- 不要破坏：`create-public-room`/`join-room`/通道收发、撤回。
- 验收：列表/进入/收发/未读正常。

**任务 8：文本发送页 + 历史页（必须文本 / 可选历史）**
- 修改文件：`TextSendPage.tsx`、`HistoryPage.tsx`。
- 要做什么：文本页（输入 + 目标 + 历史）；历史页读 `historyFiles`/`historyTexts`。
- 验收：文本发送/失败重发；历史下载/复制。

**任务 9：设置抽屉收敛（必须）**
- 修改文件：`SettingsPanel.tsx`，接 `setIsThemePanelOpen`。
- 要做什么：把设备名/可发现/短码/自动连接/回车发送/主题色收进一个面板。
- 复用：`update-settings`/`update-preferences`/`SnapLinkThemeColors`。
- 验收：改名与开关即时生效、刷新保留。

**任务 10：接收确认 / 信任 / PIN 弹层（必须）**
- 修改文件：`ConfirmReceiveDialog.tsx`、`TrustDeviceDialog.tsx`、`PinInput.tsx`。
- 要做什么：收到 `file-meta` 弹接收确认（含「信任此设备」）；未验证设备首次发送弹信任（指纹用 `shortCode` 占位，PIN 字段后端就绪前可前端校验占位）。
- 不要破坏：现有接收落盘 `ReceivedFile`。
- 验收：接受→进接收队列；拒绝→丢弃；信任态切换持久。

**任务 11：移动端布局 + 底部导航（必须）**
- 修改文件：`App.css` 媒体查询、`MobileBottomNav.tsx`、队列抽屉。
- 要做什么：≤768px 切底部操作区 + 队列抽屉 + 底部一级导航；热区 ≥44px。
- 验收：iPhone/Android 视口截图通过。

**任务 12（可选增强）：深色 Token 接入**
- 修改文件：`index.css` 增 `:root[data-theme="dark"]` 覆盖块（用 §5 深色值）+ 设置里切换。
- 验收：切换后无对比度失败、阴影保持零/弱。

---

## 八、给 Codex 的最终执行提示词（可直接复制）

```
你是资深前端工程师，负责重构 DD直连 / ddzhilian（React + TypeScript + CSS，可能含 Next.js）的 Web App UI。

【项目背景】
DD直连是 P2P 局域网文件共享与文本传输工具（类 PairDrop / Snapdrop / LocalSend）。
用户打开网页即可发现同一 Wi-Fi/局域网设备，直传文件、图片、文本，并进房间会话。
现有主界面在 src/app/components/SnapLinkStage.tsx，已实现 72px 左导航 + 顶部状态条 +
中央（附近设备/房间/文件/传输 via workbenchMode）+ 右侧传输队列；路由见 src/app/routes.ts。

【目标】
按《DD直连前端落地规格》（本仓库 DD直连-前端落地规格.md）把主界面重构为成熟的
「附近设备直传工作台」：统一各页骨架与空/加载/错误态，拆分组件，补连接方式/信任态/
传输速度/剩余时间的呈现，完善接收确认/信任/PIN 弹层与移动端布局。

【修改范围】
仅重构 UI 与组件结构、CSS。按规格 §7 任务 1→11 顺序、小步提交。
新增组件放 src/app/components/ 下对应子目录。复用 src/app/types.ts 与
src/lib/ddzhilian-types.ts 既有类型（TransferItem 等已存在，勿重复定义）。

【硬性约束】
1. 不要改动 WebRTC / 信令 / 文件分块续传 / 通道收发逻辑（ChannelMessage、file-ack、
   file-resume、ReceivedFile、session-state 等）。
2. 保留现有数据流：DirectorySnapshotPayload、ClientEvent/ServerEvent、现有 handler
   （handleShowWorkbench*、handleOpen*、update-settings/preferences 等）。
3. 进度诚实：connecting/ready 阶段进度条恒为 0%，只有 transferring 且基于
   acknowledgedBytes 才增长，completed 才 100%。禁止用连接动画伪造进度。
4. 后端没有的字段（传输速度、剩余时间、设备信任态、TURN 标识、指纹/PIN）按规格 §4：
   能前端计算的前端算（speed/eta），能派生的派生（lan/remote、信任近似），
   其余做占位并在字段缺失时优雅降级，不要硬编造数据，也不要显示 NaN/—。
5. 复用 src/index.css 既有 CSS 变量（--brand #07c160、--shell-bg、--line、--ink 等），
   不新造同义变量；圆角 6–10px；阴影保持零/弱；中文 UI 字体 var(--font-ui)，
   数字/文件大小/速度用 var(--font-mono)。

【验证（每个任务完成后必须）】
- 运行类型检查、lint、build，全部通过。
- 用浏览器截图验证桌面（≥1280px）与移动端（375 / 414px）两套布局。
- 手动走查传输全流程：queued→waiting_for_target→connecting→ready→transferring→
  completed，以及 failed→retry、cancel；确认进度只在 transferring 增长。
- 若发现规格与现有代码冲突，优先保证功能可用，记录冲突点并以最小改动落地，不破坏现有能力。

请从任务 1 开始，逐个实现并自测，每个任务输出：改动文件清单、关键 diff 说明、验证结果。
```

---

## 九、差异对照表（当前半成品 → 建议）

| 区域 | 当前问题 | 修改建议 | 涉及组件 | 优先级 |
|---|---|---|---|---|
| 左导航「文件」 | 点击直接弹文件选择器，无页面感 | 改为文件发送页（目标选择+大拖拽+最近发送），选择器降为页内按钮 | SidebarNav, FileSendPage, DropZone | 必须·高 |
| 左导航「传输」 | 仅切 workbenchMode，无分组/管理 | 全屏队列页（进行中/已完成/失败）+ 常驻窄面板共用卡片 | TransferQueuePage/Panel, TransferTaskCard | 必须·高 |
| 设备卡 | 缺连接方式/信任态/最近在线表达 | 加连接方式徽标（LAN/远程/TURN）+ 信任徽标（近似/占位）| DeviceCard | 必须·高 |
| 传输卡 | 无速度/剩余时间，进度语义易混 | store 内前端计算 speed/eta；严格 8 态；连接不计进度 | useTransferStore, TransferTaskCard | 必须·高 |
| 巨型组件 | SnapLinkStage 4800+ 行耦合 | 抽 AppShell/SidebarNav/各 Page，状态收敛 | 全部 | 必须·中 |
| 空状态多 | 页面发空 | 统一 EmptyState（图标+标题+引导+主操作）+ 扫描波纹 | EmptyState | 必须·中 |
| 文本/历史/设置 | 散落弹层/会话 | 提为一等页/抽屉，复用既有数据 | TextSendPage, HistoryPage, SettingsPanel | 必须文本/设置·可选历史 |
| 接收/信任/PIN | 流程不完整 | 补 ConfirmReceiveDialog / TrustDeviceDialog / PinInput | 三个弹层 | 必须·中 |
| 移动端 | 桌面布局缩放 | 底部操作区 + 队列抽屉 + 底部导航，热区≥44px | MobileBottomNav, 抽屉 | 必须·中 |
| 深色 | 无 | 仅接 Token（:root[data-theme=dark]），不做完整切换 | index.css | 可选增强 |

---

_配套可交互原型见 `DD直连工作台.dc.html`（桌面工作台 / 移动端 / 设计规范 / 落地建议 四视图，含 8 态传输切换、接收确认、信任 PIN、空/失败/重试演示）。_
