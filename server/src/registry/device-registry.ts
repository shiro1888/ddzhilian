import type WebSocket from 'ws';

import {
  type DeviceHelloPayload,
  type DeviceSettingsPayload,
  type DirectorySnapshotPayload,
  type HistoryFileSummary,
  type NativeLanCapabilityPayload,
  type PeerSummary,
  type RoomSummary,
  type SessionSummary,
  type TransportMode,
} from '../protocol.js';
import {
  createDeviceId,
  createHistoryAuthToken,
  createPairToken,
  createShortCode,
} from '../utils/id.js';
import {
  type NetworkContext,
} from '../utils/network.js';
import { type HistoryRegistry } from './history-registry.js';
import { type RoomRegistry } from './room-registry.js';
import { type SessionRegistry } from './session-registry.js';
import { type UiStateRegistry } from './ui-state-registry.js';

export interface ConnectedDevice {
  socket: WebSocket;
  deviceId: string;
  deviceName: string;
  platform: string;
  accountId?: string;
  autoConnect: boolean;
  discoverable: boolean;
  allowShortCode: boolean;
  shortCode: string;
  pairToken: string;
  historyAuthToken: string;
  nativeLan?: NativeLanCapabilityPayload;
  network: NetworkContext;
  lastSeenAt: string;
}

function normalizeText(value: string | undefined, fallback: string) {
  const text = value?.trim();

  return text && text.length > 0 ? text.slice(0, 80) : fallback;
}

function normalizeAccountId(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed.slice(0, 80) : undefined;
}

function normalizeNativeLan(
  capability: NativeLanCapabilityPayload | undefined,
): NativeLanCapabilityPayload | undefined {
  if (!capability?.lanNativeEnabled) {
    return undefined;
  }

  return {
    lanNativeEnabled: true,
    lanDiscoveryEnabled: capability.lanDiscoveryEnabled,
    lanTransferEnabled: capability.lanTransferEnabled,
    localProtocol: capability.localProtocol,
    localPort: capability.localPort,
    localFingerprint: capability.localFingerprint?.trim() || undefined,
    localDownloadFallback: capability.localDownloadFallback,
  };
}

function getPreferredTransport(
  viewer: Pick<ConnectedDevice, 'accountId' | 'autoConnect' | 'network'>,
  candidate: Pick<ConnectedDevice, 'accountId' | 'autoConnect' | 'network'>,
): TransportMode {
  return (
    !!viewer.network.lanKey &&
    viewer.network.lanKey === candidate.network.lanKey
  )
    ? 'lan-webrtc'
    : 'remote-webrtc';
}

function derivePublicHttpBaseUrl(publicWsUrl: string) {
  try {
    const url = new URL(publicWsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export class DeviceRegistry {
  private readonly byId = new Map<string, ConnectedDevice>();

  private readonly byShortCode = new Map<string, string>();

  private readonly byPairToken = new Map<string, string>();

  private readonly byHistoryAuthToken = new Map<string, string>();

  register(
    socket: WebSocket,
    payload: DeviceHelloPayload,
    network: NetworkContext,
  ) {
    const deviceId = payload.deviceId?.trim() || createDeviceId();
    const existing = this.byId.get(deviceId);

    if (existing && existing.socket !== socket) {
      existing.socket.close(4001, 'Device replaced by a newer connection.');
      this.remove(deviceId);
    }

    const now = new Date().toISOString();
    const device: ConnectedDevice = {
      socket,
      deviceId,
      deviceName: normalizeText(
        payload.deviceName,
        `Device-${deviceId.slice(-4).toUpperCase()}`,
      ),
      platform: normalizeText(payload.platform, 'web'),
      accountId: normalizeAccountId(payload.accountId),
      autoConnect: payload.autoConnect ?? true,
      discoverable: payload.discoverable ?? true,
      allowShortCode: payload.allowShortCode ?? true,
      shortCode: this.createUniqueShortCode(deviceId),
      pairToken: this.createUniquePairToken(deviceId),
      historyAuthToken: this.createUniqueHistoryAuthToken(deviceId),
      nativeLan: normalizeNativeLan(payload.nativeLan),
      network,
      lastSeenAt: now,
    };

    this.byId.set(deviceId, device);
    this.byShortCode.set(device.shortCode, deviceId);
    this.byPairToken.set(device.pairToken, deviceId);
    this.byHistoryAuthToken.set(device.historyAuthToken, deviceId);

    return device;
  }

  touch(deviceId: string) {
    const device = this.byId.get(deviceId);

    if (!device) {
      return undefined;
    }

    device.lastSeenAt = new Date().toISOString();

    return device;
  }

  update(deviceId: string, payload: DeviceSettingsPayload) {
    const device = this.byId.get(deviceId);

    if (!device) {
      return undefined;
    }

    if (payload.deviceName !== undefined) {
      device.deviceName = normalizeText(payload.deviceName, device.deviceName);
    }

    if (payload.platform !== undefined) {
      device.platform = normalizeText(payload.platform, device.platform);
    }

    if (payload.accountId !== undefined) {
      device.accountId = normalizeAccountId(payload.accountId);
    }

    if (payload.autoConnect !== undefined) {
      device.autoConnect = payload.autoConnect;
    }

    if (payload.discoverable !== undefined) {
      device.discoverable = payload.discoverable;
    }

    if (payload.allowShortCode !== undefined) {
      device.allowShortCode = payload.allowShortCode;
    }

    if (payload.nativeLan !== undefined) {
      device.nativeLan = normalizeNativeLan(payload.nativeLan);
    }

    device.lastSeenAt = new Date().toISOString();

    return device;
  }

  getById(deviceId: string) {
    return this.byId.get(deviceId);
  }

  getByShortCode(shortCode: string) {
    const deviceId = this.byShortCode.get(shortCode.trim().toUpperCase());

    return deviceId ? this.byId.get(deviceId) : undefined;
  }

  getByPairToken(pairToken: string) {
    const deviceId = this.byPairToken.get(pairToken.trim());

    return deviceId ? this.byId.get(deviceId) : undefined;
  }

  getByHistoryAuthToken(historyAuthToken: string) {
    const deviceId = this.byHistoryAuthToken.get(historyAuthToken.trim());

    return deviceId ? this.byId.get(deviceId) : undefined;
  }

  remove(deviceId: string) {
    const device = this.byId.get(deviceId);

    if (!device) {
      return undefined;
    }

    this.byShortCode.delete(device.shortCode);
    this.byPairToken.delete(device.pairToken);
    this.byHistoryAuthToken.delete(device.historyAuthToken);
    this.byId.delete(deviceId);

    return device;
  }

  removeSocket(deviceId: string, socket: WebSocket) {
    const device = this.byId.get(deviceId);

    if (!device || device.socket !== socket) {
      return undefined;
    }

    return this.remove(deviceId);
  }

  list() {
    return [...this.byId.values()];
  }

  buildSnapshot(
    viewerId: string,
    sessionRegistry: SessionRegistry,
    roomRegistry: RoomRegistry,
    historyRegistry: HistoryRegistry,
    uiStateRegistry: UiStateRegistry,
    rtcConfig: DirectorySnapshotPayload['rtcConfig'],
    publicWsUrl: string,
  ): DirectorySnapshotPayload | undefined {
    const viewer = this.byId.get(viewerId);

    if (!viewer) {
      return undefined;
    }

    const peers = this.listVisiblePeersFor(viewerId, roomRegistry);
    const publicHttpBaseUrl = derivePublicHttpBaseUrl(publicWsUrl);
    const visibleRooms = roomRegistry.listForDevice(viewerId);
    const rooms = visibleRooms.map<RoomSummary>((room) => {
      const textStats = historyRegistry.getTextStatsForRoom(room.roomId);

      return {
        roomId: room.roomId,
        members: room.memberIds
          .map((memberId) => this.byId.get(memberId))
          .filter((member): member is ConnectedDevice => Boolean(member))
          .map((member) => ({
            deviceId: member.deviceId,
            deviceName: member.deviceName,
            platform: member.platform,
            online: true,
          })),
        isPublic: room.isPublic,
        historyTextCount: textStats.count,
        historyTextLatestAt: textStats.latestAt,
        historyTextPreview: textStats.latestPreview,
        historyTextLatestSourceDeviceId: textStats.latestSourceDeviceId,
        updatedAt: room.updatedAt,
      };
    });
    const historyFiles = visibleRooms
      .flatMap((room) =>
        historyRegistry
          .listForRoom(room.roomId)
          .map((record) => ({ record, isPublic: room.isPublic || record.isPublic })),
      )
      .map<HistoryFileSummary>((record) =>
        historyRegistry.toSummary(record.record, publicHttpBaseUrl, record.isPublic),
      );
    const sessions = sessionRegistry.listForDevice(viewerId).map<SessionSummary>(
      (session) => ({
        sessionId: session.sessionId,
        roomId: session.roomId,
        peerId:
          session.initiatorId === viewerId
            ? session.responderId
            : session.initiatorId,
        state: session.state,
        reason: session.reason,
        transportMode: session.transportMode,
        initiator: session.initiatorId === viewerId,
        updatedAt: session.updatedAt,
      }),
    );

    return {
      self: {
        deviceId: viewer.deviceId,
        deviceName: viewer.deviceName,
        shortCode: viewer.shortCode,
        pairToken: viewer.pairToken,
        historyAuthToken: viewer.historyAuthToken,
        accountId: viewer.accountId,
        autoConnect: viewer.autoConnect,
        discoverable: viewer.discoverable,
        allowShortCode: viewer.allowShortCode,
        platform: viewer.platform,
        nativeLan: viewer.nativeLan,
        preferences: uiStateRegistry.getPreferences(viewer.deviceId),
      },
      peers,
      lanPeers: peers.filter((peer) => peer.relation.sameLan),
      accountPeers: peers.filter((peer) => peer.relation.sameAccount),
      rooms,
      roomStates: uiStateRegistry.listRoomStates(
        viewer.deviceId,
        rooms.map((room) => room.roomId),
      ),
      historyFiles,
      historyTexts: [],
      sessions,
      rtcConfig,
      publicWsUrl,
      serverTime: new Date().toISOString(),
    };
  }

  findAutoConnectTargets(deviceId: string) {
    const device = this.byId.get(deviceId);

    if (!device?.accountId || !device.autoConnect) {
      return [];
    }

    return this.list().filter(
      (candidate) =>
        candidate.deviceId !== deviceId &&
        candidate.accountId === device.accountId &&
        candidate.autoConnect,
    );
  }

  findLanAutoConnectTargets(deviceId: string) {
    const device = this.byId.get(deviceId);

    if (!device?.discoverable || !device.network.lanKey) {
      return [];
    }

    return this.list().filter(
      (candidate) =>
        candidate.deviceId !== deviceId &&
        candidate.discoverable &&
        !!candidate.network.lanKey &&
        candidate.network.lanKey === device.network.lanKey,
    );
  }

  toPeerSummary(viewer: ConnectedDevice, candidate: ConnectedDevice): PeerSummary {
    return {
      deviceId: candidate.deviceId,
      deviceName: candidate.deviceName,
      platform: candidate.platform,
      shortCode: candidate.shortCode,
      pairToken: candidate.pairToken,
      online: true,
      preferredTransport: getPreferredTransport(viewer, candidate),
      relation: {
        sameAccount:
          !!viewer.accountId && viewer.accountId === candidate.accountId,
        sameLan:
          !!viewer.network.lanKey &&
          viewer.network.lanKey === candidate.network.lanKey,
        autoConnectEligible:
          !!viewer.accountId &&
          viewer.accountId === candidate.accountId &&
          viewer.autoConnect &&
          candidate.autoConnect,
        discoverable: candidate.discoverable,
      },
      nativeLan: candidate.nativeLan,
      lastSeenAt: candidate.lastSeenAt,
    };
  }

  private listVisiblePeersFor(viewerId: string, roomRegistry: RoomRegistry) {
    const viewer = this.byId.get(viewerId);

    if (!viewer) {
      return [];
    }

    return this.list()
      .filter((candidate) => candidate.deviceId !== viewerId)
      .filter(
        (candidate) =>
          candidate.discoverable ||
          (!!viewer.accountId && viewer.accountId === candidate.accountId) ||
          roomRegistry.shareRoom(viewerId, candidate.deviceId),
      )
      .map((candidate) => this.toPeerSummary(viewer, candidate))
      .sort((left, right) => left.deviceName.localeCompare(right.deviceName));
  }

  private createUniqueShortCode(deviceId: string) {
    let shortCode = createShortCode();

    while (
      this.byShortCode.has(shortCode) &&
      this.byShortCode.get(shortCode) !== deviceId
    ) {
      shortCode = createShortCode();
    }

    return shortCode;
  }

  private createUniquePairToken(deviceId: string) {
    let pairToken = createPairToken();

    while (
      this.byPairToken.has(pairToken) &&
      this.byPairToken.get(pairToken) !== deviceId
    ) {
      pairToken = createPairToken();
    }

    return pairToken;
  }

  private createUniqueHistoryAuthToken(deviceId: string) {
    let historyAuthToken = createHistoryAuthToken();

    while (
      this.byHistoryAuthToken.has(historyAuthToken) &&
      this.byHistoryAuthToken.get(historyAuthToken) !== deviceId
    ) {
      historyAuthToken = createHistoryAuthToken();
    }

    return historyAuthToken;
  }
}
