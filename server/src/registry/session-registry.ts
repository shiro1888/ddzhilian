import {
  type PairReason,
  type SessionState,
  type TransportMode,
} from '../protocol.js';
import { createSessionId } from '../utils/id.js';

export interface PairSession {
  sessionId: string;
  roomId: string;
  initiatorId: string;
  responderId: string;
  state: SessionState;
  reason: PairReason;
  transportMode: TransportMode;
  createdAt: string;
  updatedAt: string;
}

function createPairKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join(':');
}

function createRoomPairKey(roomId: string, firstId: string, secondId: string) {
  return `${roomId}:${createPairKey(firstId, secondId)}`;
}

export class SessionRegistry {
  private readonly byId = new Map<string, PairSession>();

  private readonly byRoomPair = new Map<string, string>();

  ensureSession(input: {
    roomId: string;
    initiatorId: string;
    responderId: string;
    reason: PairReason;
    transportMode: TransportMode;
  }) {
    const pairKey = createRoomPairKey(
      input.roomId,
      input.initiatorId,
      input.responderId,
    );
    const existingId = this.byRoomPair.get(pairKey);

    if (existingId) {
      const existing = this.byId.get(existingId);

      if (existing && existing.state !== 'closed' && existing.state !== 'failed') {
        return {
          session: existing,
          created: false as const,
        };
      }

      if (existing) {
        this.delete(existing);
      }
    }

    const createdAt = new Date().toISOString();
    const session: PairSession = {
      sessionId: createSessionId(),
      roomId: input.roomId,
      initiatorId: input.initiatorId,
      responderId: input.responderId,
      state: 'connecting',
      reason: input.reason,
      transportMode: input.transportMode,
      createdAt,
      updatedAt: createdAt,
    };

    this.byId.set(session.sessionId, session);
    this.byRoomPair.set(pairKey, session.sessionId);

    return {
      session,
      created: true as const,
    };
  }

  getById(sessionId: string) {
    return this.byId.get(sessionId);
  }

  listForDevice(deviceId: string) {
    return [...this.byId.values()].filter(
      (session) =>
        session.state !== 'closed' &&
        (session.initiatorId === deviceId || session.responderId === deviceId),
    );
  }

  updateState(sessionId: string, state: SessionState) {
    const session = this.byId.get(sessionId);

    if (!session) {
      return undefined;
    }

    session.state = state;
    session.updatedAt = new Date().toISOString();

    return session;
  }

  closeSessionsForDevice(deviceId: string) {
    const sessions = this.listForDevice(deviceId);

    for (const session of sessions) {
      session.state = 'closed';
      session.updatedAt = new Date().toISOString();
    }

    return sessions;
  }

  prune(idleMs: number) {
    const now = Date.now();

    for (const session of [...this.byId.values()]) {
      if (session.state === 'closed') {
        this.delete(session);
        continue;
      }

      if (now - Date.parse(session.updatedAt) > idleMs) {
        session.state = 'closed';
        this.delete(session);
      }
    }
  }

  private delete(session: PairSession) {
    this.byId.delete(session.sessionId);
    this.byRoomPair.delete(
      createRoomPairKey(
        session.roomId,
        session.initiatorId,
        session.responderId,
      ),
    );
  }
}
