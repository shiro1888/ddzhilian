# Local Network Mode Requirement

This document defines a LocalSend-inspired LAN mode for ddzhilian.

## Goal

Build a local-network-first transfer mode that feels like LocalSend:

- nearby devices auto-discover each other on the same LAN
- users can send files without relying on a remote signaling server
- transfer stays inside the local network whenever possible
- local mode is prioritized over the remote WebRTC mode

## Reference Model

The target experience is inspired by LocalSend and its public protocol design:

- UDP multicast discovery
- local HTTP or HTTPS transfer
- no mandatory external server
- one device can expose a local transfer server
- browser-style reverse download can exist as a fallback

## Important Constraint

We cannot blindly copy the LocalSend protocol into a browser-only web app.

A browser page normally cannot:

- bind a UDP multicast socket
- listen on a raw local TCP port
- accept arbitrary inbound LAN HTTP traffic
- expose a stable local HTTPS service with a custom certificate

Therefore:

- a true LocalSend-style LAN mode requires a native runtime, local helper, or installed app shell
- a pure browser tab can only implement a limited fallback mode

## Required Product Decision

ddzhilian must support two transport families:

### 1. LAN Native Mode

Used when the client has a native runtime or local helper available.

Characteristics:

- LAN discovery via UDP multicast
- file transfer via local HTTP or HTTPS server
- no dependency on remote signaling
- lowest latency and best LAN reliability

### 2. Remote Or Browser Mode

Used when the client is only a browser page or when native LAN features are unavailable.

Characteristics:

- discovery through the existing remote backend
- transport through WebRTC plus TURN
- works across networks, but is not LocalSend-style LAN-native

## Required Architecture

### Native LAN Service

At least one endpoint on the LAN must run a local transfer service.

Recommended default:

- protocol: `https`
- TCP port: `53317`
- UDP multicast port: `53317`
- multicast address: `224.0.0.167`

This mirrors the LocalSend defaults closely enough for product familiarity.

## Required Discovery Flow

### Primary Discovery

Use UDP multicast announcement on the LAN.

Announce a device summary containing:

- alias
- device type
- protocol version
- local port
- protocol (`https` preferred)
- fingerprint
- whether download fallback is supported

### Discovery Response

After receiving an announcement:

- reply with local device information
- register the peer in the nearby-device list
- suppress self-discovery by fingerprint comparison

### Secondary Discovery

If multicast is unavailable:

- support a local IP sweep mode
- allow manual local IP entry
- optionally use mDNS or Bonjour where available

## Required Security Model

Do not copy LocalSend's weakest trust assumptions directly.

Minimum security requirements:

- every device must have a stable fingerprint
- in HTTPS mode, use the SHA-256 fingerprint of the local certificate
- first-time LAN trust should require explicit user confirmation or PIN
- remembered trusted devices can skip repeated confirmation

### Required Anti-MITM Rule

Discovery is not trust.

A device found over multicast must not automatically be treated as a trusted recipient for sensitive transfers without:

- trust-on-first-use confirmation
- or PIN-based confirmation
- or an already remembered fingerprint

## Required Transfer API Shape

The LAN mode should use a local HTTP or HTTPS transfer API inspired by LocalSend.

### Preparation Endpoint

Receiver exposes a metadata-only request first.

Example shape:

```http
POST /api/lan/v1/prepare-upload
```

Request body:

- sender info
- file metadata
- optional session metadata
- optional PIN

Response body:

- session ID
- per-file token map
- acceptance state

### Upload Endpoint

Binary upload happens only after successful preparation.

Example shape:

```http
POST /api/lan/v1/upload?sessionId=...&fileId=...&token=...
```

### Cancel Endpoint

Example shape:

```http
POST /api/lan/v1/cancel?sessionId=...
```

### Optional Info Endpoint

Example shape:

```http
GET /api/lan/v1/info
```

Used for:

- device capabilities
- version
- fingerprint
- transfer mode support

## Required Browser Fallback

Because browser tabs cannot behave like a full LAN daemon, a browser fallback is required.

### Browser Fallback Rules

- browser clients may discover devices through the remote ddzhilian backend
- browser clients may receive a local download URL from a native device
- browser clients may open a download page and fetch files from a LAN-native sender

This is similar in spirit to LocalSend's reverse download mode.

### Browser Limitation Disclosure

The UI must clearly explain when the browser is in fallback mode:

- `当前浏览器不支持原生局域网发现`
- `已切换到兼容模式`

## Required Client Capabilities Matrix

### Desktop Or Mobile App

Must support:

- multicast discovery
- local HTTPS service
- fingerprint generation
- local upload receiver
- local sender

### Browser Tab

May support:

- remote device listing
- receiving a browser-safe local download link
- remote WebRTC mode

Browser-only mode must not claim full LocalSend equivalence.

## Required UI Behavior

The product should expose transport mode explicitly.

### Device Discovery UI

Each nearby device should display:

- device name
- platform
- discovery source:
  - `局域网`
  - `远程`
- trust status:
  - `未验证`
  - `已信任`

### Mode Badge

The active session should show one of:

- `局域网直传`
- `远程直连`
- `TURN 中继`

### Preferred Routing Rule

If a peer is available through native LAN mode:

- choose LAN native mode first
- only fall back to remote mode if LAN setup fails or is unsupported

## Required Trust UX

For first-time LAN transfers:

- show the peer name
- show a short fingerprint preview
- allow accept or reject
- optionally require entering a short PIN

After trust is established:

- allow direct send
- remember the fingerprint

## Required Progress And Delivery UX

Local mode must still use the transfer progress rules already defined in:

- `FRONTEND_REQUIREMENT_TRANSFER_PROGRESS.md`

Users must be able to tell:

- discovery succeeded
- trust succeeded
- local receiver accepted metadata
- file upload started
- transfer completed

## Required Failure States

The UI must distinguish:

- multicast unavailable
- no local receiver found
- certificate mismatch
- PIN rejected
- upload rejected by receiver
- local network unreachable

## Required Configurability

The app or helper should allow:

- multicast on or off
- local transfer port override
- protocol preference (`https` preferred)
- trusted-device memory reset
- PIN requirement toggle

## Acceptance Criteria

The LocalSend-style LAN mode is complete only if all of the following are true:

1. Two native-capable devices on the same LAN can discover each other without the remote backend.
2. A file can be transferred locally over HTTP or HTTPS after a metadata preparation step.
3. The user can see whether the session is LAN-native or remote.
4. Browser-only clients are clearly marked as fallback mode.
5. First-time LAN trust is not silent; it requires explicit validation or PIN.
6. Remembered trusted devices can send again with reduced friction.

## Implementation Guidance

To make this practical for ddzhilian, the recommended rollout order is:

1. Define LAN mode protocol and trust model
2. Build a local helper or native app transport service
3. Add LAN transport detection to the frontend
4. Add nearby discovery UI and trust prompts
5. Prefer LAN-native transfers over remote mode
6. Keep remote WebRTC plus TURN as fallback

## Non-Goals

This requirement does not ask for:

- replacing the existing remote mode
- dropping WebRTC or TURN support
- browser-only multicast support
- full LocalSend protocol compatibility

The goal is a ddzhilian LAN mode inspired by LocalSend, not a byte-for-byte clone.
