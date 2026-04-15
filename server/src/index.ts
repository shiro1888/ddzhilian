import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';

import WebSocket, { WebSocketServer } from 'ws';

import { loadConfig } from './config.js';
import {
  type ClientEvent,
  type PairReason,
  type ServerEvent,
  type TransportMode,
  parseClientEvent,
} from './protocol.js';
import { DeviceRegistry } from './registry/device-registry.js';
import { HistoryRegistry } from './registry/history-registry.js';
import { RoomRegistry } from './registry/room-registry.js';
import { SessionRegistry } from './registry/session-registry.js';
import { buildNetworkContext } from './utils/network.js';

type ErrorPayload = Extract<ServerEvent, { type: 'error' }>['payload'];
type SocketWithAddress = WebSocket & {
  clientAddress?: string;
  _socket?: {
    remoteAddress?: string;
  };
};

const config = loadConfig();
const devices = new DeviceRegistry();
const history = new HistoryRegistry(config.historyRetentionMs);
const rooms = new RoomRegistry();
const sessions = new SessionRegistry();

function setCorsHeaders(response: {
  setHeader(name: string, value: string): void;
}) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,X-File-Name,X-File-Created-At,X-Source-Device-Id,X-Source-Device-Name,X-Session-Id',
  );
}

async function readRequestBuffer(
  request: AsyncIterable<Buffer | string>,
) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function decodeHeaderValue(value: string | string[] | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  if (!headerValue) {
    return undefined;
  }

  try {
    return decodeURIComponent(headerValue);
  } catch {
    return headerValue;
  }
}

const httpServer = createServer((request, response) => {
  if (!request.url) {
    response.writeHead(404).end();
    return;
  }

  setCorsHeaders(response);

if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/history/upload' && request.method === 'POST') {
    const roomId = url.searchParams.get('roomId')?.trim();
    const historyId = url.searchParams.get('historyId')?.trim();
    const sessionId = url.searchParams.get('sessionId')?.trim() || undefined;
    const fileName = decodeHeaderValue(request.headers['x-file-name']);
    const createdAt =
      decodeHeaderValue(request.headers['x-file-created-at']) ??
      new Date().toISOString();
    const sourceDeviceId = decodeHeaderValue(request.headers['x-source-device-id']);
    const sourceDeviceName = decodeHeaderValue(request.headers['x-source-device-name']);

    if (!roomId || !historyId || !fileName || !sourceDeviceId) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: 'Missing roomId, historyId, fileName, or sourceDeviceId.',
        }),
      );
      return;
    }

    if (!rooms.getById(roomId)) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Room not found.' }));
      return;
    }

    void readRequestBuffer(request)
      .then(async (data) => {
        const device = devices.getById(sourceDeviceId);
        const record = await history.saveFile({
          historyId,
          roomId,
          sessionId,
          sourceDeviceId,
          sourceDeviceName:
            sourceDeviceName ??
            device?.deviceName ??
            sourceDeviceId,
          fileName,
          mimeType: request.headers['content-type']?.toString(),
          createdAt,
          data,
        });

        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, file: history.toSummary(record) }));
        broadcastSnapshots();
      })
      .catch((error) => {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'History upload failed.',
          }),
        );
      });
    return;
  }

  if (url.pathname === '/api/history/text' && request.method === 'POST') {
    void readRequestBuffer(request)
      .then((buffer) => {
        const payload = JSON.parse(buffer.toString('utf8')) as {
          historyId?: string;
          roomId?: string;
          sessionId?: string;
          sourceDeviceId?: string;
          sourceDeviceName?: string;
          text?: string;
          createdAt?: string;
        };

        if (
          !payload.historyId ||
          !payload.roomId ||
          !payload.sourceDeviceId ||
          !payload.text
        ) {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              error: 'Missing historyId, roomId, sourceDeviceId, or text.',
            }),
          );
          return;
        }

        if (!rooms.getById(payload.roomId)) {
          response.writeHead(404, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'Room not found.' }));
          return;
        }

        const device = devices.getById(payload.sourceDeviceId);
        const record = history.saveText({
          historyId: payload.historyId,
          roomId: payload.roomId,
          sessionId: payload.sessionId,
          sourceDeviceId: payload.sourceDeviceId,
          sourceDeviceName:
            payload.sourceDeviceName ??
            device?.deviceName ??
            payload.sourceDeviceId,
          text: payload.text,
          createdAt: payload.createdAt ?? new Date().toISOString(),
        });

        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, text: history.toTextSummary(record) }));
        broadcastSnapshots();
      })
      .catch((error) => {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'History text upload failed.',
          }),
        );
      });
    return;
  }

  if (url.pathname.startsWith('/api/history/download/') && request.method === 'GET') {
    const historyId = decodeURIComponent(
      url.pathname.slice('/api/history/download/'.length),
    );
    const record = history.getById(historyId);

    if (!record) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'History file not found.' }));
      return;
    }

    response.writeHead(200, {
      'content-type': record.mimeType || 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
      'content-length': record.size.toString(),
    });
    createReadStream(record.storagePath).pipe(response);
    return;
  }

  if (url.pathname === '/health') {
    const openSessionIds = new Set<string>();
    const openRoomIds = new Set<string>();

    for (const device of devices.list()) {
      for (const session of sessions.listForDevice(device.deviceId)) {
        openSessionIds.add(session.sessionId);
      }

      for (const room of rooms.listForDevice(device.deviceId)) {
        openRoomIds.add(room.roomId);
      }
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        ok: true,
        onlineDevices: devices.list().length,
        openRooms: openRoomIds.size,
        openSessions: openSessionIds.size,
        serverTime: new Date().toISOString(),
      }),
    );
    return;
  }

  if (url.pathname === '/api/debug/state') {
    const uniqueSessions = devices
      .list()
      .flatMap((device) => sessions.listForDevice(device.deviceId))
      .filter(
        (session, index, collection) =>
          collection.findIndex((entry) => entry.sessionId === session.sessionId) === index,
      );

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        devices: devices.list().map((device) => ({
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          accountId: device.accountId,
          shortCode: device.shortCode,
          pairToken: device.pairToken,
          nativeLan: device.nativeLan,
          network: device.network,
        })),
        sessions: uniqueSessions.map((session) => ({
          sessionId: session.sessionId,
          roomId: session.roomId,
          initiatorId: session.initiatorId,
          responderId: session.responderId,
          state: session.state,
          reason: session.reason,
          transportMode: session.transportMode,
          updatedAt: session.updatedAt,
        })),
        rooms: devices.list().flatMap((device) => rooms.listForDevice(device.deviceId)).filter(
          (room, index, collection) =>
            collection.findIndex((entry) => entry.roomId === room.roomId) === index,
        ),
        historyFiles: devices
          .list()
          .flatMap((device) => rooms.listForDevice(device.deviceId))
          .filter(
            (room, index, collection) =>
              collection.findIndex((entry) => entry.roomId === room.roomId) === index,
          )
          .flatMap((room) => history.listForRoom(room.roomId))
          .map((record) => history.toSummary(record)),
        historyTexts: devices
          .list()
          .flatMap((device) => rooms.listForDevice(device.deviceId))
          .filter(
            (room, index, collection) =>
              collection.findIndex((entry) => entry.roomId === room.roomId) === index,
          )
          .flatMap((room) => history.listTextsForRoom(room.roomId))
          .map((record) => history.toTextSummary(record)),
        serverTime: new Date().toISOString(),
      }),
    );
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

const wsServer = new WebSocketServer({ server: httpServer, path: '/ws' });

function send(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(event));
}

function emitError(socket: WebSocket, payload: ErrorPayload) {
  send(socket, {
    type: 'error',
    payload,
  });
}

function broadcastSnapshots() {
  for (const device of devices.list()) {
    const snapshot = devices.buildSnapshot(
      device.deviceId,
      sessions,
      rooms,
      history,
      config.rtcConfig,
      config.publicWsUrl,
    );

    if (snapshot) {
      send(device.socket, {
        type: 'directory-snapshot',
        payload: snapshot,
      });
    }
  }
}

function emitSessionCreated(sessionId: string) {
  const session = sessions.getById(sessionId);

  if (!session) {
    return;
  }

  const initiator = devices.getById(session.initiatorId);
  const responder = devices.getById(session.responderId);

  if (!initiator || !responder) {
    return;
  }

  send(initiator.socket, {
    type: 'session-created',
    payload: {
      sessionId: session.sessionId,
      roomId: session.roomId,
      peer: devices.toPeerSummary(initiator, responder),
      reason: session.reason,
      transportMode: session.transportMode,
      initiator: true,
    },
  });

  send(responder.socket, {
    type: 'session-created',
    payload: {
      sessionId: session.sessionId,
      roomId: session.roomId,
      peer: devices.toPeerSummary(responder, initiator),
      reason: session.reason,
      transportMode: session.transportMode,
      initiator: false,
    },
  });
}

function deriveTransportMode(
  requesterId: string,
  targetId: string,
): TransportMode {
  const requester = devices.getById(requesterId);
  const target = devices.getById(targetId);

  if (
    requester?.network.lanKey &&
    requester.network.lanKey === target?.network.lanKey
  ) {
    return 'lan-webrtc';
  }

  return 'remote-webrtc';
}

function createSession(input: {
  roomId: string;
  requesterId: string;
  targetId: string;
  reason: PairReason;
  initiatorId?: string;
}) {
  if (input.requesterId === input.targetId) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'A device cannot connect to itself.',
    };
  }

  const requester = devices.getById(input.requesterId);
  const target = devices.getById(input.targetId);

  if (!requester || !target) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The target device is not online.',
    };
  }

  const result = sessions.ensureSession({
    roomId: input.roomId,
    initiatorId: input.initiatorId ?? input.requesterId,
    responderId:
      input.initiatorId === input.targetId ? input.requesterId : input.targetId,
    reason: input.reason,
    transportMode: deriveTransportMode(input.requesterId, input.targetId),
  });

  if (result.created) {
    emitSessionCreated(result.session.sessionId);
    rooms.touch(input.roomId);
    broadcastSnapshots();
  }

  return {
    ok: true as const,
    session: result.session,
  };
}

function extractClientAddress(
  socket: SocketWithAddress,
  forwardedFor: string | string[] | undefined,
) {
  const headerValue = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;
  const forwardedAddress = headerValue?.split(',')[0]?.trim();

  return forwardedAddress || socket._socket?.remoteAddress;
}

function connectDeviceToRoom(
  deviceId: string,
  roomId: string,
  reason: PairReason,
  existingMemberIds: string[],
) {
  for (const memberId of existingMemberIds) {
    const initiatorId =
      deviceId < memberId ? deviceId : memberId;

    createSession({
      roomId,
      requesterId: deviceId,
      targetId: memberId,
      initiatorId,
      reason,
    });
  }
}

function joinRoomViaTarget(input: {
  requesterId: string;
  targetId: string;
  reason: PairReason;
}) {
  if (input.requesterId === input.targetId) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'A device cannot connect to itself.',
    };
  }

  const requester = devices.getById(input.requesterId);
  const target = devices.getById(input.targetId);

  if (!requester || !target) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The target device is not online.',
    };
  }

  const preferredRoom = rooms.getPreferredJoinRoomForDevice(target.deviceId);

  if (!preferredRoom) {
    const room = rooms.createRoom({
      memberIds: [requester.deviceId, target.deviceId],
      reason: input.reason,
      lanKey:
        requester.network.lanKey &&
        requester.network.lanKey === target.network.lanKey
          ? requester.network.lanKey
          : undefined,
    });

    connectDeviceToRoom(requester.deviceId, room.roomId, input.reason, [
      target.deviceId,
    ]);
    broadcastSnapshots();

    return {
      ok: true as const,
      room,
    };
  }

  const existingMemberIds = preferredRoom.memberIds.filter(
    (memberId) => memberId !== requester.deviceId,
  );
  rooms.addMember(preferredRoom.roomId, requester.deviceId);
  connectDeviceToRoom(
    requester.deviceId,
    preferredRoom.roomId,
    input.reason,
    existingMemberIds,
  );
  broadcastSnapshots();

  return {
    ok: true as const,
    room: preferredRoom,
  };
}

function autoJoinLanRoom(deviceId: string) {
  const device = devices.getById(deviceId);

  if (!device?.discoverable || !device.network.lanKey) {
    return;
  }

  const roomJoin = rooms.ensureLanRoom(device.deviceId, device.network.lanKey);
  if (roomJoin.existingMemberIds.length === 0) {
    broadcastSnapshots();
    return;
  }

  connectDeviceToRoom(
    device.deviceId,
    roomJoin.room.roomId,
    'lan-discovery',
    roomJoin.existingMemberIds.filter((memberId) => memberId !== device.deviceId),
  );
  broadcastSnapshots();
}

function handleAutoConnect(deviceId: string) {
  const device = devices.getById(deviceId);

  if (!device) {
    return;
  }

  autoJoinLanRoom(deviceId);

  for (const candidate of devices.findAutoConnectTargets(deviceId)) {
    if (rooms.shareRoom(deviceId, candidate.deviceId)) {
      continue;
    }

    joinRoomViaTarget({
      requesterId: deviceId,
      targetId: candidate.deviceId,
      reason: 'account-auto',
    });
  }
}

function validateSessionOwnership(
  currentDeviceId: string,
  sessionId: string,
  targetDeviceId: string,
) {
  const session = sessions.getById(sessionId);

  if (!session) {
    return {
      ok: false as const,
      code: 'SESSION_NOT_FOUND' as const,
      message: 'The requested session does not exist.',
    };
  }

  const belongsToSession =
    (session.initiatorId === currentDeviceId &&
      session.responderId === targetDeviceId) ||
    (session.initiatorId === targetDeviceId &&
      session.responderId === currentDeviceId);

  if (!belongsToSession) {
    return {
      ok: false as const,
      code: 'SESSION_FORBIDDEN' as const,
      message: 'This session does not belong to the current device pair.',
    };
  }

  return {
    ok: true as const,
    session,
  };
}

function handleEvent(
  socket: SocketWithAddress,
  deviceId: string | undefined,
  event: ClientEvent,
) {
  if (event.type !== 'hello' && !deviceId) {
    emitError(socket, {
      code: 'DEVICE_NOT_READY',
      message: 'Send a hello event before using the signaling API.',
    });
    return deviceId;
  }

  const activeDeviceId = deviceId as string;

  switch (event.type) {
    case 'hello': {
      const device = devices.register(
        socket,
        event.payload,
        buildNetworkContext(socket.clientAddress ?? socket._socket?.remoteAddress),
      );

      const snapshot = devices.buildSnapshot(
        device.deviceId,
        sessions,
        rooms,
        history,
        config.rtcConfig,
        config.publicWsUrl,
      );

      if (snapshot) {
        send(socket, {
          type: 'welcome',
          payload: snapshot,
        });
      }

      if (event.payload.requestedPairToken) {
        const target = devices.getByPairToken(event.payload.requestedPairToken);

        if (target) {
          joinRoomViaTarget({
            requesterId: device.deviceId,
            targetId: target.deviceId,
            reason: 'pair-link',
          });
        }
      }

      handleAutoConnect(device.deviceId);
      broadcastSnapshots();

      return device.deviceId;
    }

    case 'update-settings': {
      const updated = devices.update(activeDeviceId, event.payload);

      if (!updated) {
        emitError(socket, {
          code: 'DEVICE_NOT_FOUND',
          message: 'The current device is no longer registered.',
        });
        return deviceId;
      }

      handleAutoConnect(updated.deviceId);
      broadcastSnapshots();

      return deviceId;
    }

    case 'request-snapshot': {
      const snapshot = devices.buildSnapshot(
        activeDeviceId,
        sessions,
        rooms,
        history,
        config.rtcConfig,
        config.publicWsUrl,
      );

      if (snapshot) {
        send(socket, {
          type: 'directory-snapshot',
          payload: snapshot,
        });
      }

      return deviceId;
    }

    case 'pair-by-short-code': {
      const target = devices.getByShortCode(event.payload.shortCode);

      if (!target) {
        emitError(socket, {
          code: 'DEVICE_NOT_FOUND',
          message: 'No online device matches that short code.',
        });
        return deviceId;
      }

      if (!target.allowShortCode) {
        emitError(socket, {
          code: 'SHORT_CODE_BLOCKED',
          message: 'That device currently does not accept short-code pairing.',
        });
        return deviceId;
      }

      const result = joinRoomViaTarget({
        requesterId: activeDeviceId,
        targetId: target.deviceId,
        reason: 'short-code',
      });

      if (!result.ok) {
        emitError(socket, result);
      }

      return deviceId;
    }

    case 'pair-by-token': {
      const target = devices.getByPairToken(event.payload.pairToken);

      if (!target) {
        emitError(socket, {
          code: 'PAIR_TOKEN_NOT_FOUND',
          message: 'No online device matches that pairing token.',
        });
        return deviceId;
      }

      const result = joinRoomViaTarget({
        requesterId: activeDeviceId,
        targetId: target.deviceId,
        reason: 'pair-link',
      });

      if (!result.ok) {
        emitError(socket, result);
      }

      return deviceId;
    }

    case 'request-connect': {
      const result = joinRoomViaTarget({
        requesterId: activeDeviceId,
        targetId: event.payload.targetDeviceId,
        reason: event.payload.reason ?? 'manual',
      });

      if (!result.ok) {
        emitError(socket, result);
      }

      return deviceId;
    }

    case 'signal': {
      const validation = validateSessionOwnership(
        activeDeviceId,
        event.payload.sessionId,
        event.payload.targetDeviceId,
      );

      if (!validation.ok) {
        emitError(socket, validation);
        return deviceId;
      }

      const target = devices.getById(event.payload.targetDeviceId);

      if (!target) {
        emitError(socket, {
          code: 'DEVICE_NOT_FOUND',
          message: 'The target device is no longer online.',
        });
        return deviceId;
      }

      send(target.socket, {
        type: 'signal',
        payload: {
          sessionId: event.payload.sessionId,
          fromDeviceId: activeDeviceId,
          signal: event.payload.signal,
        },
      });

      sessions.updateState(event.payload.sessionId, 'connecting');
      return deviceId;
    }

    case 'session-state': {
      const validation = validateSessionOwnership(
        activeDeviceId,
        event.payload.sessionId,
        event.payload.targetDeviceId,
      );

      if (!validation.ok) {
        emitError(socket, validation);
        return deviceId;
      }

      const target = devices.getById(event.payload.targetDeviceId);
      const session = sessions.updateState(
        event.payload.sessionId,
        event.payload.state,
      );

      if (!session || !target) {
        return deviceId;
      }

      send(target.socket, {
        type: 'peer-state',
        payload: {
          sessionId: session.sessionId,
          peerId: activeDeviceId,
          state: session.state,
        },
      });

      broadcastSnapshots();
      return deviceId;
    }
  }
}

wsServer.on('connection', (socket: SocketWithAddress, request) => {
  let currentDeviceId: string | undefined;
  let isAlive = true;

  socket.clientAddress = extractClientAddress(
    socket,
    request.headers['x-forwarded-for'],
  );

  socket.on('pong', () => {
    isAlive = true;
  });

  socket.on('message', (raw) => {
    const event = parseClientEvent(raw.toString());

    if (!event) {
      emitError(socket, {
        code: 'BAD_EVENT',
        message: 'Unsupported websocket event payload.',
      });
      return;
    }

    currentDeviceId = handleEvent(socket, currentDeviceId, event);

    if (currentDeviceId) {
      devices.touch(currentDeviceId);
    }
  });

  socket.on('close', () => {
    if (!currentDeviceId) {
      return;
    }

    devices.remove(currentDeviceId);
    rooms.removeDevice(currentDeviceId);
    const closedSessions = sessions.closeSessionsForDevice(currentDeviceId);

    for (const session of closedSessions) {
      const peerId =
        session.initiatorId === currentDeviceId
          ? session.responderId
          : session.initiatorId;
      const peer = devices.getById(peerId);

      if (peer) {
        send(peer.socket, {
          type: 'peer-state',
          payload: {
            sessionId: session.sessionId,
            peerId: currentDeviceId,
            state: 'closed',
          },
        });
      }
    }

    broadcastSnapshots();
  });

  const interval = setInterval(() => {
    if (!isAlive) {
      socket.terminate();
      clearInterval(interval);
      return;
    }

    isAlive = false;
    sessions.prune(config.sessionIdleMs);
    history.prune();
    socket.ping();
  }, config.pingIntervalMs);

  socket.on('close', () => {
    clearInterval(interval);
  });
});

httpServer.listen(config.port, config.host, () => {
  console.log(
    `CCConnect signaling server listening on http://${config.host}:${config.port.toString()}`,
  );
  console.log(`WebSocket endpoint: ${config.publicWsUrl}`);
});
