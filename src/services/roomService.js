import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordAudit } from "./auditService.js";
import { isStaff } from "../middleware/authorize.js";

/** Allocation statuses that occupy a bed. */
export const OCCUPYING_STATUSES = ["ACTIVE", "APPROVED"];

/** Compute occupancy for many rooms in one grouped query (no N+1). */
export async function occupancyByRoom(roomIds) {
  if (roomIds.length === 0) return new Map();
  const rows = await prisma.allocation.groupBy({
    by: ["roomId"],
    where: { roomId: { in: roomIds }, status: { in: OCCUPYING_STATUSES } },
    _count: { _all: true },
  });
  const map = new Map(rows.map((r) => [r.roomId, r._count._all]));
  return new Map(roomIds.map((id) => [id, map.get(id) ?? 0]));
}

/**
 * Effective availability status is always derived from real active
 * allocations — MAINTENANCE/INACTIVE are staff-managed overrides.
 */
export function effectiveStatus(room, occupancy) {
  if (room.status === "MAINTENANCE" || room.status === "INACTIVE") return room.status;
  return occupancy >= room.capacity ? "FULL" : "AVAILABLE";
}

export function serializeRoom(room, occupancy, viewer) {
  const status = effectiveStatus(room, occupancy);
  const out = {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor,
    roomType: room.roomType,
    capacity: room.capacity,
    amenities: room.amenities,
    status,
    storedStatus: room.status,
    occupancy,
    availableBeds: Math.max(0, room.capacity - occupancy),
    canRequest: status === "AVAILABLE",
    block: room.block
      ? { id: room.block.id, name: room.block.name }
      : undefined,
  };
  // Residents list: staff only. Students never see other students' data.
  if (viewer && isStaff(viewer) && room.allocations) {
    out.residents = room.allocations
      .filter((a) => OCCUPYING_STATUSES.includes(a.status))
      .map((a) => ({
        allocationId: a.id,
        studentName: a.student.fullName,
        studentId: a.student.studentId,
        since: a.startDate ?? a.requestedAt,
      }));
  }
  return out;
}

const ROOM_SELECT = {
  id: true, roomNumber: true, floor: true, roomType: true, capacity: true,
  status: true, amenities: true, createdAt: true, updatedAt: true,
  block: { select: { id: true, name: true } },
};

export async function listRooms({ filters, viewer, pagination }) {
  const where = {};
  if (filters.blockId) where.blockId = filters.blockId;
  if (filters.roomType) where.roomType = filters.roomType;
  if (filters.amenity) where.amenities = { has: filters.amenity };
  if (filters.q) {
    where.OR = [
      { roomNumber: { contains: filters.q, mode: "insensitive" } },
      { block: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.status && ["MAINTENANCE", "INACTIVE"].includes(filters.status)) {
    where.status = filters.status;
  }

  // Exclude inactive rooms from the student-facing directory
  if (viewer && !isStaff(viewer)) where.status = { notIn: ["INACTIVE"] };

  const [total, rooms] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({
      where,
      select: { ...ROOM_SELECT, allocations: viewer && isStaff(viewer)
        ? { select: { id: true, status: true, startDate: true, requestedAt: true,
            student: { select: { fullName: true, studentId: true } } },
            orderBy: { requestedAt: "asc" } }
        : false },
      orderBy: [{ block: { name: "asc" } }, { floor: "asc" }, { roomNumber: "asc" }],
      ...pagination,
    }),
  ]);

  const occ = await occupancyByRoom(rooms.map((r) => r.id));

  let items = rooms.map((r) => serializeRoom(r, occ.get(r.id) ?? 0, viewer));

  // Derived availability filters (computed AFTER occupancy is known)
  if (filters.availability === "available") items = items.filter((r) => r.status === "AVAILABLE");
  if (filters.availability === "full") items = items.filter((r) => r.status === "FULL");

  return { items, total, page: filters.page, limit: filters.limit };
}

export async function getRoom(id, viewer) {
  const room = await prisma.room.findUnique({
    where: { id },
    select: { ...ROOM_SELECT, allocations: isStaff(viewer)
      ? { select: { id: true, status: true, startDate: true, requestedAt: true,
          student: { select: { fullName: true, studentId: true, email: true } } },
        orderBy: { requestedAt: "asc" } }
      : false },
  });
  if (!room) throw ApiError.notFound("ROOM_NOT_FOUND", "Room not found.");
  const occ = await occupancyByRoom([room.id]);
  return serializeRoom(room, occ.get(room.id) ?? 0, viewer);
}

async function assertCapacityNotBelowOccupancy(roomId, newCapacity) {
  const occ = (await occupancyByRoom([roomId])).get(roomId) ?? 0;
  if (newCapacity < occ) {
    throw ApiError.unprocessable(
      "CAPACITY_BELOW_OCCUPANCY",
      `Cannot set capacity to ${newCapacity}: the room currently has ${occ} active occupant(s). Vacate or transfer allocations first.`
    );
  }
}

export async function createRoom(data, actor) {
  if (!Number.isInteger(data.capacity) || data.capacity < 1) {
    throw ApiError.unprocessable("INVALID_CAPACITY", "Capacity must be a positive integer.");
  }
  const block = await prisma.hostelBlock.findUnique({ where: { id: data.blockId } });
  if (!block) throw ApiError.notFound("BLOCK_NOT_FOUND", "Hostel block not found.");

  const dup = await prisma.room.findFirst({
    where: { blockId: data.blockId, roomNumber: data.roomNumber },
  });
  if (dup) {
    throw ApiError.conflict("ROOM_EXISTS", `Room ${data.roomNumber} already exists in ${block.name}.`);
  }

  const room = await prisma.room.create({
    data: {
      blockId: data.blockId,
      roomNumber: data.roomNumber,
      floor: data.floor,
      roomType: data.roomType,
      capacity: data.capacity,
      status: data.status ?? "AVAILABLE",
      amenities: data.amenities ?? [],
    },
    select: ROOM_SELECT,
  });
  await recordAudit({ actorId: actor.id, action: "ROOM_CREATED", entityType: "Room", entityId: room.id,
    metadata: { roomNumber: room.roomNumber, blockId: room.blockId, capacity: room.capacity } });
  return serializeRoom(room, 0, actor);
}

export async function updateRoom(id, data, actor) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw ApiError.notFound("ROOM_NOT_FOUND", "Room not found.");

  if (data.capacity != null) {
    if (!Number.isInteger(data.capacity) || data.capacity < 1) {
      throw ApiError.unprocessable("INVALID_CAPACITY", "Capacity must be a positive integer.");
    }
    await assertCapacityNotBelowOccupancy(id, data.capacity);
  }

  const updated = await prisma.room.update({
    where: { id },
    data: {
      ...(data.blockId !== undefined ? { blockId: data.blockId } : {}),
      ...(data.roomNumber !== undefined ? { roomNumber: data.roomNumber } : {}),
      ...(data.floor !== undefined ? { floor: data.floor } : {}),
      ...(data.roomType !== undefined ? { roomType: data.roomType } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.amenities !== undefined ? { amenities: data.amenities } : {}),
    },
    select: ROOM_SELECT,
  });
  await recordAudit({ actorId: actor.id, action: "ROOM_UPDATED", entityType: "Room", entityId: id, metadata: data });
  const occ = await occupancyByRoom([id]);
  return serializeRoom(updated, occ.get(id) ?? 0, actor);
}

export async function setRoomStatus(id, status, actor) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw ApiError.notFound("ROOM_NOT_FOUND", "Room not found.");

  const occ = (await occupancyByRoom([id])).get(id) ?? 0;

  // Taking a room out of service while occupied requires explicit acknowledgement
  if (["MAINTENANCE", "INACTIVE"].includes(status) && occ > 0) {
    throw ApiError.conflict(
      "ROOM_OCCUPIED",
      `Room has ${occ} active occupant(s). Transfer or vacate them before marking it ${status.toLowerCase()}.`
    );
  }
  // INACTIVE rooms are kept for history; deletion is blocked by design.
  const updated = await prisma.room.update({
    where: { id },
    data: { status },
    select: ROOM_SELECT,
  });
  await recordAudit({ actorId: actor.id, action: "ROOM_STATUS_CHANGED", entityType: "Room", entityId: id,
    metadata: { from: room.status, to: status } });
  return serializeRoom(updated, occ, actor);
}

/** Rooms are never hard-deleted when allocations reference them — deactivate instead. */
export async function deactivateRoom(id, actor) {
  return setRoomStatus(id, "INACTIVE", actor);
}
