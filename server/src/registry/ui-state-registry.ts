import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type DevicePreferencesPayload,
  type RoomStateSummary,
} from '../protocol.js';

const STATE_ROOT = fileURLToPath(new URL('../../data/state', import.meta.url));
const INDEX_PATH = join(STATE_ROOT, 'index.json');

type StoredRoomState = RoomStateSummary;

type StoredState = {
  preferences?: Record<string, DevicePreferencesPayload>;
  roomStates?: Record<string, Record<string, StoredRoomState>>;
};

const defaultPreferences: DevicePreferencesPayload = {
  enterToSend: true,
};

export class UiStateRegistry {
  private readonly preferencesByDeviceId = new Map<string, DevicePreferencesPayload>();

  private readonly roomStatesByDeviceId = new Map<string, Map<string, StoredRoomState>>();

  constructor() {
    mkdirSync(STATE_ROOT, { recursive: true });
    this.load();
  }

  getPreferences(deviceId: string) {
    return this.preferencesByDeviceId.get(deviceId) ?? defaultPreferences;
  }

  updatePreferences(deviceId: string, patch: Partial<DevicePreferencesPayload>) {
    const next = {
      ...this.getPreferences(deviceId),
      ...patch,
    };

    this.preferencesByDeviceId.set(deviceId, next);
    this.persist();
    return next;
  }

  listRoomStates(deviceId: string, roomIds: string[]) {
    const states = this.roomStatesByDeviceId.get(deviceId);

    return roomIds.map<RoomStateSummary>((roomId) => ({
      roomId,
      pinned: states?.get(roomId)?.pinned ?? false,
      lastReadAt: states?.get(roomId)?.lastReadAt,
    }));
  }

  updateRoomState(
    deviceId: string,
    input: {
      roomId: string;
      pinned?: boolean;
      lastReadAt?: string;
    },
  ) {
    const states = this.roomStatesByDeviceId.get(deviceId) ?? new Map<string, StoredRoomState>();
    const current = states.get(input.roomId) ?? {
      roomId: input.roomId,
      pinned: false,
    };
    const next: StoredRoomState = {
      roomId: input.roomId,
      pinned: input.pinned ?? current.pinned,
      lastReadAt: input.lastReadAt ?? current.lastReadAt,
    };

    states.set(input.roomId, next);
    this.roomStatesByDeviceId.set(deviceId, states);
    this.persist();
    return next;
  }

  private load() {
    try {
      const parsed = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as StoredState;

      for (const [deviceId, preferences] of Object.entries(parsed.preferences ?? {})) {
        this.preferencesByDeviceId.set(deviceId, {
          ...defaultPreferences,
          ...preferences,
        });
      }

      for (const [deviceId, states] of Object.entries(parsed.roomStates ?? {})) {
        this.roomStatesByDeviceId.set(
          deviceId,
          new Map(
            Object.entries(states).map(([roomId, state]) => [
              roomId,
              {
                roomId,
                pinned: state.pinned,
                lastReadAt: state.lastReadAt,
              },
            ]),
          ),
        );
      }
    } catch {
      this.persist();
    }
  }

  private persist() {
    const preferences = Object.fromEntries(this.preferencesByDeviceId);
    const roomStates = Object.fromEntries(
      [...this.roomStatesByDeviceId.entries()].map(([deviceId, states]) => [
        deviceId,
        Object.fromEntries(states),
      ]),
    );

    mkdirSync(STATE_ROOT, { recursive: true });
    writeFileSync(
      INDEX_PATH,
      JSON.stringify({ preferences, roomStates }, null, 2),
      'utf8',
    );
  }
}
