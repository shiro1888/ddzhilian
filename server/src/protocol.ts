export type PairReason =
  | 'manual'
  | 'short-code'
  | 'pair-link'
  | 'account-auto'
  | 'lan-discovery';

export type SessionState = 'connecting' | 'connected' | 'failed' | 'closed';

export type TransportMode = 'lan-webrtc' | 'remote-webrtc';

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
  deviceName?: string;
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
  platform: string;
  shortCode: string;
  pairToken: string;
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
  platform: string;
  online: boolean;
}

export interface RoomSummary {
  roomId: string;
  members: RoomMemberSummary[];
  isPublic: boolean;
  updatedAt: string;
}

export interface RoomStateSummary {
  roomId: string;
  pinned: boolean;
  lastReadAt?: string;
}

export interface DevicePreferencesPayload {
  enterToSend: boolean;
}

export interface HistoryFileSummary {
  historyId: string;
  roomId: string;
  sessionId?: string;
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
    shortCode: string;
    pairToken: string;
    historyAuthToken: string;
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
  return typeof value === 'object' && value !== null;
}

export function parseClientEvent(raw: string): ClientEvent | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed) || typeof parsed.type !== 'string') {
      return null;
    }

    return parsed as ClientEvent;
  } catch {
    return null;
  }
}
