# Frontend Requirement: Transfer Progress And Delivery Feedback

This document describes the frontend requirements for adding a visible transfer progress system so users are not misled into thinking a file was not sent.

## Problem

The current UI can enter a confusing state where:

- a file has already been selected
- a target device may already exist or may still be connecting
- but the user sees no clear transfer progress

As a result, users cannot tell whether the app is:

- waiting for a connection
- negotiating WebRTC
- actively sending file chunks
- stuck
- failed
- completed

## Product Goal

Whenever a user sends a file, the UI must clearly communicate:

1. whether a target device is connected
2. whether transfer has started
3. how much has already been sent
4. whether the transfer finished successfully
5. whether the transfer failed and can be retried

## Required UX Principle

The UI must never imply "sending" before chunk transmission has actually begun.

In other words:

- connection negotiation is not file transfer
- selecting a file is not file transfer
- only real chunk transmission counts as transfer progress

## Required States

Each transfer item must have one of these states:

- `queued`
- `waiting_for_target`
- `connecting`
- `ready`
- `transferring`
- `completed`
- `failed`
- `cancelled`

### State Meaning

#### `queued`

The file has been selected by the user but no transfer work has started yet.

#### `waiting_for_target`

There is no valid connected target device yet.

#### `connecting`

A session exists, but the peer connection or data channel is not ready yet.

#### `ready`

The data channel is ready and the file is about to start sending.

#### `transferring`

Chunks are actively being sent.

#### `completed`

All chunks were sent and the receiver acknowledged completion.

#### `failed`

Transfer stopped due to connection failure, channel closure, timeout, or protocol error.

#### `cancelled`

The user manually cancelled the transfer.

## Required UI Elements

Each transfer row or card must display:

- file name
- file size
- target device name
- status text
- percentage text
- visual progress bar

Optional but strongly recommended:

- transferred bytes / total bytes
- transfer speed
- estimated remaining time
- retry button on failure
- cancel button while in progress

## Required Status Text

Use user-friendly text that distinguishes connection from transfer.

Recommended mapping:

- `queued` -> `等待开始`
- `waiting_for_target` -> `等待已连接设备`
- `connecting` -> `正在建立连接`
- `ready` -> `准备发送`
- `transferring` -> `正在发送`
- `completed` -> `发送成功`
- `failed` -> `发送失败`
- `cancelled` -> `已取消`

## Required Progress Rules

### 1. Before Chunk Sending Starts

When state is:

- `queued`
- `waiting_for_target`
- `connecting`
- `ready`

the progress bar must remain at `0%`.

Do not fake progress during WebRTC negotiation.

### 2. During Real Transfer

When file chunks start being written to the data channel:

- switch state to `transferring`
- increase progress based on confirmed chunk send progress

Recommended formula:

```ts
progress = sentBytes / totalBytes
```

### 3. On Completion

The UI must only show `100%` and `发送成功` when:

- all chunks are sent
- and the receiver has acknowledged completion

Do not mark success solely because the sender finished queueing bytes locally.

### 4. On Failure

If the peer connection drops or the data channel closes before completion:

- state becomes `failed`
- keep the last known progress value visible
- show a retry action

## Required Data Model

Recommended transfer state:

```ts
type TransferStatus =
  | 'queued'
  | 'waiting_for_target'
  | 'connecting'
  | 'ready'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'cancelled';

type TransferItem = {
  id: string;
  fileName: string;
  fileSize: number;
  targetDeviceId?: string;
  targetDeviceName?: string;
  sessionId?: string;
  status: TransferStatus;
  progress: number;
  sentBytes: number;
  acknowledgedBytes: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
};
```

Rules:

- `progress` is `0..1`
- `sentBytes` tracks sender-side chunk progress
- `acknowledgedBytes` tracks receiver-confirmed progress if your protocol supports it

## Required Protocol Behavior

The frontend should not treat DataChannel availability as a complete transfer signal.

The sending side should:

1. send file metadata
2. send file chunks
3. send a `file-complete` message

The receiving side should:

1. receive metadata
2. receive chunks
3. assemble the file
4. send back a completion acknowledgment

Recommended acknowledgement message:

```ts
type DataMessage =
  | { type: 'file-meta'; id: string; name: string; size: number; mimeType?: string; chunkSize: number }
  | { type: 'file-chunk'; id: string; index: number; total: number; data: ArrayBuffer }
  | { type: 'file-complete'; id: string }
  | { type: 'file-ack'; id: string; receivedBytes: number; completed: boolean };
```

## Required Sender Logic

### On File Selection

- create a `TransferItem`
- if no connected target exists:
  - state = `waiting_for_target`
- if a target exists but data channel is not open:
  - state = `connecting`
- if data channel is already open:
  - state = `ready`

### On Data Channel Open

- move waiting items for that target from `connecting` to `ready`
- start transfer immediately if auto-send is intended

### On Chunk Sent

- increase `sentBytes`
- update `progress`
- keep state = `transferring`

### On Receiver Ack

- update `acknowledgedBytes`
- if `completed = true`, set:
  - state = `completed`
  - progress = `1`

### On Error

Set:

- state = `failed`
- preserve current `progress`
- store `errorMessage`

## Required Receiver Logic

The receiver should expose its own transfer feedback too.

Minimum requirements:

- show incoming file name
- show receiving progress
- show completion or failure state

The sender should not be the only side with progress visibility.

## Required Empty-State Behavior

If the user chooses a file but there is no connected target:

- keep the transfer visible in the queue
- state = `waiting_for_target`
- show text such as:
  - `等待已连接设备后开始发送`

Do not silently fail.

## Required Retry Behavior

When a transfer fails:

- keep the failed row visible
- show `发送失败`
- allow retry

Retry should:

- reuse the same target if still connected
- otherwise move back to `waiting_for_target`

## Acceptance Criteria

The feature is complete only if all of the following are true:

1. Selecting a file always creates a visible transfer item.
2. The UI distinguishes "waiting for connection" from "actively sending".
3. Progress remains `0%` until actual chunk transmission begins.
4. Progress increases continuously during transfer.
5. The sender shows `发送成功` only after receiver acknowledgement.
6. Failures remain visible and are not mistaken for success.
7. The user can tell exactly why a file is not moving:
   - no target
   - connecting
   - transferring
   - failed

## Logging Requirement For Debug Builds

For easier debugging, development builds must log:

- transfer item creation
- selected target device
- state transitions
- bytes sent
- file completion sent
- receiver acknowledgement received
- failure reason

## Non-Goals

This requirement does not include:

- resumable upload after page reload
- server-side storage
- history sync across devices
- background transfer while browser is closed

It only covers clear progress and delivery feedback in the current peer-to-peer model.
