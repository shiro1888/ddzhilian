# ddzhilian

[中文说明](README.zh-CN.md)

ddzhilian is a lightweight cross-device transfer and chat workspace. It brings device discovery, short-code pairing, file transfer, long-text sharing, public rooms, and history management into a desktop-style chat interface for quickly moving content between computers, phones, and browser clients.

This repository contains:

- a Next.js, React, and TypeScript frontend
- a Node.js, TypeScript, and `ws` signaling backend
- pairing, session, and relay coordination for WebRTC data channels
- baseline documentation and configuration for static hosting, nginx proxying, and self-hosted deployment

## Core Capabilities

- Device discovery: show eligible devices from the same account or local network context.
- Short-code pairing: connect devices quickly with a short transfer code.
- Chat workspace: use a desktop-chat interface for messages, files, and session state.
- File transfer: support drag-and-drop selection, progress state, receive queues, and completed history.
- Long-text exchange: support plain text, pasted rich text, and Markdown rendering.
- Public rooms: support public room entry links and room-scoped history.
- History management: keep text history for 24 hours by default and clean temporary file history by retention and size limits.
- Realtime signaling: coordinate presence, pairing, and WebRTC setup through WebSocket signaling.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js static export, React 19, TypeScript, react-router-dom |
| Backend | Node.js, TypeScript, ws |
| Realtime | WebSocket signaling + WebRTC data channels |
| Checks | ESLint, TypeScript, Next.js build |
| Deployment | Static frontend + Node.js signaling service + nginx reverse proxy |

## Repository Layout

```text
.
|-- src/                   # Frontend source
|-- app/                   # Next.js app entry and static export entry
|-- public/                # Static assets
|-- server/                # WebSocket signaling backend
|-- deploy/                # Self-hosted deployment configuration
|-- scripts/               # Build, compression, and preview scripts
|-- DESIGN.md              # English design notes
|-- DESIGN.zh-CN.md        # Chinese design notes
|-- package.json           # Frontend scripts and dependencies
`-- server/package.json    # Backend scripts and dependencies
```

## Getting Started

### Requirements

- Node.js 20 or newer
- npm

### Install Dependencies

```bash
npm install
cd server
npm install
```

### Start The Frontend

From the repository root:

```bash
npm run dev
```

The default local URL is usually `http://localhost:3000`.

### Start The Backend

From `server/`:

```bash
cd server
npm run dev
```

The signaling server listens on `http://0.0.0.0:8787` by default and exposes WebSocket signaling at `/ws`.

## Frontend Routes

The frontend uses browser history routes. Main routes include:

- `/connect`
- `/send`
- `/receive`
- `/text`
- `/sessions`

The current product shape centers on the chat-desktop experience. File sending and receiving flows fold back into the conversation workspace.

## Messages And Markdown

Chat messages support plain text, pasted rich text, and common Markdown rendering.

Plain-text messages detect this Markdown subset:

- `#`, `##`, and `###` headings
- `**bold**`, `*italic*`, and `~~strikethrough~~`
- `>` blockquotes
- `-` / `*` / `+` unordered lists
- `1.` / `1)` ordered lists
- `` `inline code` ``
- triple-backtick fenced code blocks
- `[links](https://example.com)`
- `![images](https://example.com/image.png)`

Messages that already contain HTML or externally pasted rich text continue through the existing allowlist sanitizer, preserving rich-text paste behavior, code-paste handling, and the security boundary.

## Backend Responsibilities

The backend coordinates connections instead of acting as permanent file storage. It handles:

- device presence and reconnect identity
- short codes and pair tokens
- same-account auto-connect
- LAN-based discovery heuristics
- room and session lifecycles
- WebRTC signaling relay
- history text and history file metadata
- Cloudflare AI proxy requests

See [server/README.md](server/README.md) for backend protocol details.

## History Cleanup

Public rooms and regular rooms share the same temporary file-history rules:

- Files are stored under `server/data/history/files/<roomId>/...`.
- Metadata is stored in `server/data/history/index.json`.
- `HISTORY_RETENTION_MS` controls file-history retention. The default is 6 hours, capped at 24 hours.
- `HISTORY_TEXT_RETENTION_MS` controls text-history retention. The default is 24 hours, capped at 24 hours.
- `HISTORY_MAX_BYTES` controls the per-room historical file cap. The default is 10 GiB.
- Cleanup runs during startup, history reads, history writes, uploads, and scheduled maintenance.
- Expired text history is removed from the metadata index; expired file history removes both metadata and stored files.

## Environment Variables

### Frontend

Optional variables:

- `VITE_SIGNALING_WS_URL`: explicit WebSocket URL for the signaling server.
- `VITE_SIGNALING_HTTP_URL`: explicit HTTP base URL for history or debug requests.

When these are not set, local development uses `ws://localhost:8787/ws`, and production derives `/ws` from the current site origin.

### Backend

The backend environment template lives in [server/.env.example](server/.env.example). Common variables include:

- `PORT`
- `HOST`
- `PUBLIC_WS_URL`
- `PING_INTERVAL_MS`
- `SESSION_IDLE_MS`
- `HISTORY_RETENTION_MS`
- `HISTORY_TEXT_RETENTION_MS`
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

Do not commit real secrets, tokens, or passwords to the repository.

## Build And Check

### Frontend

```bash
npm run lint
npm run build
```

`npm run build` runs the production Next.js build and outputs the static frontend.

### Backend

```bash
cd server
npm run build
```

Backend output is written to `server/dist/`.

## Deployment

### Frontend Static Hosting

Typical flow:

1. Run `npm run build` from the repository root.
2. Deploy the generated `out/` directory.
3. Rewrite unknown frontend routes to `out/index.html`.
4. Proxy `/ws` to the signaling backend, or set explicit frontend signaling URLs.

For compressed frontend artifacts, run:

```bash
npm run build:compressed
```

### Self-Hosted Backend

For production, build and run from `server/`:

```bash
cd server
npm install
npm run build
npm run start
```

If the backend sits behind nginx, make sure WebSocket Upgrade headers and `X-Forwarded-For` are forwarded correctly.

Self-hosted deployment configuration lives under `deploy/`.

## Scripts

Root:

- `npm run dev`: start the frontend development server.
- `npm run build`: build the static frontend.
- `npm run build:compressed`: build and compress frontend artifacts.
- `npm run lint`: run ESLint.
- `npm run preview`: preview the frontend build output.

`server/`:

- `npm run dev`: start the backend in watch mode.
- `npm run build`: compile backend TypeScript.
- `npm run start`: run `dist/index.js`.

## Design Documents

Product direction, layout, and interaction principles are documented in:

- [DESIGN.md](DESIGN.md)
- [DESIGN.zh-CN.md](DESIGN.zh-CN.md)

These documents define the desktop chat workspace, restrained chat-style visual language, and interaction constraints for messaging and transfer flows.

## Current Status

The project is still under active iteration:

- The frontend covers the main chat, text, file, and history interactions.
- The backend covers signaling, discovery, room/session flow, and history APIs.
- WebRTC quality, cross-network TURN behavior, and production deployment health still need to be verified against the actual server environment.
