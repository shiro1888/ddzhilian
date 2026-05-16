# ddzhilian Codebase Index

This file is a token-friendly map of the repository. Use it to find the implementation area first, and ignore build output or deployment artifacts unless the task explicitly needs them.

## Recommended Reading Order

1. `README.md`
2. `CODEBASE_INDEX.md`
3. `src/lib/use-ddzhilian.ts`
4. `src/app/components/*`
5. `server/src/index.ts`
6. `server/src/registry/*`

## Keep / Ignore

### Read first

- `app/`: Next.js App Router shell used for static export and metadata.
- `src/`: frontend implementation.
- `server/src/`: backend signaling, room/session/history state, AI proxy logic.
- `public/`: static assets actually served by the frontend.
- `scripts/`: local build/compression/preview helpers.
- `deploy/`: nginx and self-hosted deployment reference.

### Usually ignore

- `.next/`: Next.js build cache and generated output.
- `out/`: exported static frontend output.
- `dist/`: root-level packaged frontend output.
- `server/dist/`: compiled backend output.
- `node_modules/`, `server/node_modules/`: dependencies.
- `deploy-artifacts/`: packaging/upload artifacts from deployment runs.
- `.playwright-cli/`: local browser automation artifacts.
- `.omx/`: agent runtime metadata.

## Trimmed Directory Tree

```text
.
|-- app/
|   |-- layout.tsx
|   |-- client-root.tsx
|   |-- auth/
|   |   `-- confirm/page.tsx
|   `-- [[...slug]]/page.tsx
|-- src/
|   |-- App.tsx
|   |-- BrowserApp.tsx
|   |-- App.css
|   |-- index.css
|   |-- app/
|   |   |-- config.tsx
|   |   |-- routes.ts
|   |   |-- types.ts
|   |   |-- utils.ts
|   |   `-- components/
|   |       |-- AppHeader.tsx
|   |       |-- AppSidebar.tsx
|   |       |-- ContentGrid.tsx
|   |       |-- ChatConversationStage.tsx
|   |       |-- ChatAiStage.tsx
|   |       |-- ConnectStage.tsx
|   |       |-- SendStage.tsx
|   |       |-- ReceiveStage.tsx
|   |       |-- TextStage.tsx
|   |       |-- ImageGenerationStage.tsx
|   |       |-- ImageAccountGate.tsx
|   |       |-- SessionsStage.tsx
|   |       |-- SnapLinkStage.tsx
|   |       |-- AdminStage.tsx
|   |       `-- admin/
|   `-- lib/
|       |-- use-ddzhilian.ts
|       |-- use-account-auth.ts
|       |-- use-admin.ts
|       `-- ddzhilian-types.ts
|-- docs/
|   |-- IMAGE_GENERATION_IMPLEMENTATION.zh-CN.md
|   `-- SUPABASE_AUTH_EMAIL_TEMPLATES.zh-CN.md
|-- server/
|   |-- README.md
|   |-- email-templates/
|   |   `-- resend-email-confirmation.html
|   |-- scripts/
|   |   `-- send-resend-test-email.mjs
|   |-- src/
|   |   |-- index.ts
|   |   |-- config.ts
|   |   |-- protocol.ts
|   |   |-- registry/
|   |   |   |-- device-registry.ts
|   |   |   |-- room-registry.ts
|   |   |   |-- session-registry.ts
|   |   |   |-- history-registry.ts
|   |   |   |-- account-registry.ts
|   |   |   |-- image-generation-history-registry.ts
|   |   |   |-- ui-state-registry.ts
|   |   |   |-- admin-config-registry.ts
|   |   |   |-- admin-session-registry.ts
|   |   |   |-- ai-usage-registry.ts
|   |   |   `-- ai-chat-conversation-registry.ts
|   |   `-- utils/
|   |       |-- network.ts
|   |       |-- id.ts
|   |       `-- cloudflare-ai-quota.ts
|   `-- data/
|-- public/
|-- scripts/
|-- deploy/
|-- README.md
|-- README.zh-CN.md
|-- DESIGN.md
`-- DESIGN.zh-CN.md
```

## Functional Ownership

### Frontend shell and routing

- `app/layout.tsx`: HTML shell, metadata, favicon, global head-level integrations.
- `app/client-root.tsx`: client bootstrap entry for the App Router shell.
- `app/[[...slug]]/page.tsx`: catches browser routes and hands them to the SPA entry.
- `app/auth/confirm/page.tsx`: Supabase Auth email confirmation landing route.
- `src/App.tsx`: top-level frontend composition entry.
- `src/BrowserApp.tsx`: browser-facing app wrapper.
- `src/app/routes.ts`: route-to-view mapping.

### Frontend state and protocol client

- `src/lib/use-ddzhilian.ts`: main client runtime. WebSocket connection, identity persistence, room/session state, WebRTC/file transfer coordination, history fetch/download, AI requests, and image history API calls.
- `src/lib/use-account-auth.ts`: frontend account session helper for `/api/auth/*`, using HttpOnly cookies through the signaling backend.
- `src/lib/ddzhilian-types.ts`: shared frontend protocol/data types.
- `src/app/types.ts`: UI-level view and component types.
- `src/app/config.tsx`: UI config/constants.
- `src/app/utils.ts`: small UI helpers plus rich-text/Markdown/code-block rendering and copyable code-block HTML generation.

### Frontend feature components

- `src/app/components/ChatConversationStage.tsx`: main chat workspace, room conversation flow.
- `src/app/components/ChatAiStage.tsx`: standalone ChatGPT-style AI chat page at `/chat`; manages account/device-scoped synced AI conversation list, manual rename, search, delete confirmation, image/text attachment input, attachment summaries, branch conversations, Markdown export, pin/archive controls, message rendering, copy actions, stop/regenerate controls, model selection, SearXNG-backed web-search toggle/source display, and full-response assistant display while reusing the existing AI chat request path.
- `src/app/components/ConnectStage.tsx`: legacy focused device discovery page component; `/connect` is hidden from navigation and redirects to `/text`, while normal pairing/room entry stays inside the chat workspace side panel.
- `src/app/components/SnapLinkStage.tsx`: lightweight SnapLink room interface for public-room creation/join, file/text conversation, room list, and lobby/top-switch entries that embed the standalone `/chat` AI experience without changing routes.
- `src/app/components/SendStage.tsx`: send-side transfer view.
- `src/app/components/ReceiveStage.tsx`: receive-side transfer view.
- `src/app/components/TextStage.tsx`: long-text and Markdown exchange UI.
- `src/app/components/ImageGenerationStage.tsx`: standalone chat-style image generation UI backed by the Codex reverse-proxy image endpoint; supports text prompts, visible reference-image upload plus aspect-ratio/resolution composer controls, multi-image upload previews for image editing, concurrent independent generation submissions with local pending-quota display, click-to-zoom generated-image preview, on-demand 360 panorama viewing only for generated images whose natural size is landscape 2:1 and whose prompt/history metadata has explicit panorama intent, generated-image edit shortcut back into the existing image-edit composer, animated image-generation loading state, URL-based generated-image display, account-scoped total image quota display with free/paid/reserved hover details, account-scoped image history, and lazy loading older image-history pages after the latest prompt/image.
- `src/app/components/ImageAccountGate.tsx`: `/image` login/register gate for Supabase-backed accounts; registration collects email/password confirmation, then shows the email-confirmation wait state instead of auto-login.
- `src/app/components/SessionsStage.tsx`: active session list and state display.
- `src/app/components/AdminStage.tsx`: thin composition entry for the account-based admin console. Admin view state lives in `src/lib/use-admin.ts`, while the UI is split under `src/app/components/admin/` into login/sidebar/topbar, dashboard widgets, provider/model panels, online-device management, user/role management, toast, skeleton, and CSV-capable table components.
- `src/app/components/admin/`: split admin console components. High-value files are `DashboardGrid.tsx` for widget visibility/drag/sizing, `DashboardWidgets.tsx` for widget render mapping, `ProviderConfigPanel.tsx` plus manual/CLIProxy panels for OpenAI-compatible configuration, `OnlineDevices.tsx` for current WebSocket device list and display-name updates, `UserManagement.tsx` for searchable/sortable/paginated quota editing, and `constants.ts` for admin formatting/model/dashboard helpers.
- `src/app/components/AuthConfirmPage.tsx`: standalone `/auth/confirm` page for Supabase email confirmation and Magic Link callbacks, including auto-confirm for legacy `confirmation_url` and `token_hash` links, backend `/api/auth/confirm` handoff, sensitive callback cleanup, and post-confirm redirect to `/image`.
- `src/lib/use-admin.ts`: admin session, login/logout, AI settings save, history clear, Supabase user quota update, role add/delete, OpenAI-compatible model detection, API error parsing, and admin toast queue.
- `src/lib/use-admin-permissions.ts`: lightweight admin capability check for non-admin pages, currently exposing whether the active admin cookie can recall any chat message without loading the full dashboard state.
- `src/app/components/AppHeader.tsx`: top bar and global actions.
- `src/app/components/AppSidebar.tsx`: sidebar navigation and brand area.
- `src/app/components/ContentGrid.tsx`: shared content layout wrapper.

### Backend entry and protocol

- `server/src/index.ts`: HTTP + WebSocket server entry, request handling, signaling flow, account auth endpoints, AI proxy endpoints, optional SearXNG search-before-AI prompt context, history download/upload/recall endpoints including admin-authorized text recall, image generation proxying with Supabase-backed quota reservation, concurrent upstream image request racing, free-plus-paid quota enforcement, and room recent-24h text context assembly for AI requests.
- `server/src/config.ts`: environment parsing and backend runtime config, including AI provider and SearXNG web-search settings.
- `server/src/protocol.ts`: backend event schema and client-event parsing.
- `server/email-templates/resend-email-confirmation.html`: Resend API HTML email template for account email confirmation smoke tests.
- `server/scripts/send-resend-test-email.mjs`: backend-only Resend API smoke test that loads `server/.env`, requires `RESEND_API_KEY`, and sends the configured test email without exposing the key to frontend code.

### Backend state registries

- `server/src/registry/device-registry.ts`: online device presence, identity, pairing metadata.
- `server/src/registry/room-registry.ts`: room membership and room summaries.
- `server/src/registry/session-registry.ts`: live connection/session lifecycle.
- `server/src/registry/history-registry.ts`: persisted history text/file metadata and cleanup.
- `server/src/registry/account-registry.ts`: Supabase Auth registration/login/session refresh, user profile upsert, `user_profiles` free/paid image-quota counters, `image_quota_reservations` quota reservation RPC calls, and `admin_roles` lookup/add/delete for account-based admin access.
- `server/src/registry/image-generation-history-registry.ts`: Supabase persistence and cursor paging for per-account generated-image history.
- `server/src/registry/ui-state-registry.ts`: per-device room UI state such as pin/read markers.
- `server/src/registry/admin-config-registry.ts`: admin-configurable AI settings snapshot.
- `server/src/registry/admin-session-registry.ts`: admin login/session state.
- `server/src/registry/ai-usage-registry.ts`: local AI usage accounting.
- `server/src/registry/ai-chat-conversation-registry.ts`: local per-account/per-device private persistence for standalone `/chat` AI conversations, exposed through authenticated `/api/ai/chat/conversations`.

### Backend utilities

- `server/src/utils/network.ts`: client network-context detection used by LAN heuristics.
- `server/src/utils/id.ts`: ID helpers.
- `server/src/utils/cloudflare-ai-quota.ts`: local Cloudflare AI quota tracking.

### Documentation

- `docs/IMAGE_GENERATION_IMPLEMENTATION.zh-CN.md`: Chinese implementation document for the `/image` feature, covering account-gated API flow, JSON text-to-image requests, multipart `image[]` edit uploads, upstream image API forwarding, async job polling, generated-image asset storage, returned image metadata, Supabase `image_generations` history, and account quota behavior.
- `docs/SUPABASE_AUTH_EMAIL_TEMPLATES.zh-CN.md`: Supabase Confirm signup and Magic Link email templates plus `/auth/confirm` redirect setup notes.

### Runtime data and assets

- `server/data/`: local runtime data, including history and admin usage state. Treat as environment data, not source logic.
- `public/`: favicon, logos, icon sprite, response headers.

### Build and deployment helpers

- `scripts/compress-dist.mjs`: package frontend build output for deployment.
- `scripts/deploy-uploaded-artifacts.sh`: server-side production deploy script for artifacts uploaded by GitHub Actions.
- `scripts/serve-out.mjs`: local static preview of exported frontend.
- `scripts/sync-openrouter-free-models.mjs`: sync/update OpenRouter free model config.
- `.github/workflows/deploy-production.yml`: validates frontend/backend builds and triggers the VPS deploy script on `main` pushes.
- `deploy/nginx/ddzhilian.conf`: nginx reference config for the self-hosted site.
- `deploy/README.zh-CN.md`: deployment notes.
- `deploy/github-actions.zh-CN.md`: GitHub Actions secret/variable setup and server prerequisites for automatic VPS deployment.

## Fast Location Guide

If the task is about:

- Chat UI / room list / message area: start at `src/app/components/ChatConversationStage.tsx`.
- Device discovery / pairing / reconnect entry: start at `src/app/components/ContentGrid.tsx`, `src/App.tsx`, and `src/lib/use-ddzhilian.ts`; the legacy `/connect` route is hidden and redirects to `/text`.
- File send / receive / progress: start at `src/lib/use-ddzhilian.ts`, `SendStage.tsx`, and `ReceiveStage.tsx`.
- Markdown / long text behavior: start at `TextStage.tsx`, `ChatConversationStage.tsx`, `SnapLinkStage.tsx`, `src/app/utils.ts`, and `use-ddzhilian.ts`; code-block formatting and copy-button HTML live in `src/app/utils.ts`, while click-to-copy handlers live in the chat components.
- Public room / room state / history / message recall: start at `use-ddzhilian.ts`, `server/src/index.ts`, `server/src/registry/room-registry.ts`, and `server/src/registry/history-registry.ts`; text recall is still requested with a device history token, while admin-wide recall also requires a valid admin cookie.
- WebSocket protocol or event mismatch: start at `server/src/protocol.ts`, `server/src/index.ts`, and `src/lib/ddzhilian-types.ts`.
- LAN auto-discovery behavior: start at `server/src/utils/network.ts` and `server/src/registry/device-registry.ts`.
- AI quota / provider / admin settings: start at `server/src/index.ts`, `admin-config-registry.ts`, `ai-usage-registry.ts`, and `cloudflare-ai-quota.ts`.
- Standalone AI chat page: start at `src/app/components/ChatAiStage.tsx`, `src/App.tsx`, `src/lib/use-ddzhilian.ts`, `server/src/registry/ai-chat-conversation-registry.ts`, and `src/app/utils.ts`; the page reuses the existing AI chat API and rich text/code-block sanitizer, privately syncs conversation history through authenticated `/api/ai/chat/conversations`, accepts image/text attachments through the existing AI request shape, optionally requests SearXNG web search with returned source display, and SnapLink can embed this same component in-place from its lobby or top conversation switch without navigating to `/chat`.
- AI web search / SearXNG: start at `server/src/config.ts`, `server/src/index.ts`, `src/lib/use-ddzhilian.ts`, `src/app/components/ChatAiStage.tsx`, and `src/lib/ddzhilian-types.ts`; the backend only searches when `AI_WEB_SEARCH_ENABLED=true` and the client sends `webSearch: true`, then injects SearXNG JSON results into the prompt and returns source metadata for display.
- AI chat room context / `@Ai` image and file input behavior: start at `src/App.tsx`, `src/lib/use-ddzhilian.ts`, and `server/src/index.ts`; room-scoped AI requests automatically prepend recent 24-hour room text context before sending to the model, `@Ai` can pass inline chat images to OpenAI-compatible multimodal models, text-like file attachments are read client-side into the bot prompt with size/count limits, the parser still accepts legacy `@bot`, and non-public `bot-chat` rooms remain a backend capability for existing flows but are no longer created by the SnapLink lobby `Chat with Ai` button.
- AI image generation: start at `src/app/components/ImageAccountGate.tsx`, `src/app/components/ImageGenerationStage.tsx`, `src/lib/use-account-auth.ts`, `src/lib/use-ddzhilian.ts`, `server/src/index.ts`, `server/src/registry/account-registry.ts`, `server/src/registry/image-generation-history-registry.ts`, and `server/src/config.ts`; `/api/ai/image` requires an account cookie, creates an async job, accepts JSON text-to-image or multipart `image[]` edit inputs, reserves per-account free/paid quota in Supabase before calling the upstream image API, races `CODEX_IMAGE_PARALLEL_REQUESTS` concurrent upstream image requests for the same job, confirms quota after successful image/history persistence, releases quota on failures, converts upstream `b64_json` images into disk-backed `/api/ai/image/assets/:generationId/:index.png` URLs, returns/stores available per-image `byteSize`, `width`, and `height` metadata, `GET /api/ai/image/quota` returns free/paid/reserved/total quota, `GET /api/ai/image/jobs/:jobId` polls it, `GET /api/ai/image/history` supports `limit`, `beforeCreatedAt`, and `beforeGenerationId` cursor paging, and completed metadata persists to Supabase.
- AI image implementation docs: start at `docs/IMAGE_GENERATION_IMPLEMENTATION.zh-CN.md` for the end-to-end API/upload/return/history/quota flow before changing code.
- Admin access / API key management: start at `src/lib/use-admin.ts`, `src/lib/use-admin-permissions.ts`, `src/app/components/AdminStage.tsx`, `src/app/components/admin/`, `server/src/index.ts`, `server/src/registry/account-registry.ts`, and `server/src/registry/admin-session-registry.ts`; `/admin` logs in with a Supabase Auth account, `ADMIN_SUPER_EMAILS` grants super-admin access, normal admins live in `admin_roles`, role add/delete and `/api/admin/ai-config` require a super-admin session, `/api/admin/ai-config/detect` validates OpenAI-compatible API keys by reading `/models`, `/api/admin/permissions` exposes lightweight admin capabilities such as `canRecallAnyMessage`, `/api/admin/online-devices/name` renames currently connected WebSocket devices and rebroadcasts snapshots, and non-super admin state responses strip raw API key values.
- Supabase email confirmation templates / landing page: start at `docs/SUPABASE_AUTH_EMAIL_TEMPLATES.zh-CN.md`, `app/auth/confirm/page.tsx`, `src/app/components/AuthConfirmPage.tsx`, `server/src/index.ts`, and `server/src/registry/account-registry.ts`; registration sends Supabase confirmation email, `/auth/confirm` hands `token_hash` to `/api/auth/confirm`, and the backend calls Supabase `verifyOtp` before issuing the HttpOnly account cookie.
- Resend API smoke test: start at `server/scripts/send-resend-test-email.mjs`, `server/.env.example`, and `server/README.md`; Supabase Auth confirmation emails should still use Supabase custom SMTP configuration.
- Deployment / nginx / packaging: start at `deploy/`, `scripts/`, and root `README.md`.

## Search Strategy

- Prefer `src/lib/use-ddzhilian.ts` for client behavior questions.
- Prefer `server/src/index.ts` for backend request/event flow questions.
- Prefer `server/src/registry/*` when the question is about persisted or in-memory state.
- Ignore generated directories unless the task is specifically about build or deploy output.
