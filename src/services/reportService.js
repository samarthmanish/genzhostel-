import { prisma } from "../utils/prisma.js";
import { OCCUPYING_STATUSES, occupancyByRoom } from "./roomService.js";
import { OPEN_COMPLAINT_STATUSES } from "./complaintService.js";

/* ------------------------------------------------------------------ */
/* Dashboard summaries (all numbers come from live DB queries)         */
/* ------------------------------------------------------------------ */

export async function systemStats() {
  const [totalRooms, rooms, users, pendingRequests, openComplaints, activeAllocations] = await Promise.all([
    prisma.room.count({ where: { status: { notIn: ["INACTIVE"] } } }),
    prisma.room.findMany({ select: { id: true, capacity: true } }),
    prisma.user.count({ where: { role: "STUDENT", isActive: true } }),
    prisma.allocation.count({ where: { status: "PENDING" } }),
    prisma.complaint.count({ where: { status: { in: OPEN_COMPLAINT_STATUSES } } }),
    prisma.allocation.count({ where: { status: { in: OCCUPYING_STATUSES } } }),
  ]);
  const totalBeds = rooms.reduce((s, r) => s + r.capacity, 0);
  return {
    totalRooms,
    totalBeds,
    occupiedBeds: activeAllocations,
    availableBeds: Math.max(0, totalBeds - activeAllocations),
    activeStudents: users,
    pendingRequests,
    openComplaints,
    occupancyRate: totalBeds === 0 ? 0 : Math.round((activeAllocations / totalBeds) * 100),
  };
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export async function occupancyReport() {
  const [blocks, rooms] = await Promise.all([
    prisma.hostelBlock.findMany({ orderBy: { name: "asc" } }),
    prisma.room.findMany({
      select: { id: true, blockId: true, roomType: true, capacity: true, status: true },
    }),
  ]);
  const occ = await occupancyByRoom(rooms.map((r) => r.id));

  const byBlock = blocks.map((b) => {
    const blockRooms = rooms.filter((r) => r.blockId === b.id);
    const beds = blockRooms.reduce((s, r) => s + r.capacity, 0);
    const occupied = blockRooms.reduce((s, r) => s + (occ.get(r.id) ?? 0), 0);
    return {
      blockId: b.id,
      block: b.name,
      rooms: blockRooms.length,
      totalBeds: beds,
      occupiedBeds: occupied,
      availableBeds: Math.max(0, beds - occupied),
      occupancyRate: beds === 0 ? 0 : Math.round((occupied / beds) * 100),
    };
  });

  const typeMap = new Map();
  for (const r of rooms) {
    const entry = typeMap.get(r.roomType) ?? { roomType: r.roomType, rooms: 0, totalBeds: 0, occupiedBeds: 0 };
    entry.rooms += 1;
    entry.totalBeds += r.capacity;
    entry.occupiedBeds += occ.get(r.id) ?? 0;
    typeMap.set(r.roomType, entry);
  }
  const byRoomType = [...typeMap.values()].map((e) => ({
    ...e,
    availableBeds: Math.max(0, e.totalBeds - e.occupiedBeds),
    occupancyRate: e.totalBeds === 0 ? 0 : Math.round((e.occupiedBeds / e.totalBeds) * 100),
  }));

  return { byBlock, byRoomType, generatedAt: new Date().toISOString() };
}

export async function allocationsReport() {
  const rows = await prisma.allocation.groupBy({ by: ["status"], _count: { _all: true } });
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = r._count._all;

  const pending = await prisma.allocation.findMany({
    where: { status: "PENDING" },
    select: {
      id: true, requestedAt: true,
      student: { select: { fullName: true, studentId: true } },
    },
    orderBy: { requestedAt: "asc" },
  });

  return {
    byStatus,
    pendingRequests: pending.map((p) => ({
      id: p.id,
      studentName: p.student.fullName,
      studentId: p.student.studentId,
      requestedAt: p.requestedAt,
      waitingDays: Math.floor((Date.now() - p.requestedAt.getTime()) / 86400000),
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function complaintsReport({ from = null, to = null } = {}) {
  const range = {};
  if (from) range.gte = new Date(from);
  if (to) range.lte = new Date(to);
  const where = Object.keys(range).length ? { submittedAt: range } : {};

  const [byCategory, byStatus, byPriority, resolved] = await Promise.all([
    prisma.complaint.groupBy({ by: ["category"], where, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["priority"], where, _count: { _all: true } }),
    prisma.complaint.findMany({
      where: { ...where, resolvedAt: { not: null } },
      select: { submittedAt: true, resolvedAt: true },
    }),
  ]);

  const avgResolutionHours =
    resolved.length === 0
      ? null
      : Math.round(
          (resolved.reduce((s, c) => s + (c.resolvedAt - c.submittedAt), 0) /
            resolved.length /
            3600000) *
            10
        ) / 10;

  return {
    range: { from: from ?? null, to: to ?? null },
    byCategory: byCategory.map((r) => ({ category: r.category, count: r._count._all })),
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
    byPriority: byPriority.map((r) => ({ priority: r.priority, count: r._count._all })),
    avgResolutionHours,
    resolvedCount: resolved.length,
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* CSV export — formula-injection safe                                 */
/* ------------------------------------------------------------------ */

/** Escape a cell; neutralize spreadsheet formula prefixes (= + - @ etc.). */
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralize formula injection
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

export async function exportCsv({ report }) {
  if (report === "occupancy") {
    const data = await occupancyReport();
    return toCsv(
      ["Block", "Rooms", "Total beds", "Occupied", "Available", "Occupancy %"],
      data.byBlock.map((b) => [b.block, b.rooms, b.totalBeds, b.occupiedBeds, b.availableBeds, b.occupancyRate])
    );
  }
  if (report === "allocations") {
    const rows = await prisma.allocation.findMany({
      select: {
        id: true, status: true, requestedAt: true, decidedAt: true, startDate: true, endDate: true,
        student: { select: { fullName: true, studentId: true } },
        room: { select: { roomNumber: true, block: { select: { name: true } } } },
        decidedBy: { select: { fullName: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 1000,
    });
    return toCsv(
      ["Allocation ID", "Student", "Student ID", "Room", "Block", "Status", "Requested", "Decided", "Decided by", "Start", "End"],
      rows.map((r) => [
        r.id, r.student.fullName, r.student.studentId ?? "", r.room?.roomNumber ?? "",
        r.room?.block?.name ?? "", r.status, r.requestedAt.toISOString(),
        r.decidedAt?.toISOString() ?? "", r.decidedBy?.fullName ?? "",
        r.startDate?.toISOString() ?? "", r.endDate?.toISOString() ?? "",
      ])
    );
  }
  if (report === "complaints") {
    const rows = await prisma.complaint.findMany({
      select: {
        id: true, title: true, category: true, priority: true, status: true,
        submittedAt: true, resolvedAt: true,
        student: { select: { fullName: true, studentId: true } },
        room: { select: { roomNumber: true } },
        assignedTo: { select: { fullName: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 1000,
    });
    return toCsv(
      ["Complaint ID", "Title", "Category", "Priority", "Status", "Student", "Student ID", "Room", "Assigned to", "Submitted", "Resolved"],
      rows.map((c) => [
        c.id, c.title, c.category, c.priority, c.status, c.student.fullName,
        c.student.studentId ?? "", c.room?.roomNumber ?? "", c.assignedTo?.fullName ?? "",
        c.submittedAt.toISOString(), c.resolvedAt?.toISOString() ?? "",
      ])
    );
  }
  if (report === "users") {
    const rows = await prisma.user.findMany({
      select: { fullName: true, email: true, studentId: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 1000,
    });
    return toCsv(
      ["Name", "Email", "Student ID", "Role", "Active", "Created"],
      rows.map((u) => [u.fullName, u.email, u.studentId ?? "", u.role, u.isActive ? "yes" : "no", u.createdAt.toISOString()])
    );
  }
  return null;
}

/** Recent activity feed for dashboards (audit-backed). */
export async function recentActivity(limit = 10) {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { fullName: true, role: true } } },
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    actorName: l.actor?.fullName ?? "System",
    at: l.createdAt,
  }));
}
