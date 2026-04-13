# Backend Implementation Plan: Local Network Mode

This document describes the backend functionality required to implement a LocalSend-inspired local network mode for CCConnect.

It is intentionally focused on backend and protocol behavior, not UI.

## Purpose

CCConnect currently supports:

- remote device discovery through the deployed signaling backend
- WebRTC signaling
- TURN-assisted cross-network transport

To achieve a stronger local-network experience, we need a second transport lane that prioritizes:

- LAN discovery without the remote backend
- direct file transfer inside the same local network
- a trust model suitable for nearby-device communication

## Product Outcome

After this work is complete, CCConnect should support two transport families:

### 1. Remote Mode

Used when:

- devices are on different networks
- the client only has browser capabilities
- local LAN features are unavailable

Transport:

- existing cloud signaling backend
- WebRTC
- TURN fallback

### 2. Local Network Mode

Used when:

- both devices are on the same LAN
- both devices have native LAN capability

Transport:

- multicast discovery
- local HTTP or HTTPS receiver
- direct LAN upload

## Important Constraint

A browser-only tab cannot provide full LocalSend-style LAN behavior.

A pure browser page cannot reliably:

- open UDP multicast sockets
- bind a local TCP or HTTPS listener
- receive arbitrary inbound LAN upload requests

Therefore, local network mode requires a local backend process on the device.

Acceptable forms:

- desktop native app
- mobile native app
- local helper daemon
- installed shell app that can host sockets

## Required Backend Components

The complete system should have three backend layers.

### A. Cloud Signaling Backend

This is the existing remote server that already supports:

- device registration
- peer snapshots
- session creation
- WebRTC signaling
- remote fallback

It remains in place.

### B. Local LAN Service

This is a new per-device local service that runs on the local network capable client.

Responsibilities:

- UDP multicast discovery
- local device registration and announcement
- HTTPS server for transfer endpoints
- local trust and PIN validation
- file upload receiving
- optional download fallback for browser receivers

### C. Local Capability Bridge

This is the integration boundary between frontend and the local LAN service.

Responsibilities:

- expose whether LAN-native mode is available
- expose nearby LAN device list
- expose trust status
- start upload sessions
- stream progress to the frontend

This bridge can be implemented as:

- native IPC
- localhost bridge API
- desktop app internal service layer

## Required Default LAN Configuration

Recommended defaults:

- discovery protocol: `UDP multicast`
- multicast address: `224.0.0.167`
- multicast port: `53317`
- transfer protocol: `HTTPS`
- transfer port: `53317`

These defaults mirror the LocalSend reference model closely enough for expected LAN behavior.

## Required Component Responsibilities

## 1. Cloud Signaling Backend

The cloud backend must remain the fallback layer.

### Must Continue To Support

- remote peer snapshots
- account-based auto-link
- TURN-backed WebRTC
- browser-only compatibility mode

### Must Be Extended With

- client capability declaration
- local mode awareness
- optional local endpoint metadata pass-through

### New Capability Fields

When a client registers remotely, it should be able to declare:

```ts
type NativeLanCapability = {
  lanNativeEnabled: boolean;
  lanDiscoveryEnabled: boolean;
  lanTransferEnabled: boolean;
  localProtocol?: 'http' | 'https';
  localPort?: number;
  localFingerprint?: string;
  localDownloadFallback?: boolean;
};
```

These fields allow the system to understand whether a client can participate in LAN-native transfers.

### New Cloud Backend Behavior

The cloud backend must not perform LAN-native transfer itself.

Instead it should:

- preserve the existing remote mode
- expose a peer's advertised LAN-native capability when relevant
- allow the frontend to prefer LAN mode when both peers support it

## 2. Local LAN Service

This is the new primary backend for local mode.

### Required Functions

- announce device presence on the LAN
- respond to LAN announcements
- expose a local HTTPS API
- validate peer trust
- accept metadata-only transfer preparation
- receive binary file upload
- cancel transfers
- expose local device info

## Required Discovery Behavior

### Multicast Announcement

On startup and at regular intervals, the local service should broadcast:

```json
{
  "alias": "Alice MacBook",
  "version": "1.0",
  "deviceModel": "MacBookPro",
  "deviceType": "desktop",
  "fingerprint": "sha256-cert-or-device-id",
  "port": 53317,
  "protocol": "https",
  "download": true,
  "announce": true
}
```

### Multicast Response

Other LAN services should answer with their own device info.

Response may be sent by:

- direct HTTP registration call
- multicast response fallback

### Self-Discovery Suppression

The local service must suppress self-discovery using:

- fingerprint comparison
- local interface address comparison where possible

### Legacy LAN Fallback

If multicast is unavailable:

- support local subnet scan mode
- send a registration request to candidate local IPs
- throttle scans to avoid excessive traffic

## Required Local Transfer API

The local LAN service should expose a versioned transfer API.

Recommended namespace:

```text
/api/lan/v1/*
```

## Endpoint 1: Device Info

```http
GET /api/lan/v1/info
```

Response:

```json
{
  "alias": "Alice MacBook",
  "deviceType": "desktop",
  "deviceModel": "MacBookPro",
  "version": "1.0",
  "protocol": "https",
  "port": 53317,
  "fingerprint": "sha256...",
  "download": true
}
```

Purpose:

- peer info lookup
- trust verification
- capability discovery

## Endpoint 2: Register Nearby Device

```http
POST /api/lan/v1/register
```

Request:

```json
{
  "alias": "Bob Phone",
  "deviceType": "mobile",
  "deviceModel": "Android",
  "version": "1.0",
  "protocol": "https",
  "port": 53317,
  "fingerprint": "sha256..."
}
```

Response:

```json
{
  "accepted": true,
  "alias": "Alice MacBook",
  "fingerprint": "sha256..."
}
```

Purpose:

- peer registration
- early trust gating
- nearby list construction

## Endpoint 3: Prepare Upload

```http
POST /api/lan/v1/prepare-upload
```

Request:

```json
{
  "sender": {
    "alias": "Alice MacBook",
    "deviceType": "desktop",
    "fingerprint": "sha256..."
  },
  "session": {
    "requestId": "req_xxx",
    "pin": "123456"
  },
  "files": {
    "file-1": {
      "id": "file-1",
      "fileName": "photo.webp",
      "size": 167936,
      "fileType": "image/webp",
      "sha256": "optional",
      "preview": "optional"
    }
  }
}
```

Success response:

```json
{
  "sessionId": "lan_sess_xxx",
  "files": {
    "file-1": "token-file-1"
  }
}
```

Error behavior:

- `401`: PIN required or invalid
- `403`: rejected
- `409`: receiver busy
- `429`: rate limited
- `500`: unexpected receiver error

Purpose:

- validate trust
- validate PIN
- reserve receiver session state
- return per-file upload tokens

## Endpoint 4: Upload File

```http
POST /api/lan/v1/upload?sessionId=...&fileId=...&token=...
```

Request body:

- raw binary data

Server requirements:

- validate `sessionId`
- validate file-specific token
- validate sender fingerprint or source IP if needed
- stream file directly to receiver-side staging
- emit receiver progress events

Response:

- `204` or `200`

## Endpoint 5: Cancel Transfer

```http
POST /api/lan/v1/cancel?sessionId=...
```

Purpose:

- release reserved receiver state
- clean temporary files
- notify receiver UI

## Endpoint 6: Download Fallback

This is optional but strongly recommended for browser compatibility.

### Prepare Download

```http
POST /api/lan/v1/prepare-download
```

### Download File

```http
GET /api/lan/v1/download?sessionId=...&fileId=...&token=...
```

Purpose:

- allow a browser tab to receive from a LAN-native sender
- support reverse pull mode when receiver cannot host a local service

## Required Local Trust Model

Local discovery is not enough to trust a device.

### Required Trust Inputs

- device fingerprint
- optional short PIN
- first-seen approval

### Required Trust Store

The LAN service must maintain a local trust store:

```ts
type TrustedLanPeer = {
  fingerprint: string;
  alias: string;
  firstSeenAt: string;
  lastSeenAt: string;
  manuallyApproved: boolean;
  pinRequired: boolean;
};
```

### Required Trust Rules

- unknown peers require confirmation or PIN
- known peers may be auto-accepted if allowed by local policy
- fingerprint mismatch must break trust immediately

## Required Local Session Model

The LAN service should manage active transfer sessions separately from remote sessions.

```ts
type LanTransferSession = {
  sessionId: string;
  senderFingerprint: string;
  receiverFingerprint: string;
  state: 'prepared' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  files: Record<string, {
    fileId: string;
    token: string;
    fileName: string;
    size: number;
    receivedBytes: number;
    status: 'pending' | 'uploading' | 'completed' | 'failed';
  }>;
  createdAt: string;
  updatedAt: string;
};
```

## Required Local Service Events

The frontend bridge must receive live events from the LAN service.

Required event types:

- nearby device discovered
- nearby device updated
- trust required
- trust accepted
- upload prepared
- upload progress
- upload completed
- upload failed
- upload cancelled

## Required Progress Reporting

LAN mode must drive the same frontend progress model as remote mode.

The LAN service must emit:

- file metadata accepted
- bytes received
- completion acknowledged
- failure reason

This ensures the frontend can use the same progress bar model for both LAN and remote transfers.

## Required Backend Selection Logic

The runtime must choose transport mode using this order:

1. If both peers support LAN-native mode and are discoverable locally:
   - use LAN native mode
2. Otherwise, if both peers support remote mode:
   - use current cloud signaling plus WebRTC
3. Otherwise, if browser-safe download fallback exists:
   - use reverse download mode
4. Otherwise:
   - report unsupported path

## Required Storage Rules

### Cloud Backend

Must not store file contents.

### Local LAN Service

May use temporary staging on disk while receiving a file.

Requirements:

- store temporary files only as needed for receive completion
- delete cancelled or failed partial files
- clean up completed staging after handoff to the receiving app

## Required Security Rules

- default to HTTPS for LAN service
- fingerprint must be derived from certificate identity in HTTPS mode
- reject unknown sender tokens
- reject mismatched session ownership
- rate limit repeated prepare requests
- allow local policy to require PIN for every transfer

## Required Operational Logging

The LAN service must log:

- startup configuration
- multicast join success or failure
- peer discovery
- trust prompts
- prepare-upload requests
- upload start and completion
- failure reasons

The cloud backend should log:

- whether a device declared LAN-native capability
- whether a transfer fell back to remote mode

## Required Rollout Order

### Phase 1

- define local LAN service
- implement discovery
- implement trust store
- implement `prepare-upload`, `upload`, `cancel`

### Phase 2

- frontend bridge integration
- nearby devices list from local backend
- local upload progress events

### Phase 3

- browser reverse download fallback
- remote/local automatic routing
- remembered trust UX

## Acceptance Criteria

The backend work is complete only if all of the following are true:

1. Two native-capable devices on the same LAN can discover each other through multicast without the cloud backend.
2. A receiver can expose a local HTTPS API and accept a prepared upload session.
3. A sender can upload file bytes directly across the LAN using file-specific tokens.
4. The local backend can emit progress updates while bytes are being received.
5. Trust is based on fingerprint and optional PIN, not on discovery alone.
6. The existing cloud backend remains available as remote fallback.
7. Cloud backend still does not store file contents.

## Non-Goals

This backend plan does not require:

- exact wire-level compatibility with LocalSend
- replacing the current remote backend
- browser-only multicast support
- storage of transferred files on the cloud server

The goal is to add a strong LAN-native transfer backend while preserving the current remote path.
