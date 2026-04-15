# CCConnect

CCConnect is a desktop-style cross-device transfer app for quickly sending files and long text between devices. The current repository includes a React frontend prototype and a signaling server for device discovery, pairing, session management, and WebRTC signaling.

## What It Does

- Discover nearby or eligible devices from the same account
- Pair devices with a short transfer code
- Send files through transfer sessions with progress states
- Exchange long text or chat-style messages between devices
- View active and historical sessions in a chat-inspired desktop UI
- Support a WeChat-for-desktop style visual theme alongside the earlier classic theme

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

- Frontend: React 19, TypeScript, Vite
- Backend: Node.js, TypeScript, `ws`
- Transport model: WebSocket signaling plus WebRTC-oriented session flow

## Frontend Features

- Device list with connection status and quick actions
- File sending flow with drag-and-drop support
- Receive queue and completed transfer history
- Long text and chat conversation views
- Session search and session detail panels
- Theme switcher with `classic` and `chat-desktop`

## Backend Responsibilities

The signaling server in [`server/README.md`](C:/Users/12467/Documents/707/CCConnect/server/README.md) handles:

- device presence and reconnect identity
- short codes and pair tokens
- same-account auto-connect
- LAN-based peer discovery heuristics
- session lifecycle coordination
- signaling relay for peer-to-peer transfer

The server does not need to carry file payloads permanently. Its main role is to help devices find each other and establish a transfer session.

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

This starts the Vite frontend, typically on `http://localhost:5173`.

### Run The Backend

From [`server`](C:/Users/12467/Documents/707/CCConnect/server):

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

Backend environment settings live in [`server/.env.example`](C:/Users/12467/Documents/707/CCConnect/server/.env.example). Copy it to `.env` inside `server/` if you want to customize the runtime.

Important variables include:

- `PORT`
- `HOST`
- `PUBLIC_WS_URL`
- `PING_INTERVAL_MS`
- `SESSION_IDLE_MS`
- `TURN_URL`
- `TURN_URLS`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

## Design Notes

The product direction and UI behavior are documented in:

- [`DESIGN.md`](C:/Users/12467/Documents/707/CCConnect/DESIGN.md)
- [`DESIGN.zh-CN.md`](C:/Users/12467/Documents/707/CCConnect/DESIGN.zh-CN.md)

These files define the desktop chat workspace layout, the restrained WeChat-like visual language, and the interaction expectations for transfer and messaging flows.

## Current Status

This repository is currently positioned as an MVP/prototype:

- the frontend already demonstrates the main interaction model
- the backend covers signaling and discovery responsibilities
- WebRTC and transfer workflow integration are structured for continued iteration

## Scripts

Root:

- `npm run dev` - start the frontend development server
- `npm run build` - type-check and build the frontend
- `npm run lint` - run ESLint
- `npm run preview` - preview the built frontend

Server:

- `npm run dev` - start the backend in watch mode
- `npm run build` - compile the backend
- `npm run start` - run the compiled backend from `dist`
