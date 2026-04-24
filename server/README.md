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
- `HISTORY_RETENTION_MS`: file history retention window, default 6 hours, capped at 24 hours
- `HISTORY_TEXT_RETENTION_MS`: text history retention window, default 24 hours, capped at 24 hours
- `TURN_URL`: optional single TURN server URL
- `TURN_URLS`: optional comma-separated TURN server URLs
- `TURN_USERNAME`: optional TURN username
- `TURN_CREDENTIAL`: optional TURN credential
- `HISTORY_MAX_BYTES`: per-room history file storage cap, default 10 GiB
- `CLOUDFLARE_AI_ACCOUNT_ID`: Cloudflare account ID for Workers AI REST API
- `CLOUDFLARE_AI_API_TOKEN`: Cloudflare API token with Workers AI execution access
- `CLOUDFLARE_AI_MODEL`: Workers AI model name, default `@cf/zai-org/glm-4.7-flash`
- `CLOUDFLARE_AI_MAX_PROMPT_CHARS`: maximum prompt size accepted by `/api/ai/chat`, default `8000`
- `CLOUDFLARE_AI_MAX_OUTPUT_TOKENS`: maximum model output tokens per request, default `1000`
- `CLOUDFLARE_AI_FREE_ONLY`: when not set to `false`, the server stops AI requests at the local free-tier budget
- `CLOUDFLARE_AI_DAILY_NEURON_BUDGET`: local daily Workers AI budget, default `10000`
- `CLOUDFLARE_AI_INPUT_NEURONS_PER_M_TOKENS`: input pricing estimate for local budget checks, default `4625`
- `CLOUDFLARE_AI_OUTPUT_NEURONS_PER_M_TOKENS`: output pricing estimate for local budget checks, default `30475`

## History Cleanup

History files are stored under `server/data/history/files/<roomId>/...`; the durable metadata index is `server/data/history/index.json`.

Public rooms do not have a separate cleanup policy. They use the same file-history rules as every other room:

- `HISTORY_RETENTION_MS` removes file records older than the configured retention window. The default is 6 hours, and the server caps it at 24 hours.
- `HISTORY_TEXT_RETENTION_MS` removes text records older than the configured retention window. The default and maximum are 24 hours.
- `HISTORY_MAX_BYTES` caps historical file storage per room. The default is 10 GiB.
- When a room exceeds the byte cap, cleanup removes the oldest files first until the room is under the limit.
- File cleanup deletes both the metadata entry and the stored file on disk.
- Cleanup runs on server startup, history listing, history writes, file save/upload paths, and the periodic maintenance loop.
- Text cleanup deletes the metadata entry; message recall still deletes the target text immediately.

## Endpoints

- `GET /health`
- `GET /api/debug/state` (disabled by default; requires bearer token when enabled)
- `GET /api/ai/quota` (requires the device history bearer token; returns local Workers AI free-tier budget status)
- `POST /api/ai/chat` (requires the device history bearer token; proxies prompts to Cloudflare Workers AI)
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
