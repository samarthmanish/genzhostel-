import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordAudit } from "./auditService.js";
import { isStaff } from "../middleware/authorize.js";
import { OCCUPYING_STATUSES, occupancyByRoom } from "./roomService.js";

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

export function serializeAllocation(a, viewer) {
  const out = {
    id: a.id,
    status: a.status,
    requestedAt: a.requestedAt,
    decidedAt: a.decidedAt,
    decisionReason: a.decisionReason,
    preferenceNote: a.preferenceNote,
    startDate: a.startDate,
    endDate: a.endDate,
    room: a.room
      ? {
          id: a.room.id,
          roomNumber: a.room.roomNumber,
          floor: a.room.floor,
          roomType: a.room.roomType,
          blockName: a.room.block?.name,
        }
      : null,
  };
  // Staff see which student an allocation belongs to; a student only ever
  // receives their own records, so exposing their own name back is fine.
  if (viewer && isStaff(viewer) && a.student) {
    out.student = {
      id: a.student.id,
      fullName: a.student.fullName,
      studentId: a.student.studentId,
      email: a.student.email,
      course: a.student.course,
      yearOfStudy: a.student.yearOfStudy,
    };
  }
  if (a.decidedBy) {
    out.decidedBy = { id: a.decidedBy.id, fullName: a.decidedBy.fullName };
  }
  if (a.history) {
    out.history = a.history.map((h) => ({
      id: h.id,
      action: h.action,
      previousStatus: h.previousStatus,
      newStatus: h.newStatus,
      reason: h.reason,
      actorName: h.actor?.fullName ?? "System",
      at: h.createdAt,
    }));
  }
  return out;
}

const FULL_INCLUDE = {
  student: { select: { id: true, fullName: true, studentId: true, email: true, course: true, yearOfStudy: true } },
  room: { select: { id: true, roomNumber: true, floor: true, roomType: true, block: { select: { name: true } } } },
  decidedBy: { select: { id: true, fullName: true } },
  history: {
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { fullName: true } } },
  },
};

/* ------------------------------------------------------------------ */
/* Student: create / cancel requests                                   */
/* ------------------------------------------------------------------ */

export async function createRequest(student, { roomId = null, preferenceNote = null }) {
  // Rule: one active allocation at a time.
  const active = await prisma.allocation.findFirst({
    where: { studentId: student.id, status: { in: OCCUPYING_STATUSES } },
  });
  if (active) {
    throw ApiError.conflict(
      "ALREADY_ALLOCATED",
      "You already have an active room allocation. Vacate it (via the warden) before requesting a new room."
    );
  }

  // Rule: no duplicate pending requests. (Also enforced by a DB partial unique index.)
  const pending = await prisma.allocation.findFirst({
    where: { studentId: student.id, status: "PENDING" },
  });
  if (pending) {
    throw ApiError.conflict(
      "DUPLICATE_REQUEST",
      "You already have a pending allocation request. Wait for a decision or cancel it first."
    );
  }

  if (roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw ApiError.notFound("ROOM_NOT_FOUND", "Preferred room not found.");
    if (room.status === "INACTIVE") {
      throw ApiError.unprocessable("ROOM_UNAVAILABLE", "That room is not accepting requests.");
    }
  }

  const allocation = await prisma.allocation.create({
    data: {
      studentId: student.id,
      roomId, // preference only — the warden makes the actual assignment
      status: "PENDING",
      preferenceNote,
    },
    include: FULL_INCLUDE,
  });

  await prisma.allocationHistory.create({
    data: {
      allocationId: allocation.id,
      actorId: student.id,
      action: "REQUESTED",
      newStatus: "PENDING",
      reason: preferenceNote,
    },
  });
  await recordAudit({
    actorId: student.id, action: "ALLOCATION_REQUESTED", entityType: "Allocation",
    entityId: allocation.id, metadata: { preferredRoomId: roomId },
  });

  return serializeAllocation(allocation, student);
}

export async function cancelRequest(allocationId, student) {
  const allocation = await prisma.allocation.findUnique({ where: { id: allocationId } });
  if (!allocation) throw ApiError.notFound("ALLOCATION_NOT_FOUND", "Allocation request not found.");
  if (allocation.studentId !== student.id) {
    throw ApiError.forbidden("NOT_YOUR_ALLOCATION", "You can only manage your own allocation requests.");
  }
  if (allocation.status !== "PENDING") {
    throw ApiError.conflict("NOT_CANCELLABLE", "Only pending requests can be cancelled.");
  }

  await prisma.allocation.update({
    where: { id: allocationId },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  await prisma.allocationHistory.create({
    data: {
      allocationId, actorId: student.id, action: "CANCELLED",
      previousStatus: "PENDING", newStatus: "CANCELLED",
    },
  });
  const updated = await prisma.allocation.findUnique({ where: { id: allocationId }, include: FULL_INCLUDE });
  await recordAudit({ actorId: student.id, action: "ALLOCATION_CANCELLED", entityType: "Allocation", entityId: allocationId });
  return serializeAllocation(updated, student);
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function listMine(student) {
  const rows = await prisma.allocation.findMany({
    where: { studentId: student.id },
    include: FULL_INCLUDE,
    orderBy: { requestedAt: "desc" },
    take: 50,
  });
  return rows.map((r) => serializeAllocation(r, student));
}

export async function listAllocations({ filters, pagination, actor }) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.blockId) where.room = { blockId: filters.blockId };
  if (filters.q) {
    where.OR = [
      { student: { fullName: { contains: filters.q, mode: "insensitive" } } },
      { student: { studentId: { contains: filters.q, mode: "insensitive" } } },
      { room: { roomNumber: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.allocation.count({ where }),
    prisma.allocation.findMany({
      where,
      include: FULL_INCLUDE,
      orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
      ...pagination,
    }),
  ]);
  return { items: rows.map((r) => serializeAllocation(r, actor)), total };
}

export async function getAllocation(id, viewer) {
  const allocation = await prisma.allocation.findUnique({ where: { id }, include: FULL_INCLUDE });
  if (!allocation) throw ApiError.notFound("ALLOCATION_NOT_FOUND", "Allocation not found.");
  // Ownership: students may ONLY see their own allocation. Changing an ID in
  // the URL must never leak another student's record.
  if (!isStaff(viewer) && allocation.studentId !== viewer.id) {
    throw ApiError.forbidden("NOT_YOUR_ALLOCATION", "You can only view your own allocation records.");
  }
  return serializeAllocation(allocation, viewer);
}

/* ------------------------------------------------------------------ */
/* Staff decisions — all inside transactions with row locks            */
/* ------------------------------------------------------------------ */

/**
 * Lock a room row and re-check capacity at commit time. This serializes two
 * wardens approving requests for the same last bed: the second transaction
 * blocks on the lock, then sees the updated occupancy and fails safely.
 */
async function lockRoomAndCheckCapacity(tx, roomId, excludeAllocationId = null) {
  const locked = await tx.$queryRaw`
    SELECT id, capacity, status FROM "rooms" WHERE id = ${roomId} FOR UPDATE
  `;
  if (locked.length === 0) {
    throw ApiError.notFound("ROOM_NOT_FOUND", "Room not found.");
  }
  const room = locked[0];
  if (room.status === "MAINTENANCE" || room.status === "INACTIVE") {
    throw ApiError.conflict(
      "ROOM_NOT_ALLOCATABLE",
      `This room is marked ${room.status.toLowerCase()} and cannot receive new allocations.`
    );
  }
  const occupancy = await tx.allocation.count({
    where: {
      roomId,
      status: { in: OCCUPYING_STATUSES },
      ...(excludeAllocationId ? { id: { not: excludeAllocationId } } : {}),
    },
  });
  if (occupancy >= room.capacity) {
    throw ApiError.conflict(
      "ROOM_CAPACITY_EXCEEDED",
      "This room does not have enough available capacity — the last bed was just taken."
    );
  }
  return { room, occupancy };
}

async function assertStudentHasNoOtherActive(tx, studentId, excludeAllocationId) {
  const other = await tx.allocation.findFirst({
    where: {
      studentId,
      status: { in: OCCUPYING_STATUSES },
      id: { not: excludeAllocationId },
    },
  });
  if (other) {
    throw ApiError.conflict(
      "STUDENT_ALREADY_ACTIVE",
      "This student already has an active allocation. Vacate it before assigning a new room."
    );
  }
}

/** Sync the stored AVAILABLE/FULL flag after any occupancy change. */
async function syncRoomFullFlag(tx, roomId) {
  const room = await tx.room.findUnique({ where: { id: roomId } });
  if (!room) return;
  if (room.status === "MAINTENANCE" || room.status === "INACTIVE") return;
  const occupancy = await tx.allocation.count({
    where: { roomId, status: { in: OCCUPYING_STATUSES } },
  });
  const next = occupancy >= room.capacity ? "FULL" : "AVAILABLE";
  if (next !== room.status) await tx.room.update({ where: { id: roomId }, data: { status: next } });
}

export async function approveAllocation(allocationId, { roomId, startDate = null, reason = null }, actor) {
  if (!roomId) {
    throw ApiError.badRequest("ROOM_REQUIRED", "Select a room to assign when approving a request.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const allocation = await tx.allocation.findUnique({ where: { id: allocationId } });
    if (!allocation) throw ApiError.notFound("ALLOCATION_NOT_FOUND", "Allocation request not found.");
    if (allocation.status !== "PENDING") {
      throw ApiError.conflict("ALREADY_DECIDED", `This request is already ${allocation.status.toLowerCase()}.`);
    }

    // Row lock + capacity re-check at commit time (prevents double-booking)
    await lockRoomAndCheckCapacity(tx, roomId);
    await assertStudentHasNoOtherActive(tx, allocation.studentId, allocation.id);

    await tx.allocation.update({
      where: { id: allocationId },
      data: {
        status: "ACTIVE",
        roomId,
        decidedAt: new Date(),
        decidedById: actor.id,
        decisionReason: reason,
        startDate: startDate ? new Date(startDate) : new Date(),
      },
    });

    await tx.allocationHistory.create({
      data: {
        allocationId, actorId: actor.id, action: "APPROVED",
        previousStatus: "PENDING", newStatus: "ACTIVE", reason,
      },
    });
    await syncRoomFullFlag(tx, roomId);
    // Re-fetch so the response includes the history entry just written.
    return tx.allocation.findUnique({ where: { id: allocationId }, include: FULL_INCLUDE });
  }, { isolationLevel: "ReadCommitted", timeout: 10000 });

  await recordAudit({
    actorId: actor.id, action: "ALLOCATION_APPROVED", entityType: "Allocation",
    entityId: allocationId, metadata: { roomId, reason },
  });
  return serializeAllocation(result, actor);
}

export async function rejectAllocation(allocationId, { reason }, actor) {
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest("REASON_REQUIRED", "A rejection reason is required so the student understands the decision.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const allocation = await tx.allocation.findUnique({ where: { id: allocationId } });
    if (!allocation) throw ApiError.notFound("ALLOCATION_NOT_FOUND", "Allocation request not found.");
    if (allocation.status !== "PENDING") {
      throw ApiError.conflict("ALREADY_DECIDED", `This request is already ${allocation.status.toLowerCase()}.`);
    }
    const prevRoomId = allocation.roomId;
    await tx.allocation.update({
      where: { id: allocationId },
      data: { status: "REJECTED", decidedAt: new Date(), decidedById: actor.id, decisionReason: reason },
    });
    await tx.allocationHistory.create({
      data: {
        allocationId, actorId: actor.id, action: "REJECTED",
        previousStatus: "PENDING", newStatus: "REJECTED", reason,
      },
    });
    if (prevRoomId) await syncRoomFullFlag(tx, prevRoomId);
    return tx.allocation.findUnique({ where: { id: allocationId }, include: FULL_INCLUDE });
  });

  await recordAudit({
    actorId: actor.id, action: "ALLOCATION_REJECTED", entityType: "Allocation",
    entityId: allocationId, metadata: { reason },
  });
  return serializeAllocation(updated, actor);
}

export async function vacateAllocation(allocationId, { reason }, actor) {
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest("REASON_REQUIRED", "A reason is required to vacate an allocation.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const allocation = await tx.allocation.findUnique({ where: { id: allocationId } });
    if (!allocation) throw ApiError.notFound("ALLOCATION_NOT_FOUND", "Allocation not found.");
    if (!OCCUPYING_STATUSES.includes(allocation.status)) {
      throw ApiError.conflict("NOT_ACTIVE", "Only an active allocation can be vacated.");
    }
    await tx.allocation.update({
      where: { id: allocationId },
      data: { status: "VACATED", endDate: new Date(), decidedAt: new Date(), decidedById: actor.id, decisionReason: reason },
    });
    await tx.allocationHistory.create({
      data: {
        allocationId, actorId: actor.id, action: "VACATED",
        previousStatus: allocation.status, newStatus: "VACATED", reason,
      },
    });
    if (allocation.roomId) await syncRoomFullFlag(tx, allocation.roomId);
    return tx.allocation.findUnique({ where: { id: allocationId }, include: FULL_INCLUDE });
  });

  await recordAudit({
    actorId: actor.id, action: "ALLOCATION_VACATED", entityType: "Allocation",
    entityId: allocationId, metadata: { reason },
  });
  return serializeAllocation(updated, actor);
}

export async function transferAllocation(allocationId, { toRoomId, reason }, actor) {
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest("REASON_REQUIRED", "A reason is required to transfer an allocation.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const allocation = await tx.allocation.findUnique({ where: { id: allocationId } });
    if (!allocation) throw ApiError.notFound("ALLOCATION_NOT_FOUND", "Allocation not found.");
    if (!OCCUPYING_STATUSES.includes(allocation.status)) {
      throw ApiError.conflict("NOT_ACTIVE", "Only an active allocation can be transferred.");
    }
    if (allocation.roomId === toRoomId) {
      throw ApiError.badRequest("SAME_ROOM", "The student is already in that room.");
    }

    // Lock the target room and re-check capacity inside the transaction
    await lockRoomAndCheckCapacity(tx, toRoomId);

    await tx.allocation.update({
      where: { id: allocationId },
      data: { roomId: toRoomId },
    });
    await tx.allocationHistory.create({
      data: {
        allocationId, actorId: actor.id, action: "TRANSFERRED",
        previousStatus: allocation.status, newStatus: allocation.status,
        reason: `Transferred to new room. ${reason}`,
      },
    });
    if (allocation.roomId) await syncRoomFullFlag(tx, allocation.roomId);
    await syncRoomFullFlag(tx, toRoomId);
    return tx.allocation.findUnique({ where: { id: allocationId }, include: FULL_INCLUDE });
  });

  await recordAudit({
    actorId: actor.id, action: "ALLOCATION_TRANSFERRED", entityType: "Allocation",
    entityId: allocationId, metadata: { toRoomId, reason },
  });
  return serializeAllocation(updated, actor);
}

/** Dashboard metric helper: pending request count. */
export async function countByStatus() {
  const rows = await prisma.allocation.groupBy({ by: ["status"], _count: { _all: true } });
  const out = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

export { occupancyByRoom };
