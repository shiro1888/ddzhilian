import { randomUUID } from 'node:crypto';

import type { AdminAccountSession } from './account-registry.js';

const defaultSessionTtlMs = 7 * 24 * 60 * 60 * 1000;

type AdminSession = AdminAccountSession & {
  sessionId: string;
  createdAt: string;
  expiresAt: number;
};

export class AdminSessionRegistry {
  constructor(private readonly sessionTtlMs = defaultSessionTtlMs) {}

  private readonly sessions = new Map<string, AdminSession>();

  create(admin: AdminAccountSession) {
    const sessionId = randomUUID();
    const session: AdminSession = {
      ...admin,
      sessionId,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + this.sessionTtlMs,
    };

    this.sessions.set(sessionId, session);
    this.prune();
    return session;
  }

  get(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    return session;
  }

  delete(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  prune(now = Date.now()) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }
}
