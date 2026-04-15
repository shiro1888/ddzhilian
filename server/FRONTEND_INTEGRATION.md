# CCConnect Frontend Integration

This document explains how the current frontend should connect to the deployed CCConnect signaling service.

## Live Endpoints

- App base URL: `https://ddzhilian.com`
- Health check: `https://ddzhilian.com/health`
- WebSocket endpoint: `wss://ddzhilian.com/ws`

## What The Backend Does

The backend is a control plane only. It is responsible for:

- device registration and reconnect identity
- short-code pairing
- pair-link token pairing
- same-account auto-connect
- LAN grouping metadata
- LAN auto-link for discoverable devices
- WebRTC offer/answer/ICE forwarding
- session status synchronization

The backend does **not** store file contents. Text messages and file chunks should be sent through a WebRTC `RTCDataChannel` after the peer connection is established.

## Suggested Frontend Connection Flow

1. Open `wss://ddzhilian.com/ws`
2. Send a `hello` message
3. Persist `payload.self.deviceId` locally
4. Render `peers`, `lanPeers`, `accountPeers`, and `sessions`
5. On `session-created`:
   - if `initiator === true`, create the WebRTC offer
   - if `initiator === false`, wait for the incoming offer
6. Exchange SDP and ICE through `signal`
7. Once the data channel opens, send text and file chunks peer-to-peer
8. Report connection state with `session-state`

If two discoverable devices are detected on the same LAN, the backend may create the session automatically without the user clicking the connect button.

## Initial Hello Message

Send this immediately after the socket opens:

```json
{
  "type": "hello",
  "payload": {
    "deviceId": "optional_persisted_device_id",
    "deviceName": "Alice MacBook",
    "platform": "web",
    "accountId": "alice@example.com",
    "autoConnect": true,
    "discoverable": true,
    "allowShortCode": true
  }
}
```

Field notes:

- `deviceId`: optional on first load; persist and reuse after the first `welcome`
- `deviceName`: user-facing device label
- `platform`: keep it simple, for example `web`, `desktop`, `tablet`, `mobile`
- `accountId`: use the current signed-in account identifier if you want same-account auto-connect
- `autoConnect`: enables automatic sessions with other online devices using the same `accountId`
- `discoverable`: whether this device should appear in peer lists and allow same-LAN auto-link
- `allowShortCode`: whether other devices may connect by short code

## First Response You Will Receive

The server replies with `welcome`:

```json
{
  "type": "welcome",
  "payload": {
    "self": {
      "deviceId": "dev_xxx",
      "deviceName": "Alice MacBook",
      "shortCode": "ABC123",
      "pairToken": "token123",
      "accountId": "alice@example.com",
      "autoConnect": true,
      "discoverable": true,
      "allowShortCode": true,
      "platform": "web"
    },
    "peers": [],
    "lanPeers": [],
    "accountPeers": [],
    "sessions": [],
    "rtcConfig": {
      "iceServers": [
        {
          "urls": ["stun:stun.l.google.com:19302"]
        }
      ]
    },
    "publicWsUrl": "wss://ddzhilian.com/ws",
    "serverTime": "2026-04-13T00:00:00.000Z"
  }
}
```

Persist:

- `self.deviceId`
- `self.shortCode`
- `self.pairToken`

Use `rtcConfig.iceServers` directly when constructing `RTCPeerConnection`.

## Ongoing Snapshot Updates

The backend may push `directory-snapshot` at any time:

```json
{
  "type": "directory-snapshot",
  "payload": {
    "...": "same shape as welcome.payload"
  }
}
```

Recommended UI behavior:

- replace peer lists from the latest snapshot
- merge `sessions` by `sessionId`
- do not rely on stale local peer state if a new snapshot arrives

## Pairing Methods

### 1. Pair By Short Code

```json
{
  "type": "pair-by-short-code",
  "payload": {
    "shortCode": "ABC123"
  }
}
```

### 2. Pair By Link Token

If you build a share link such as:

```text
https://ddzhilian.com/connect?token=<pairToken>
```

then you can either:

- send `pair-by-token` after the socket connects, or
- include `requestedPairToken` inside the initial `hello`

Example:

```json
{
  "type": "pair-by-token",
  "payload": {
    "pairToken": "token123"
  }
}
```

### 3. Pair From A Visible Device Row

```json
{
  "type": "request-connect",
  "payload": {
    "targetDeviceId": "dev_target",
    "reason": "manual"
  }
}
```

## Session Creation Event

Both sides receive `session-created`:

```json
{
  "type": "session-created",
  "payload": {
    "sessionId": "sess_xxx",
    "peer": {
      "deviceId": "dev_peer",
      "deviceName": "Bob iPad",
      "platform": "web",
      "shortCode": "QWE789",
      "pairToken": "peerToken",
      "online": true,
      "relation": {
        "sameAccount": false,
        "sameLan": false,
        "autoConnectEligible": false,
        "discoverable": true
      },
      "lastSeenAt": "2026-04-13T00:00:00.000Z"
    },
    "reason": "manual",
    "initiator": true
  }
}
```

Frontend rule:

- `initiator: true` -> create offer
- `initiator: false` -> wait for offer, then create answer

## WebRTC Signaling

### Send Offer

```json
{
  "type": "signal",
  "payload": {
    "sessionId": "sess_xxx",
    "targetDeviceId": "dev_peer",
    "signal": {
      "kind": "offer",
      "description": {
        "type": "offer",
        "sdp": "..."
      }
    }
  }
}
```

### Send Answer

```json
{
  "type": "signal",
  "payload": {
    "sessionId": "sess_xxx",
    "targetDeviceId": "dev_peer",
    "signal": {
      "kind": "answer",
      "description": {
        "type": "answer",
        "sdp": "..."
      }
    }
  }
}
```

### Send ICE Candidate

```json
{
  "type": "signal",
  "payload": {
    "sessionId": "sess_xxx",
    "targetDeviceId": "dev_peer",
    "signal": {
      "kind": "ice-candidate",
      "candidate": {
        "candidate": "...",
        "sdpMid": "0",
        "sdpMLineIndex": 0
      }
    }
  }
}
```

### Receive Forwarded Signal

```json
{
  "type": "signal",
  "payload": {
    "sessionId": "sess_xxx",
    "fromDeviceId": "dev_peer",
    "signal": {
      "...": "offer, answer, or ice-candidate"
    }
  }
}
```

## Session State Reporting

Send state updates so both sides and the directory remain consistent:

```json
{
  "type": "session-state",
  "payload": {
    "sessionId": "sess_xxx",
    "targetDeviceId": "dev_peer",
    "state": "connected"
  }
}
```

Allowed values:

- `connecting`
- `connected`
- `failed`
- `closed`

Peer updates arrive as:

```json
{
  "type": "peer-state",
  "payload": {
    "sessionId": "sess_xxx",
    "peerId": "dev_peer",
    "state": "connected"
  }
}
```

## Updating Device Settings

If the user changes discoverability or device name:

```json
{
  "type": "update-settings",
  "payload": {
    "deviceName": "Alice iPad",
    "discoverable": false,
    "allowShortCode": false,
    "autoConnect": true,
    "accountId": "alice@example.com",
    "platform": "tablet"
  }
}
```

## Frontend State Shape Recommendation

Recommended top-level client state:

```ts
type AppState = {
  self: DirectorySnapshotPayload['self'] | null;
  peers: PeerSummary[];
  lanPeers: PeerSummary[];
  accountPeers: PeerSummary[];
  sessions: Map<string, SessionSummary>;
  socketState: 'idle' | 'connecting' | 'open' | 'closed' | 'error';
  rtcConfig: RTCConfiguration | null;
};
```

## Data Channel Recommendation

Use one `RTCDataChannel` per session for MVP.

Suggested message envelope:

```ts
type DataMessage =
  | { type: 'text'; id: string; text: string; createdAt: string }
  | { type: 'file-meta'; id: string; name: string; size: number; mimeType?: string; chunkSize: number }
  | { type: 'file-chunk'; id: string; index: number; total: number; data: ArrayBuffer }
  | { type: 'file-complete'; id: string };
```

Recommended chunk size:

- start with `16 KB` to `64 KB`
- pause sending when `dataChannel.bufferedAmount` gets too high
- resume on `bufferedamountlow`

## Reconnect Rules

- If the socket reconnects, send `hello` again using the persisted `deviceId`
- Replace snapshots from the newest `welcome` or `directory-snapshot`
- Recreate peer connections after reconnect if the old WebRTC transport is gone

## Error Events

The backend sends structured errors:

```json
{
  "type": "error",
  "payload": {
    "code": "DEVICE_NOT_FOUND",
    "message": "No online device matches that short code."
  }
}
```

Known error codes:

- `BAD_EVENT`
- `DEVICE_NOT_READY`
- `DEVICE_NOT_FOUND`
- `SHORT_CODE_BLOCKED`
- `PAIR_TOKEN_NOT_FOUND`
- `SESSION_NOT_FOUND`
- `SESSION_FORBIDDEN`

## Minimum Frontend Checklist

- connect to `wss://ddzhilian.com/ws`
- send `hello`
- persist `deviceId`
- show `shortCode`
- expose a share link built from `pairToken`
- render peer lists from snapshots
- handle `session-created`
- wire WebRTC SDP and ICE through `signal`
- send chat text and file chunks over `RTCDataChannel`
- report connection progress with `session-state`
