import { type PairReason } from '../protocol.js';
import { createRoomId } from '../utils/id.js';

export interface Room {
  roomId: string;
  memberIds: string[];
  reason: PairReason;
  isPublic: boolean;
  publicIndex?: number;
  lanKey?: string;
  createdAt: string;
  updatedAt: string;
}

export const publicRoomCount = 6;

function uniqueMemberIds(memberIds: string[]) {
  return [...new Set(memberIds)];
}

function compareRooms(left: Room, right: Room) {
  if (left.isPublic && right.isPublic) {
    return (left.publicIndex ?? publicRoomCount + 1) - (right.publicIndex ?? publicRoomCount + 1);
  }

  if (right.memberIds.length !== left.memberIds.length) {
    return right.memberIds.length - left.memberIds.length;
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

export class RoomRegistry {
  private readonly byId = new Map<string, Room>();

  private readonly roomIdsByMemberId = new Map<string, Set<string>>();

  private readonly byLanKey = new Map<string, string>();

  private readonly publicRoomIdsByIndex = new Map<number, string>();

  createRoom(input: {
    memberIds: string[];
    reason: PairReason;
    isPublic?: boolean;
    publicIndex?: number;
    lanKey?: string;
    roomId?: string;
  }) {
    const members = uniqueMemberIds(input.memberIds);
    const now = new Date().toISOString();
    let roomId = input.roomId || createRoomId();

    while (this.byId.has(roomId)) {
      roomId = createRoomId();
    }

    const room: Room = {
      roomId,
      memberIds: members,
      reason: input.reason,
      isPublic: input.isPublic ?? false,
      publicIndex: input.publicIndex,
      lanKey: input.lanKey,
      createdAt: now,
      updatedAt: now,
    };

    this.byId.set(room.roomId, room);

    if (room.lanKey) {
      this.byLanKey.set(room.lanKey, room.roomId);
    }

    if (room.isPublic && room.publicIndex) {
      this.publicRoomIdsByIndex.set(room.publicIndex, room.roomId);
    }

    for (const memberId of members) {
      this.indexMember(room.roomId, memberId);
    }

    return room;
  }

  getById(roomId: string) {
    return this.byId.get(roomId);
  }

  getByLanKey(lanKey: string) {
    const roomId = this.byLanKey.get(lanKey);
    return roomId ? this.byId.get(roomId) : undefined;
  }

  listForDevice(deviceId: string) {
    const roomIds = this.roomIdsByMemberId.get(deviceId);
    if (!roomIds) {
      return [];
    }

    return [...roomIds]
      .map((roomId) => this.byId.get(roomId))
      .filter((room): room is Room => Boolean(room))
      .sort(compareRooms);
  }

  getPreferredJoinRoomForDevice(deviceId: string) {
    return this.listForDevice(deviceId)[0];
  }

  shareRoom(firstDeviceId: string, secondDeviceId: string) {
    const firstRooms = this.roomIdsByMemberId.get(firstDeviceId);
    const secondRooms = this.roomIdsByMemberId.get(secondDeviceId);

    if (!firstRooms || !secondRooms) {
      return false;
    }

    for (const roomId of firstRooms) {
      if (secondRooms.has(roomId)) {
        return true;
      }
    }

    return false;
  }

  ensureLanRoom(deviceId: string, lanKey: string) {
    const existing = this.getByLanKey(lanKey);

    if (existing) {
      const existingMemberIds = [...existing.memberIds];
      const added = this.addMember(existing.roomId, deviceId);
      return {
        room: this.byId.get(existing.roomId)!,
        added,
        existingMemberIds,
      };
    }

    const room = this.createRoom({
      memberIds: [deviceId],
      reason: 'lan-discovery',
      lanKey,
    });

    return {
      room,
      added: true,
      existingMemberIds: [] as string[],
    };
  }

  ensurePublicRooms(deviceId: string, preferredPrimaryRoomId?: string) {
    return Array.from({ length: publicRoomCount }, (_, index) =>
      this.ensurePublicRoomAtIndex(
        deviceId,
        index + 1,
        index === 0 ? preferredPrimaryRoomId : undefined,
      ),
    );
  }

  ensurePublicRoom(deviceId: string, preferredRoomId?: string) {
    return this.ensurePublicRoomAtIndex(deviceId, 1, preferredRoomId);
  }

  private ensurePublicRoomAtIndex(deviceId: string, publicIndex: number, preferredRoomId?: string) {
    const existingId = this.publicRoomIdsByIndex.get(publicIndex);
    const existing = existingId
      ? this.byId.get(existingId)
      : undefined;

    if (existing) {
      const existingMemberIds = [...existing.memberIds];
      const added = this.addMember(existing.roomId, deviceId);
      return {
        room: this.byId.get(existing.roomId)!,
        added,
        existingMemberIds,
      };
    }

    const room = this.createRoom({
      memberIds: [deviceId],
      reason: 'manual',
      isPublic: true,
      publicIndex,
      roomId: preferredRoomId,
    });

    return {
      room,
      added: true,
      existingMemberIds: [] as string[],
    };
  }

  addMember(roomId: string, deviceId: string) {
    const room = this.byId.get(roomId);

    if (!room) {
      return false;
    }

    if (room.memberIds.includes(deviceId)) {
      this.touch(roomId);
      return false;
    }

    room.memberIds.push(deviceId);
    room.updatedAt = new Date().toISOString();
    this.indexMember(roomId, deviceId);

    return true;
  }

  touch(roomId: string) {
    const room = this.byId.get(roomId);
    if (!room) {
      return undefined;
    }

    room.updatedAt = new Date().toISOString();
    return room;
  }

  removeDevice(deviceId: string) {
    const roomIds = this.roomIdsByMemberId.get(deviceId);
    if (!roomIds) {
      return [];
    }

    const affectedRooms: Room[] = [];

    for (const roomId of [...roomIds]) {
      const room = this.byId.get(roomId);
      if (!room) {
        continue;
      }

      room.memberIds = room.memberIds.filter((memberId) => memberId !== deviceId);
      this.unindexMember(roomId, deviceId);

      if (room.memberIds.length === 0 && !room.isPublic) {
        this.deleteRoom(room);
        continue;
      }

      room.updatedAt = new Date().toISOString();
      affectedRooms.push(room);
    }

    this.roomIdsByMemberId.delete(deviceId);
    return affectedRooms.sort(compareRooms);
  }

  private indexMember(roomId: string, deviceId: string) {
    const roomIds = this.roomIdsByMemberId.get(deviceId) ?? new Set<string>();
    roomIds.add(roomId);
    this.roomIdsByMemberId.set(deviceId, roomIds);
  }

  private unindexMember(roomId: string, deviceId: string) {
    const roomIds = this.roomIdsByMemberId.get(deviceId);
    if (!roomIds) {
      return;
    }

    roomIds.delete(roomId);

    if (roomIds.size === 0) {
      this.roomIdsByMemberId.delete(deviceId);
    }
  }

  private deleteRoom(room: Room) {
    this.byId.delete(room.roomId);

    if (room.isPublic && room.publicIndex && this.publicRoomIdsByIndex.get(room.publicIndex) === room.roomId) {
      this.publicRoomIdsByIndex.delete(room.publicIndex);
    }

    if (room.lanKey && this.byLanKey.get(room.lanKey) === room.roomId) {
      this.byLanKey.delete(room.lanKey);
    }

    for (const memberId of room.memberIds) {
      this.unindexMember(room.roomId, memberId);
    }
  }
}
