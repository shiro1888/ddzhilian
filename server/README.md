# CCConnect Signaling Server

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
- `PING_INTERVAL_MS`: websocket keepalive interval
- `SESSION_IDLE_MS`: stale session cleanup threshold
- `TURN_URL`: optional single TURN server URL
- `TURN_URLS`: optional comma-separated TURN server URLs
- `TURN_USERNAME`: optional TURN username
- `TURN_CREDENTIAL`: optional TURN credential

## Endpoints

- `GET /health`
- `GET /api/debug/state`
- `WS /ws`

## Primary Client Events

- `hello`
- `update-settings`
- `pair-by-short-code`
- `pair-by-token`
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
