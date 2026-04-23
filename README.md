# ddzhilian

[中文说明](README.zh-CN.md)

ddzhilian is a desktop-style cross-device transfer app for quickly sending files and long text between devices. The current repository includes a React frontend prototype and a signaling server for device discovery, pairing, session management, and WebRTC signaling.

## What It Does

- Discover nearby or eligible devices from the same account
- Pair devices with a short transfer code
- Send files through transfer sessions with progress states
- Exchange long text or chat-style messages between devices
- View active and historical sessions in a chat-inspired desktop UI
- Use a single chat-desktop workspace tuned for device-to-device messaging and transfer

## Repository Layout

```text
.
|-- src/                   # React frontend
|-- public/                # Static assets
|-- server/                # WebSocket signaling backend
|-- DESIGN.md              # Product and visual system notes
|-- DESIGN.zh-CN.md        # Chinese design document
|-- package.json           # Frontend scripts
`-- server/package.json    # Backend scripts
```

## Tech Stack

- Frontend: Next.js static export, React 19, TypeScript
- Backend: Node.js, TypeScript, `ws`
- Transport model: WebSocket signaling plus WebRTC-oriented session flow

## Frontend Features

- Device list with connection status and quick actions
- File sending flow with drag-and-drop support
- Receive queue and completed transfer history
- Long text and chat conversation views
- Session search and session detail panels
- Single chat-desktop interface with routed workspace views
- Browser-based route navigation for `connect`, `send`, `receive`, `text`, and `sessions`
- Component-split app shell with isolated stage views and content panels
- Floating emoji picker with direct insertion into the chat composer
- Rich chat composer toolbar inspired by classroom editors
- Text formatting, color palette, table insertion, TEX/code block insertion, and link-style attachment insertion
- Chat messages render common Markdown syntax, including headings, emphasis, blockquotes, lists, links, images, inline code, and fenced code blocks
- Google Fonts based UI typography

### Markdown Message Rendering

Chat messages detect common Markdown syntax in plain-text content and render it as controlled rich HTML. The supported subset includes:

- `#`, `##`, and `###` headings
- `**bold**`, `*italic*`, and `~~strikethrough~~`
- `>` blockquotes
- `-` / `*` / `+` unordered lists and `1.` / `1)` ordered lists
- `` `inline code` `` and triple-backtick fenced code blocks
- `[links](https://example.com)` and `![images](https://example.com/image.png)`

Messages that already contain HTML or pasted rich text still use the existing allowlist sanitizer, so rich-text paste behavior, code-paste handling, and the safety boundary remain intact.

## Backend Responsibilities

The signaling server in [`server/README.md`](server/README.md) handles:

- device presence and reconnect identity
- short codes and pair tokens
- same-account auto-connect
- LAN-based peer discovery heuristics
- session lifecycle coordination
- signaling relay for peer-to-peer transfer

The server does not need to carry file payloads permanently. Its main role is to help devices find each other and establish a transfer session.

### History File Cleanup

Public rooms and regular rooms use the same temporary history-file cleanup rules:

- Files are stored under `server/data/history/files/<roomId>/...`, with metadata indexed in `server/data/history/index.json`.
- `HISTORY_RETENTION_MS` controls the file-history retention window. The default is `21600000` ms, or 6 hours.
- `HISTORY_MAX_BYTES` controls the total historical file storage per room. The default is 10 GiB.
- When files exceed the retention window, or when a room exceeds the storage cap, the server removes the oldest files first and updates the index.
- Cleanup runs on server startup, when listing or saving history files, during uploads, and during regular server maintenance.
- Text history is not expired by `HISTORY_RETENTION_MS`; recalled text messages are removed through the history-text delete endpoint.

## Getting Started

### Requirements

- Node.js 20+ recommended
- npm

### Install Dependencies

```bash
npm install
cd server
npm install
```

### Run The Frontend

From the repository root:

```bash
npm run dev
```

This starts the Next.js frontend, typically on `http://localhost:3000`.

### Frontend Routes

The frontend uses `react-router-dom` with browser history:

- `/connect`
- `/send`
- `/receive`
- `/text`
- `/sessions`

The app now ships with only the chat-desktop experience. File send and receive flows are folded into the conversation workspace and redirect to `/text`.

### Run The Backend

From [`server`](server):

```bash
npm run dev
```

By default, the signaling server runs on `http://0.0.0.0:8787` and exposes a WebSocket endpoint at `/ws`.

## Build

### Frontend

```bash
npm run build
```

### Backend

```bash
cd server
npm run build
```

## Environment

### Frontend

Optional frontend environment variables:

- `VITE_SIGNALING_WS_URL`: explicit WebSocket URL for the signaling server
- `VITE_SIGNALING_HTTP_URL`: explicit HTTP base URL for history/debug requests

If these are not provided, the frontend uses `ws://localhost:8787/ws` in local development and derives `/ws` from the current origin in production.

Backend environment settings live in [`server/.env.example`](server/.env.example). Copy it to `.env` inside `server/` if you want to customize the runtime.

Important variables include:

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

## Deployment Notes

### Frontend Static Hosting

The frontend is built by Next.js as a static export while preserving the existing browser-side workspace routes. Your web server should still rewrite unknown frontend routes back to `index.html` as a fallback.

Typical production setup:

1. Run `npm run build`
2. Serve the generated `out/` directory
3. Rewrite non-file frontend requests to `out/index.html`
4. Expose `/ws` to the signaling backend, or set `VITE_SIGNALING_WS_URL` and `VITE_SIGNALING_HTTP_URL`

Current production frontend is served from `https://ddzhilian.com`.

### Backend

For production, build and run the signaling server from the `server/` directory:

```bash
cd server
npm install
npm run build
npm run start
```

If the backend is behind `nginx`, make sure WebSocket upgrade headers and `X-Forwarded-For` are passed through.

## Design Notes

The product direction and UI behavior are documented in:

- [`DESIGN.md`](DESIGN.md)
- [`DESIGN.zh-CN.md`](DESIGN.zh-CN.md)

These files define the desktop chat workspace layout, the restrained WeChat-like visual language, and the interaction expectations for transfer and messaging flows.

## Current Status

This repository is currently positioned as an MVP/prototype:

- the frontend already demonstrates the main interaction model
- the backend covers signaling and discovery responsibilities
- WebRTC and transfer workflow integration are structured for continued iteration

## Scripts

Root:

- `npm run dev` - start the frontend development server
- `npm run build` - type-check and export the Next.js frontend to `out/`
- `npm run lint` - run ESLint
- `npm run preview` - preview the built frontend

Server:

- `npm run dev` - start the backend in watch mode
- `npm run build` - compile the backend
- `npm run start` - run the compiled backend from `dist`
