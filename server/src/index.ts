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
import {
  type ConnectedDevice,
  DeviceRegistry,
} from './registry/device-registry.js';
import { HistoryRegistry } from './registry/history-registry.js';
import { RoomRegistry } from './registry/room-registry.js';
import { SessionRegistry } from './registry/session-registry.js';
import { UiStateRegistry } from './registry/ui-state-registry.js';
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
const history = new HistoryRegistry(config.historyRetentionMs, config.historyMaxBytes);
const rooms = new RoomRegistry();
const sessions = new SessionRegistry();
const uiState = new UiStateRegistry();
const pendingRoomExitTimers = new Map<string, NodeJS.Timeout>();

function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function setCorsHeaders(
  request: {
    headers: {
      origin?: string | string[];
    };
  },
  response: {
  setHeader(name: string, value: string): void;
  },
) {
  const origin = Array.isArray(request.headers.origin)
    ? request.headers.origin[0]
    : request.headers.origin;

  if (!origin) {
    return true;
  }

  if (!config.allowedOrigins.includes(origin) && !isLoopbackOrigin(origin)) {
    return false;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization,Content-Range,Content-Type,Range,X-File-Name,X-File-Created-At,X-Session-Id',
  );
  response.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges,Content-Disposition,Content-Length,Content-Range',
  );

  return true;
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

function writeJson(
  response: {
    writeHead(
      statusCode: number,
      headers?: Record<string, string>,
    ): unknown;
    end(body?: string): void;
  },
  statusCode: number,
  payload: Record<string, unknown>,
) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function readBearerToken(value: string | string[] | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  const trimmedValue = headerValue?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(trimmedValue);
  return match?.[1]?.trim();
}

function parseRangeHeader(value: string | string[] | undefined, size: number) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  if (!headerValue) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(headerValue.trim());
  if (!match) {
    return null;
  }

  const [, startText, endText] = match;
  let start: number;
  let end: number;

  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

function parseContentRangeHeader(value: string | string[] | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  if (!headerValue) {
    return undefined;
  }

  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(headerValue.trim());
  if (!match) {
    return null;
  }

  const [, startText, endText, totalText] = match;
  const start = Number(startText);
  const end = Number(endText);
  const total = Number(totalText);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    end < start ||
    total <= 0 ||
    end >= total
  ) {
    return null;
  }

  return {
    start,
    end,
    total,
  };
}

function authenticateHistoryRequest(request: {
  headers: {
    authorization?: string | string[];
  };
}) {
  const historyAuthToken = readBearerToken(request.headers.authorization);

  if (!historyAuthToken) {
    return {
      ok: false as const,
      statusCode: 401,
      message: 'Missing bearer token.',
    };
  }

  const device = devices.getByHistoryAuthToken(historyAuthToken);

  if (!device) {
    return {
      ok: false as const,
      statusCode: 401,
      message: 'Invalid bearer token.',
    };
  }

  return {
    ok: true as const,
    device,
  };
}

function authorizeRoomMember(
  device: ConnectedDevice,
  roomId: string,
) {
  const room = rooms.getById(roomId);

  if (!room) {
    return {
      ok: false as const,
      statusCode: 404,
      message: 'Room not found.',
    };
  }

  if (!room.memberIds.includes(device.deviceId)) {
    return {
      ok: false as const,
      statusCode: 403,
      message: 'The current device is not a member of that room.',
    };
  }

  return {
    ok: true as const,
    room,
  };
}

function isPublicHistoryRoom(roomId: string) {
  return rooms.getById(roomId)?.isPublic ?? false;
}

function isPublicHistoryRecord(record: { roomId: string; isPublic: boolean }) {
  return record.isPublic || isPublicHistoryRoom(record.roomId);
}

function getRestoredPublicRoomId() {
  return history.getLatestPublicRoomId();
}

function authorizeSessionMember(
  device: ConnectedDevice,
  roomId: string,
  sessionId: string | undefined,
) {
  if (!sessionId) {
    return {
      ok: true as const,
    };
  }

  const session = sessions.getById(sessionId);

  if (
    !session ||
    session.roomId !== roomId ||
    (session.initiatorId !== device.deviceId &&
      session.responderId !== device.deviceId)
  ) {
    return {
      ok: false as const,
      statusCode: 403,
      message: 'The requested session is not accessible to the current device.',
    };
  }

  return {
    ok: true as const,
  };
}

const httpServer = createServer((request, response) => {
  if (!request.url) {
    response.writeHead(404).end();
    return;
  }

  const corsAllowed = setCorsHeaders(request, response);

  if (!corsAllowed) {
    writeJson(response, 403, { error: 'Origin not allowed.' });
    return;
  }

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
    const contentRange = parseContentRangeHeader(request.headers['content-range']);
    if (!roomId || !historyId || !fileName) {
      writeJson(response, 400, {
        error: 'Missing roomId, historyId, or fileName.',
      });
      return;
    }

    const authResult = authenticateHistoryRequest(request);
    if (!authResult.ok) {
      writeJson(response, authResult.statusCode, { error: authResult.message });
      return;
    }

    const roomAccess = authorizeRoomMember(authResult.device, roomId);
    if (!roomAccess.ok) {
      writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
      return;
    }

    const sessionAccess = authorizeSessionMember(
      authResult.device,
      roomId,
      sessionId,
    );
    if (!sessionAccess.ok) {
      writeJson(response, sessionAccess.statusCode, {
        error: sessionAccess.message,
      });
      return;
    }

    if (contentRange === null) {
      writeJson(response, 400, { error: 'Invalid Content-Range header.' });
      return;
    }

    if (contentRange) {
      void readRequestBuffer(request)
        .then((buffer) =>
          history.saveFileChunk({
            historyId,
            roomId,
            sessionId,
            isPublic: roomAccess.room.isPublic,
            sourceDeviceId: authResult.device.deviceId,
            sourceDeviceName: authResult.device.deviceName,
            fileName,
            mimeType: request.headers['content-type']?.toString(),
            createdAt,
            start: contentRange.start,
            end: contentRange.end,
            total: contentRange.total,
            data: buffer,
          }),
        )
        .then((result) => {
          if (!result.complete) {
            writeJson(response, result.accepted ? 200 : 409, {
              ok: result.accepted,
              offset: result.offset,
              complete: false,
            });
            return;
          }

          writeJson(response, 200, {
            ok: true,
            offset: result.offset,
            complete: true,
            file: history.toSummary(result.record),
          });
          broadcastSnapshots();
        })
        .catch((error) => {
          writeJson(response, 500, {
            error: error instanceof Error ? error.message : 'History chunk upload failed.',
          });
        });
      return;
    }

    void history
      .saveFileStream({
        historyId,
        roomId,
        sessionId,
        isPublic: roomAccess.room.isPublic,
        sourceDeviceId: authResult.device.deviceId,
        sourceDeviceName: authResult.device.deviceName,
        fileName,
        mimeType: request.headers['content-type']?.toString(),
        createdAt,
        stream: request,
      })
      .then((record) => {
        writeJson(response, 200, { ok: true, file: history.toSummary(record) });
        broadcastSnapshots();
      })
      .catch((error) => {
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : 'History upload failed.',
        });
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
          text?: string;
          createdAt?: string;
        };

        if (!payload.historyId || !payload.roomId || !payload.text) {
          writeJson(response, 400, {
            error: 'Missing historyId, roomId, or text.',
          });
          return;
        }

        const authResult = authenticateHistoryRequest(request);
        if (!authResult.ok) {
          writeJson(response, authResult.statusCode, { error: authResult.message });
          return;
        }

        const roomAccess = authorizeRoomMember(authResult.device, payload.roomId);
        if (!roomAccess.ok) {
          writeJson(response, roomAccess.statusCode, { error: roomAccess.message });
          return;
        }

        const sessionAccess = authorizeSessionMember(
          authResult.device,
          payload.roomId,
          payload.sessionId,
        );
        if (!sessionAccess.ok) {
          writeJson(response, sessionAccess.statusCode, {
            error: sessionAccess.message,
          });
          return;
        }

        const record = history.saveText({
          historyId: payload.historyId,
          roomId: payload.roomId,
          sessionId: payload.sessionId,
          isPublic: roomAccess.room.isPublic,
          sourceDeviceId: authResult.device.deviceId,
          sourceDeviceName: authResult.device.deviceName,
          text: payload.text,
          createdAt: payload.createdAt ?? new Date().toISOString(),
        });

        writeJson(response, 200, { ok: true, text: history.toTextSummary(record) });
        broadcastSnapshots();
      })
      .catch((error) => {
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : 'History text upload failed.',
        });
      });
    return;
  }

  if (url.pathname.startsWith('/api/history/download/') && request.method === 'GET') {
    const historyId = decodeURIComponent(
      url.pathname.slice('/api/history/download/'.length),
    );
    const record = history.getById(historyId);

    if (!record) {
      writeJson(response, 404, { error: 'History file not found.' });
      return;
    }

    const isPublicRecord = isPublicHistoryRecord(record);
    if (!isPublicRecord) {
      const authResult = authenticateHistoryRequest(request);
      if (!authResult.ok) {
        writeJson(response, authResult.statusCode, { error: authResult.message });
        return;
      }

      if (!rooms.getById(record.roomId)?.memberIds.includes(authResult.device.deviceId)) {
        writeJson(response, 404, { error: 'History file not found.' });
        return;
      }
    }

    const range = parseRangeHeader(request.headers.range, record.size);
    const baseHeaders = {
      'content-type': record.mimeType || 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
      'accept-ranges': 'bytes',
      'cache-control': isPublicRecord ? 'public, max-age=3600' : 'private, max-age=3600',
    };

    if (range === null) {
      response.writeHead(416, {
        ...baseHeaders,
        'content-range': `bytes */${record.size.toString()}`,
      });
      response.end();
      return;
    }

    if (range) {
      response.writeHead(206, {
        ...baseHeaders,
        'content-length': (range.end - range.start + 1).toString(),
        'content-range': `bytes ${range.start.toString()}-${range.end.toString()}/${record.size.toString()}`,
      });
      createReadStream(record.storagePath, {
        start: range.start,
        end: range.end,
      }).pipe(response);
      return;
    }

    response.writeHead(200, {
      ...baseHeaders,
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
    if (!config.debugStateApiEnabled || !config.debugStateApiToken) {
      writeJson(response, 404, { error: 'Not found' });
      return;
    }

    if (readBearerToken(request.headers.authorization) !== config.debugStateApiToken) {
      writeJson(response, 404, { error: 'Not found' });
      return;
    }

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
      uiState,
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

function cancelPendingRoomExit(deviceId: string) {
  const timer = pendingRoomExitTimers.get(deviceId);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  pendingRoomExitTimers.delete(deviceId);
}

function scheduleRoomExit(deviceId: string) {
  cancelPendingRoomExit(deviceId);

  if (config.roomExitGraceMs <= 0) {
    rooms.removeDevice(deviceId);
    broadcastSnapshots();
    return;
  }

  const timer = setTimeout(() => {
    pendingRoomExitTimers.delete(deviceId);
    rooms.removeDevice(deviceId);
    broadcastSnapshots();
  }, config.roomExitGraceMs);

  pendingRoomExitTimers.set(deviceId, timer);
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

function connectDeviceToExistingRooms(deviceId: string) {
  for (const room of rooms.listForDevice(deviceId)) {
    if (room.isPublic) {
      continue;
    }

    connectDeviceToRoom(
      deviceId,
      room.roomId,
      room.reason,
      room.memberIds.filter((memberId) => memberId !== deviceId),
    );
  }
}

function selectPreferredRoomForConnection(requesterId: string, targetId: string) {
  const roomById = new Map(
    [
      ...rooms.listForDevice(requesterId),
      ...rooms.listForDevice(targetId),
    ]
      .filter((room) => !room.isPublic)
      .map((room) => [room.roomId, room] as const),
  );

  return [...roomById.values()].sort((left, right) => {
    if (right.memberIds.length !== left.memberIds.length) {
      return right.memberIds.length - left.memberIds.length;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  })[0];
}

function joinRoomViaTarget(input: {
  requesterId: string;
  targetId: string;
  reason: PairReason;
  createNewRoom?: boolean;
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

  const preferredRoom = input.createNewRoom
    ? undefined
    : selectPreferredRoomForConnection(requester.deviceId, target.deviceId);

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

  const requesterInRoom = preferredRoom.memberIds.includes(requester.deviceId);
  const targetInRoom = preferredRoom.memberIds.includes(target.deviceId);
  const joiningDeviceId = requesterInRoom && !targetInRoom
    ? target.deviceId
    : requester.deviceId;
  const existingMemberIds = preferredRoom.memberIds.filter(
    (memberId) => memberId !== joiningDeviceId,
  );

  rooms.addMember(preferredRoom.roomId, joiningDeviceId);
  connectDeviceToRoom(
    joiningDeviceId,
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

function joinRoomById(input: {
  requesterId: string;
  roomId: string;
  reason: PairReason;
}) {
  const requester = devices.getById(input.requesterId);
  const room = rooms.getById(input.roomId);

  if (!requester) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The current device is no longer registered.',
    };
  }

  if (!room) {
    return {
      ok: false as const,
      code: 'ROOM_NOT_FOUND' as const,
      message: 'No active room matches that room ID.',
    };
  }

  const existingMemberIds = room.memberIds.filter(
    (memberId) => memberId !== requester.deviceId,
  );

  rooms.addMember(room.roomId, requester.deviceId);
  if (!room.isPublic) {
    connectDeviceToRoom(
      requester.deviceId,
      room.roomId,
      input.reason,
      existingMemberIds,
    );
  }
  broadcastSnapshots();

  return {
    ok: true as const,
    room,
  };
}

function createPublicRoom(deviceId: string) {
  const device = devices.getById(deviceId);

  if (!device) {
    return {
      ok: false as const,
      code: 'DEVICE_NOT_FOUND' as const,
      message: 'The current device is no longer registered.',
    };
  }

  const { room } = rooms.ensurePublicRoom(device.deviceId, getRestoredPublicRoomId());

  broadcastSnapshots();

  return {
    ok: true as const,
    room,
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
      cancelPendingRoomExit(device.deviceId);
      rooms.ensurePublicRoom(device.deviceId, getRestoredPublicRoomId());

      const snapshot = devices.buildSnapshot(
        device.deviceId,
        sessions,
        rooms,
        history,
        uiState,
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

      connectDeviceToExistingRooms(device.deviceId);

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

    case 'update-room-state': {
      const room = rooms.getById(event.payload.roomId);
      if (!room || !room.memberIds.includes(activeDeviceId)) {
        emitError(socket, {
          code: 'ROOM_NOT_FOUND',
          message: 'No active room matches that room ID.',
        });
        return deviceId;
      }

      uiState.updateRoomState(activeDeviceId, event.payload);
      broadcastSnapshots();
      return deviceId;
    }

    case 'update-preferences': {
      uiState.updatePreferences(activeDeviceId, event.payload);
      broadcastSnapshots();
      return deviceId;
    }

    case 'request-snapshot': {
      const snapshot = devices.buildSnapshot(
        activeDeviceId,
        sessions,
        rooms,
        history,
        uiState,
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

    case 'join-room': {
      const result = joinRoomById({
        requesterId: activeDeviceId,
        roomId: event.payload.roomId,
        reason: 'manual',
      });

      if (!result.ok) {
        emitError(socket, result);
      }

      return deviceId;
    }

    case 'create-public-room': {
      const result = createPublicRoom(activeDeviceId);

      if (!result.ok) {
        emitError(socket, result);
        return deviceId;
      }

      send(socket, {
        type: 'public-room-created',
        payload: {
          roomId: result.room.roomId,
        },
      });

      return deviceId;
    }

    case 'request-connect': {
      const result = joinRoomViaTarget({
        requesterId: activeDeviceId,
        targetId: event.payload.targetDeviceId,
        reason: event.payload.reason ?? 'manual',
        createNewRoom: event.payload.createNewRoom,
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

    const removedDevice = devices.removeSocket(currentDeviceId, socket);
    if (!removedDevice) {
      return;
    }

    scheduleRoomExit(currentDeviceId);
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
    `ddzhilian signaling server listening on http://${config.host}:${config.port.toString()}`,
  );
  console.log(`WebSocket endpoint: ${config.publicWsUrl}`);
});
