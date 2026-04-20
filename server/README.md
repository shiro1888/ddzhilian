# ddzhilian Signaling Server

This backend owns the first-phase architecture for:

- web device pairing
- text messaging signaling
- file transfer signaling
- multi-device auto-connect for the same account
- LAN discovery using a same-network heuristic

The actual chat text and file bytes should move through WebRTC data channels between browsers. This server only coordinates who can see whom, how pairing happens, and where signaling messages go.

## Responsibilities

- Device presence and reconnect identity
- Temporary short codes and pair tokens
- Same-account auto-connect decisions
- LAN peer discovery metadata
- LAN auto-link for discoverable devices
- WebRTC signaling relay
- Session lifecycle state

## LAN Discovery In This MVP

Browsers cannot reliably scan a LAN by themselves, so this backend groups devices by network context:

- private IPv4 clients are grouped by `/24` subnet
- otherwise the server falls back to the observed public IP

That makes LAN discovery accurate when the signaling server is reachable inside the LAN, and heuristic when multiple devices arrive through the same public gateway.

In the current backend behavior:

- devices with the same `accountId` and `autoConnect: true` will auto-create sessions
- devices in the same detected LAN with `discoverable: true` will also auto-create sessions

When the server is deployed behind `nginx`, it reads `X-Forwarded-For` to recover the real client address before doing LAN grouping.

## Local Run

```bash
cd server
npm install
npm run dev
```

Copy `.env.example` to `.env` if you want custom ports or TURN credentials.

## Environment

- `PORT`: HTTP and WebSocket port, default `8787`
- `HOST`: bind host, default `0.0.0.0`
- `PUBLIC_WS_URL`: public socket URL returned to clients
- `ALLOWED_ORIGINS`: optional comma-separated list of allowed browser origins for cross-origin HTTP access
- `ENABLE_DEBUG_STATE_API`: optional flag to expose `/api/debug/state`, default `false`
- `DEBUG_STATE_API_TOKEN`: bearer token required when `/api/debug/state` is enabled
- `PING_INTERVAL_MS`: websocket keepalive interval
- `SESSION_IDLE_MS`: stale session cleanup threshold
- `ROOM_EXIT_GRACE_MS`: how long a disconnected browser keeps its room membership, default 30 minutes
- `HISTORY_RETENTION_MS`: file history retention window, default 6 hours; text history is persisted
- `TURN_URL`: optional single TURN server URL
- `TURN_URLS`: optional comma-separated TURN server URLs
- `TURN_USERNAME`: optional TURN username
- `TURN_CREDENTIAL`: optional TURN credential
- `HISTORY_MAX_BYTES`: per-room history file storage cap, default 10 GiB

## History File Cleanup

History files are stored under `server/data/history/files/<roomId>/...`; the durable metadata index is `server/data/history/index.json`.

Public rooms do not have a separate cleanup policy. They use the same file-history rules as every other room:

- `HISTORY_RETENTION_MS` removes file records older than the configured retention window. The default is 6 hours.
- `HISTORY_MAX_BYTES` caps historical file storage per room. The default is 10 GiB.
- When a room exceeds the byte cap, cleanup removes the oldest files first until the room is under the limit.
- File cleanup deletes both the metadata entry and the stored file on disk.
- Cleanup runs on server startup, history listing, file save/upload paths, and the periodic maintenance loop.
- Text history is persisted independently of file cleanup. Text is removed only through explicit actions such as message recall.

## Endpoints

- `GET /health`
- `GET /api/debug/state` (disabled by default; requires bearer token when enabled)
- `WS /ws`

## Primary Client Events

- `hello`
- `update-settings`
- `pair-by-short-code`
- `pair-by-token`
- `create-public-room`
- `request-connect`
- `signal`
- `session-state`
- `request-snapshot`

## Primary Server Events

- `welcome`
- `directory-snapshot`
- `session-created`
- `signal`
- `peer-state`
- `error`

## Frontend Handshake

1. Open `ws://.../ws`
2. Send `hello`
3. Persist returned `self.deviceId`
4. Render `peers`, `lanPeers`, and `accountPeers`
5. When `session-created` arrives and `initiator` is true, create the WebRTC offer
6. Relay SDP and ICE through `signal`
7. Move text and file chunks through the data channel
8. Report `connected`, `failed`, and `closed` through `session-state`
