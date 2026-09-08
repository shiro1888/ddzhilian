export type PairReason =
  | 'manual'
  | 'short-code'
  | 'pair-link'
  | 'account-auto'
  | 'lan-discovery'
  | 'bot-chat';

export type SessionState = 'connecting' | 'connected' | 'failed' | 'closed';

export type TransportMode = 'lan-webrtc' | 'remote-webrtc';

const deviceAvatarDataUrlPattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function normalizeDeviceAvatarDataUrl(value: string | undefined) {
  const normalizedValue = value?.trim() ?? '';
  if (
    !normalizedValue ||
    !deviceAvatarDataUrlPattern.test(normalizedValue)
  ) {
    return undefined;
  }

  return normalizedValue;
}

export interface NativeLanCapabilityPayload {
  lanNativeEnabled: boolean;
  lanDiscoveryEnabled: boolean;
  lanTransferEnabled: boolean;
  localProtocol?: 'http' | 'https';
  localPort?: number;
  localFingerprint?: string;
  localDownloadFallback?: boolean;
}

export type SignalEnvelope =
  | {
      kind: 'offer' | 'answer';
      description: {
        sdp: string;
        type: 'offer' | 'answer';
      };
    }
  | {
      kind: 'ice-candidate';
      candidate: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      };
    };

export interface DeviceHelloPayload {
  deviceId?: string;
  /** Proof of possession for `deviceId`; issued by the server on first hello. */
  deviceSecret?: string;
  deviceName?: string;
  avatarDataUrl?: string;
  platform?: string;
  accountId?: string;
  autoConnect?: boolean;
  discoverable?: boolean;
  allowShortCode?: boolean;
  requestedPairToken?: string | null;
  nativeLan?: NativeLanCapabilityPayload;
}

export interface DeviceSettingsPayload {
  deviceName?: string;
  avatarDataUrl?: string;
  platform?: string;
  accountId?: string;
  autoConnect?: boolean;
  discoverable?: boolean;
  allowShortCode?: boolean;
  nativeLan?: NativeLanCapabilityPayload;
}

export interface PeerSummary {
  deviceId: string;
  deviceName: string;
  avatarDataUrl?: string;
  platform: string;
  shortCode: string;
  online: boolean;
  preferredTransport: TransportMode;
  relation: {
    sameAccount: boolean;
    sameLan: boolean;
    autoConnectEligible: boolean;
    discoverable: boolean;
  };
  nativeLan?: NativeLanCapabilityPayload;
  lastSeenAt: string;
}

export interface RoomMemberSummary {
  deviceId: string;
  deviceName: string;
  avatarDataUrl?: string;
  platform: string;
  online: boolean;
}

export interface RoomSummary {
  roomId: string;
  members: RoomMemberSummary[];
  isPublic: boolean;
  publicIndex?: number;
  reason: PairReason;
  historyTextCount: number;
  historyTextLatestAt?: string;
  historyTextPreview?: string;
  historyTextLatestSourceDeviceId?: string;
  updatedAt: string;
}

export interface RoomStateSummary {
  roomId: string;
  pinned: boolean;
  lastReadAt?: string;
}

export interface DevicePreferencesPayload {
  enterToSend: boolean;
  soundEffects: boolean;
}

export interface HistoryFileSummary {
  historyId: string;
  roomId: string;
  sessionId?: string;
  isPublic: boolean;
  sourceDeviceId: string;
  sourceDeviceName: string;
  fileName: string;
  size: number;
  mimeType?: string;
  createdAt: string;
  downloadPath: string;
}

export interface HistoryTextSummary {
  historyId: string;
  roomId: string;
  sessionId?: string;
  isPublic: boolean;
  sourceDeviceId: string;
  sourceDeviceName: string;
  text: string;
  createdAt: string;
}

export interface SessionSummary {
  sessionId: string;
  roomId: string;
  peerId: string;
  state: SessionState;
  reason: PairReason;
  transportMode: TransportMode;
  initiator: boolean;
  updatedAt: string;
}

export interface DirectorySnapshotPayload {
  self: {
    deviceId: string;
    deviceName: string;
    avatarDataUrl?: string;
    shortCode: string;
    pairToken: string;
    historyAuthToken: string;
    deviceSecret: string;
    accountId?: string;
    autoConnect: boolean;
    discoverable: boolean;
    allowShortCode: boolean;
    platform: string;
    nativeLan?: NativeLanCapabilityPayload;
    preferences: DevicePreferencesPayload;
  };
  peers: PeerSummary[];
  lanPeers: PeerSummary[];
  accountPeers: PeerSummary[];
  rooms: RoomSummary[];
  roomStates: RoomStateSummary[];
  historyFiles: HistoryFileSummary[];
  historyTexts: HistoryTextSummary[];
  sessions: SessionSummary[];
  rtcConfig: {
    iceServers: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }>;
  };
  publicWsUrl: string;
  serverTime: string;
}

export type ClientEvent =
  | {
      type: 'hello';
      payload: DeviceHelloPayload;
    }
  | {
      type: 'update-settings';
      payload: DeviceSettingsPayload;
    }
  | {
      type: 'update-room-state';
      payload: { roomId: string; pinned?: boolean; lastReadAt?: string };
    }
  | {
      type: 'update-preferences';
      payload: Partial<DevicePreferencesPayload>;
    }
  | {
      type: 'pair-by-short-code';
      payload: { shortCode: string };
    }
  | {
      type: 'pair-by-token';
      payload: { pairToken: string };
    }
  | {
      type: 'join-room';
      payload: { roomId: string };
    }
  | {
      type: 'create-public-room';
      payload?: undefined;
    }
  | {
      type: 'create-bot-room';
      payload?: undefined;
    }
  | {
      type: 'request-connect';
      payload: { targetDeviceId: string; reason?: PairReason; createNewRoom?: boolean };
    }
  | {
      type: 'signal';
      payload: {
        sessionId: string;
        targetDeviceId: string;
        signal: SignalEnvelope;
      };
    }
  | {
      type: 'session-state';
      payload: {
        sessionId: string;
        targetDeviceId: string;
        state: SessionState;
      };
    }
  | {
      type: 'request-snapshot';
      payload?: undefined;
    };

export type ServerEvent =
  | {
      type: 'welcome';
      payload: DirectorySnapshotPayload;
    }
  | {
      type: 'directory-snapshot';
      payload: DirectorySnapshotPayload;
    }
  | {
      type: 'history-recalled';
      payload: {
        kind: 'text' | 'file';
        historyId: string;
        roomId: string;
        recalledAt: string;
      };
    }
  | {
      type: 'session-created';
      payload: {
        sessionId: string;
        roomId: string;
        peer: PeerSummary;
        reason: PairReason;
        transportMode: TransportMode;
        initiator: boolean;
      };
    }
  | {
      type: 'signal';
      payload: {
        sessionId: string;
        fromDeviceId: string;
        signal: SignalEnvelope;
      };
    }
  | {
      type: 'peer-state';
      payload: {
        sessionId: string;
        peerId: string;
        state: SessionState;
      };
    }
  | {
      type: 'public-room-created';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'private-room-created';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'error';
      payload: {
        code:
          | 'BAD_EVENT'
          | 'DEVICE_NOT_READY'
          | 'DEVICE_NOT_FOUND'
          | 'ROOM_NOT_FOUND'
          | 'SHORT_CODE_BLOCKED'
          | 'PAIR_TOKEN_NOT_FOUND'
          | 'SESSION_NOT_FOUND'
          | 'SESSION_FORBIDDEN';
        message: string;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringField(payload: Record<string, unknown>, field: string) {
  return typeof payload[field] === 'string';
}

function hasOptionalStringField(payload: Record<string, unknown>, field: string) {
  return payload[field] === undefined || typeof payload[field] === 'string';
}

function hasOptionalBooleanField(payload: Record<string, unknown>, field: string) {
  return payload[field] === undefined || typeof payload[field] === 'boolean';
}

function hasOptionalAvatarDataUrlField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  return (
    value === undefined ||
    (typeof value === 'string' && (value.trim() === '' || normalizeDeviceAvatarDataUrl(value) !== undefined))
  );
}

function isNativeLanCapabilityPayload(value: unknown) {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.lanNativeEnabled === 'boolean' &&
    typeof value.lanDiscoveryEnabled === 'boolean' &&
    typeof value.lanTransferEnabled === 'boolean' &&
    (value.localProtocol === undefined || value.localProtocol === 'http' || value.localProtocol === 'https') &&
    (value.localPort === undefined ||
      (Number.isInteger(value.localPort) && Number(value.localPort) >= 1 && Number(value.localPort) <= 65_535)) &&
    hasOptionalStringField(value, 'localFingerprint') &&
    hasOptionalBooleanField(value, 'localDownloadFallback')
  );
}

function isDeviceSettingsPayload(payload: Record<string, unknown>) {
  return (
    hasOptionalStringField(payload, 'deviceName') &&
    hasOptionalAvatarDataUrlField(payload, 'avatarDataUrl') &&
    hasOptionalStringField(payload, 'platform') &&
    hasOptionalStringField(payload, 'accountId') &&
    hasOptionalBooleanField(payload, 'autoConnect') &&
    hasOptionalBooleanField(payload, 'discoverable') &&
    hasOptionalBooleanField(payload, 'allowShortCode') &&
    isNativeLanCapabilityPayload(payload.nativeLan)
  );
}

function isDeviceHelloPayload(payload: Record<string, unknown>) {
  return (
    isDeviceSettingsPayload(payload) &&
    hasOptionalStringField(payload, 'deviceId') &&
    hasOptionalStringField(payload, 'deviceSecret') &&
    (payload.requestedPairToken === undefined ||
      payload.requestedPairToken === null ||
      typeof payload.requestedPairToken === 'string')
  );
}

/**
 * Every entry maps a client event type to a predicate over its payload. Events
 * whose payload is optional map to `null`. The dispatcher in index.ts reads
 * payload fields without further guards, so anything not listed here — or with
 * a payload that fails its predicate — must be rejected before dispatch.
 */
const clientEventPayloadGuards: Record<
  ClientEvent['type'],
  ((payload: Record<string, unknown>) => boolean) | null
> = {
  hello: isDeviceHelloPayload,
  'update-settings': isDeviceSettingsPayload,
  'update-preferences': (payload) =>
    hasOptionalBooleanField(payload, 'enterToSend') &&
    hasOptionalBooleanField(payload, 'soundEffects'),
  'update-room-state': (payload) =>
    hasStringField(payload, 'roomId') &&
    hasOptionalBooleanField(payload, 'pinned') &&
    hasOptionalStringField(payload, 'lastReadAt'),
  'pair-by-short-code': (payload) => hasStringField(payload, 'shortCode'),
  'pair-by-token': (payload) => hasStringField(payload, 'pairToken'),
  'join-room': (payload) => hasStringField(payload, 'roomId'),
  'request-connect': (payload) => hasStringField(payload, 'targetDeviceId'),
  signal: (payload) =>
    hasStringField(payload, 'sessionId') &&
    hasStringField(payload, 'targetDeviceId') &&
    isRecord(payload.signal) &&
    hasStringField(payload.signal, 'kind'),
  'session-state': (payload) =>
    hasStringField(payload, 'sessionId') &&
    hasStringField(payload, 'targetDeviceId') &&
    hasStringField(payload, 'state'),
  'create-public-room': null,
  'create-bot-room': null,
  'request-snapshot': null,
};

export function parseClientEvent(raw: string): ClientEvent | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed) || typeof parsed.type !== 'string') {
      return null;
    }

    if (!Object.prototype.hasOwnProperty.call(clientEventPayloadGuards, parsed.type)) {
      return null;
    }

    const guard = clientEventPayloadGuards[parsed.type as ClientEvent['type']];

    if (guard) {
      if (!isRecord(parsed.payload) || !guard(parsed.payload)) {
        return null;
      }
    }

    return parsed as ClientEvent;
  } catch {
    return null;
  }
}
