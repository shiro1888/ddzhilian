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
|   |       |-- ConnectStage.tsx
|   |       |-- SendStage.tsx
|   |       |-- ReceiveStage.tsx
|   |       |-- TextStage.tsx
|   |       |-- SessionsStage.tsx
|   |       `-- AdminStage.tsx
|   `-- lib/
|       |-- use-ddzhilian.ts
|       `-- ddzhilian-types.ts
|-- server/
|   |-- README.md
|   |-- src/
|   |   |-- index.ts
|   |   |-- config.ts
|   |   |-- protocol.ts
|   |   |-- registry/
|   |   |   |-- device-registry.ts
|   |   |   |-- room-registry.ts
|   |   |   |-- session-registry.ts
|   |   |   |-- history-registry.ts
|   |   |   |-- ui-state-registry.ts
|   |   |   |-- admin-config-registry.ts
|   |   |   |-- admin-session-registry.ts
|   |   |   `-- ai-usage-registry.ts
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
- `src/App.tsx`: top-level frontend composition entry.
- `src/BrowserApp.tsx`: browser-facing app wrapper.
- `src/app/routes.ts`: route-to-view mapping.

### Frontend state and protocol client

- `src/lib/use-ddzhilian.ts`: main client runtime. WebSocket connection, identity persistence, room/session state, WebRTC/file transfer coordination, history fetch/download, AI requests.
- `src/lib/ddzhilian-types.ts`: shared frontend protocol/data types.
- `src/app/types.ts`: UI-level view and component types.
- `src/app/config.tsx`: UI config/constants.
- `src/app/utils.ts`: small UI helpers.

### Frontend feature components

- `src/app/components/ChatConversationStage.tsx`: main chat workspace, room conversation flow.
- `src/app/components/ConnectStage.tsx`: device discovery, pairing, and connection entry.
- `src/app/components/SendStage.tsx`: send-side transfer view.
- `src/app/components/ReceiveStage.tsx`: receive-side transfer view.
- `src/app/components/TextStage.tsx`: long-text and Markdown exchange UI.
- `src/app/components/SessionsStage.tsx`: active session list and state display.
- `src/app/components/AdminStage.tsx`: admin and AI-related management UI.
- `src/app/components/AppHeader.tsx`: top bar and global actions.
- `src/app/components/AppSidebar.tsx`: sidebar navigation and brand area.
- `src/app/components/ContentGrid.tsx`: shared content layout wrapper.

### Backend entry and protocol

- `server/src/index.ts`: HTTP + WebSocket server entry, request handling, signaling flow, AI proxy endpoints, history download/upload endpoints.
- `server/src/index.ts`: HTTP + WebSocket server entry, request handling, signaling flow, AI proxy endpoints, history download/upload endpoints, and room recent-24h text context assembly for AI requests.
- `server/src/config.ts`: environment parsing and backend runtime config.
- `server/src/protocol.ts`: backend event schema and client-event parsing.

### Backend state registries

- `server/src/registry/device-registry.ts`: online device presence, identity, pairing metadata.
- `server/src/registry/room-registry.ts`: room membership and room summaries.
- `server/src/registry/session-registry.ts`: live connection/session lifecycle.
- `server/src/registry/history-registry.ts`: persisted history text/file metadata and cleanup.
- `server/src/registry/ui-state-registry.ts`: per-device room UI state such as pin/read markers.
- `server/src/registry/admin-config-registry.ts`: admin-configurable AI settings snapshot.
- `server/src/registry/admin-session-registry.ts`: admin login/session state.
- `server/src/registry/ai-usage-registry.ts`: local AI usage accounting.

### Backend utilities

- `server/src/utils/network.ts`: client network-context detection used by LAN heuristics.
- `server/src/utils/id.ts`: ID helpers.
- `server/src/utils/cloudflare-ai-quota.ts`: local Cloudflare AI quota tracking.

### Runtime data and assets

- `server/data/`: local runtime data, including history and admin usage state. Treat as environment data, not source logic.
- `public/`: favicon, logos, icon sprite, response headers.

### Build and deployment helpers

- `scripts/compress-dist.mjs`: package frontend build output for deployment.
- `scripts/serve-out.mjs`: local static preview of exported frontend.
- `scripts/sync-openrouter-free-models.mjs`: sync/update OpenRouter free model config.
- `deploy/nginx/ddzhilian.conf`: nginx reference config for the self-hosted site.
- `deploy/README.zh-CN.md`: deployment notes.

## Fast Location Guide

If the task is about:

- Chat UI / room list / message area: start at `src/app/components/ChatConversationStage.tsx`.
- Device discovery / pairing / reconnect entry: start at `src/app/components/ConnectStage.tsx` and `src/lib/use-ddzhilian.ts`.
- File send / receive / progress: start at `src/lib/use-ddzhilian.ts`, `SendStage.tsx`, and `ReceiveStage.tsx`.
- Markdown / long text behavior: start at `TextStage.tsx` and `use-ddzhilian.ts`.
- Public room / room state / history: start at `use-ddzhilian.ts`, `server/src/registry/room-registry.ts`, and `server/src/registry/history-registry.ts`.
- WebSocket protocol or event mismatch: start at `server/src/protocol.ts`, `server/src/index.ts`, and `src/lib/ddzhilian-types.ts`.
- LAN auto-discovery behavior: start at `server/src/utils/network.ts` and `server/src/registry/device-registry.ts`.
- AI quota / provider / admin settings: start at `server/src/index.ts`, `admin-config-registry.ts`, `ai-usage-registry.ts`, and `cloudflare-ai-quota.ts`.
- AI chat room context behavior: start at `server/src/index.ts`; room-scoped AI requests automatically prepend recent 24-hour room text context before sending to the model.
- Deployment / nginx / packaging: start at `deploy/`, `scripts/`, and root `README.md`.

## Search Strategy

- Prefer `src/lib/use-ddzhilian.ts` for client behavior questions.
- Prefer `server/src/index.ts` for backend request/event flow questions.
- Prefer `server/src/registry/*` when the question is about persisted or in-memory state.
- Ignore generated directories unless the task is specifically about build or deploy output.
