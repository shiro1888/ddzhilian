import type { AdminStateResponse } from '@/lib/ddzhilian-types'
import { createAdminAiSettingsFixture } from './admin-ai-settings'

export function createAdminStateFixture(
  overrides: Partial<AdminStateResponse> = {},
): AdminStateResponse {
  const now = '2026-06-10T08:00:00.000Z'

  return {
    authenticated: true,
    admin: {
      userId: 'admin-user-1',
      email: 'admin@example.com',
      role: 'super_admin',
      isSuperAdmin: true,
    },
    history: {
      fileCount: 2,
      textCount: 8,
      totalBytes: 2048,
      roomCount: 3,
      activeUserCount: 4,
      lastActivityAt: now,
      textTrendBuckets: [],
    },
    ai: createAdminAiSettingsFixture(),
    usage: {
      models: [],
      trendBuckets: [],
      cloudflareBudget: {
        date: '2026-06-10',
        usedNeurons: 10,
        dailyNeuronBudget: 1000,
        remainingNeurons: 990,
        freeOnly: true,
      },
    },
    onlineDevices: {
      devices: [],
      loadedAt: now,
    },
    users: {
      configured: true,
      users: [],
      loadedAt: now,
    },
    roles: {
      configured: true,
      roles: [],
      loadedAt: now,
    },
    themeSubmissions: {
      configured: true,
      storage: 'local',
      submissions: [],
      stats: {
        total: 0,
        listed: 0,
        uniqueDevices: 0,
      },
      loadedAt: now,
    },
    serverTime: now,
    ...overrides,
  }
}
