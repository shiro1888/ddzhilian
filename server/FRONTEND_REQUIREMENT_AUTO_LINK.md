# Frontend Requirement: Auto-Link And File Targeting

This document describes the frontend changes required to support PP-style automatic device linking and file sending behavior with the current backend.

## Background

The backend now supports two automatic session creation modes:

- same-account auto-link
- same-LAN auto-link for devices with `discoverable: true`

That means the frontend must no longer treat "online devices" and "connected devices" as the same concept.

## Current Problem

The UI can already display online devices, but the file sending area still shows:

- `当前目标：未链接设备`
- `无法发送文件`

even when a peer is visible in the online device list.

This happens because:

- the online device list is being rendered
- but the frontend is not promoting automatically created sessions into the "connected targets" model used by the file sender

## Product Goal

Match the expected behavior of tools like PP直连:

- devices that are on the same LAN and publicly discoverable should auto-link
- same-account devices should auto-link
- once a session reaches `connected`, the file sender should immediately allow choosing that device as a target

## Definitions

### Online Device

A peer returned in:

- `peers`
- `lanPeers`
- `accountPeers`

This means:

- the peer is online
- the peer is visible
- the peer is not necessarily ready to receive files yet

### Connected Device

A peer that has:

- an active session
- a completed WebRTC connection
- `session-state = connected`

Only connected devices should appear in "push file to connected device".

## Required Frontend Behavior

### 1. Keep Two Separate Models

The frontend must keep two independent concepts:

- `onlinePeers`
- `connectedTargets`

Do not use the online device list directly as the file send target list.

### 2. Auto Sessions Must Be Accepted By The UI

When the backend sends:

```json
{
  "type": "session-created",
  "payload": {
    "sessionId": "sess_xxx",
    "peer": { "...": "peer info" },
    "reason": "lan-discovery",
    "initiator": true
  }
}
```

the frontend must treat this exactly like a user-initiated connection request.

Required behavior:

- create or reuse a `RTCPeerConnection`
- if `initiator = true`, create the offer automatically
- if `initiator = false`, wait for the offer and answer automatically
- open or accept the data channel automatically

The user should not need to click "连接其他设备" when the backend already created the session.

### 3. Connected Sessions Must Feed The File Sender

Once a peer connection becomes connected:

- send `session-state: connected`
- add that peer to `connectedTargets`
- refresh the file sender target selector immediately

If the connection closes or fails:

- send `session-state: closed` or `failed`
- remove that peer from `connectedTargets`

### 4. File Sender Must Prefer Existing Connected Targets

The file sending panel currently behaves as if no valid target exists until the user manually connects.

It should instead:

- read from `connectedTargets`
- if there is exactly one connected target, preselect it automatically
- if there are multiple connected targets, ask the user to choose
- if there are none, show a clear empty state

## Required UI Changes

### Device List Area

For each online device row:

- keep showing device name
- keep showing device type
- keep showing relationship labels such as same LAN or same account
- add a connection status badge:
  - `在线`
  - `连接中`
  - `已连接`
  - `连接失败`

### File Sender Area

Replace the current logic:

- `当前目标：未链接设备`

with:

- if there is one connected target:
  - `当前目标：<设备名>`
- if there are many:
  - `当前目标：请选择设备`
- if there are none:
  - `当前目标：暂无已连接设备`

### Recommended Empty State

When no connected targets exist, the file sender should explain why:

- `检测到在线设备，但尚未完成直连`
- `正在尝试自动连接...`

or:

- `当前没有可接收文件的已连接设备`

This helps distinguish:

- "no online devices"
- "online but not connected yet"

## State Management Requirements

Recommended frontend state split:

```ts
type PeerConnectionState = {
  sessionId: string;
  peerId: string;
  peerName: string;
  reason: 'manual' | 'short-code' | 'pair-link' | 'account-auto' | 'lan-discovery';
  status: 'connecting' | 'connected' | 'failed' | 'closed';
};

type AppState = {
  onlinePeers: PeerSummary[];
  sessions: Map<string, SessionSummary>;
  connectionStates: Map<string, PeerConnectionState>;
  connectedTargets: PeerConnectionState[];
};
```

Rules:

- `onlinePeers` comes from snapshots
- `sessions` comes from snapshot plus runtime updates
- `connectedTargets` is derived from connection state, not directly from `onlinePeers`

## Runtime Event Handling Requirements

### On `session-created`

- allocate connection state for this `sessionId`
- mark status as `connecting`
- start WebRTC negotiation automatically

### On `signal`

- continue WebRTC offer/answer/ICE handling

### On `peer-state`

- update peer-visible status in the device list

### On local `RTCPeerConnection.connectionState`

- map browser state into backend session state:
  - `connecting` -> `connecting`
  - `connected` -> `connected`
  - `failed` -> `failed`
  - `disconnected` or `closed` -> `closed`

### On `directory-snapshot`

- refresh online lists
- do not discard active local peer connection state unless the session is actually gone

## Acceptance Criteria

The implementation is correct only if all of the following are true:

1. Two devices on the same LAN with `discoverable = true` automatically establish a session without clicking the connect button.
2. Two devices on the same account automatically establish a session without clicking the connect button.
3. After WebRTC connects, the file sender no longer shows `未链接设备`.
4. The file sender can directly target an automatically connected device.
5. If the connection drops, the file sender removes that device from valid targets.
6. The UI clearly distinguishes:
   - online
   - connecting
   - connected
   - failed

## Logging Requirement For Debug Builds

To make future debugging easier, add debug logs for:

- sending `hello`
- receiving `welcome`
- receiving `session-created`
- sending and receiving `signal`
- browser `RTCPeerConnection.connectionState`
- sending `session-state`
- changes to `connectedTargets`

These logs may be development-only, but they must exist while this feature is being stabilized.

## Non-Goals

This requirement does not ask the frontend to:

- implement TURN deployment
- store files on the server
- add remote desktop
- add a new account system

It only covers correct frontend handling of the backend behavior that already exists.
