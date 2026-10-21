import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordAudit } from "./auditService.js";
import { isStaff } from "../middleware/authorize.js";
import { config } from "../config/index.js";

export const OPEN_COMPLAINT_STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "REOPENED"];
export const RESOLVED_COMPLAINT_STATUSES = ["RESOLVED", "CLOSED"];

/** Student-allowed statuses: submit + reopen (within window). Everything else is staff-only. */
const STUDENT_ALLOWED_STATUS_CHANGE = new Set(["REOPENED"]);
const STAFF_STATUSES = new Set(["ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

export function serializeComplaint(c, viewer) {
  const staff = isStaff(viewer);
  const comments = (c.comments ?? [])
    // Students must never see INTERNAL staff notes — filtered server-side.
    .filter((cm) => staff || cm.visibility === "STUDENT_VISIBLE")
    .map((cm) => ({
      id: cm.id,
      message: cm.message,
      visibility: staff ? cm.visibility : "STUDENT_VISIBLE",
      authorName: cm.author?.fullName ?? "System",
      authorRole: cm.author?.role ?? null,
      at: cm.createdAt,
    }));

  const out = {
    id: c.id,
    title: c.title,
    category: c.category,
    description: c.description,
    priority: c.priority,
    status: c.status,
    submittedAt: c.submittedAt,
    resolvedAt: c.resolvedAt,
    room: c.room ? { id: c.room.id, roomNumber: c.room.roomNumber, blockName: c.room.block?.name } : null,
    comments,
  };
  if (staff) {
    out.student = c.student
      ? { id: c.student.id, fullName: c.student.fullName, studentId: c.student.studentId, email: c.student.email }
      : null;
    out.assignedTo = c.assignedTo ? { id: c.assignedTo.id, fullName: c.assignedTo.fullName } : null;
  } else {
    // For the owner student it is fine (and useful) to see who is handling it.
    out.assignedTo = c.assignedTo ? { fullName: c.assignedTo.fullName } : null;
  }
  if (c.history) {
    out.history = c.history
      .filter((h) => staff || !h.note || h.action !== "INTERNAL_NOTE")
      .map((h) => ({
        id: h.id,
        action: h.action,
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        note: staff ? h.note : null,
        actorName: h.actor?.fullName ?? "System",
        at: h.createdAt,
      }));
  }
  return out;
}

const FULL_INCLUDE = {
  student: { select: { id: true, fullName: true, studentId: true, email: true } },
  room: { select: { id: true, roomNumber: true, block: { select: { name: true } } } },
  assignedTo: { select: { id: true, fullName: true, role: true } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { fullName: true, role: true } } } },
  history: { orderBy: { createdAt: "asc" }, include: { actor: { select: { fullName: true } } } },
};

/* ------------------------------------------------------------------ */
/* Create (student)                                                    */
/* ------------------------------------------------------------------ */

export async function createComplaint(student, data) {
  if (data.roomId) {
    const room = await prisma.room.findUnique({ where: { id: data.roomId } });
    if (!room) throw ApiError.notFound("ROOM_NOT_FOUND", "Referenced room not found.");
  }

  const complaint = await prisma.complaint.create({
    data: {
      studentId: student.id,
      roomId: data.roomId ?? null,
      title: data.title.trim(),
      category: data.category,
      description: data.description.trim(),
      priority: data.priority ?? "NORMAL",
      status: "SUBMITTED",
    },
    include: FULL_INCLUDE,
  });

  await prisma.complaintHistory.create({
    data: { complaintId: complaint.id, actorId: student.id, action: "CREATED", newStatus: "SUBMITTED" },
  });
  await recordAudit({
    actorId: student.id, action: "COMPLAINT_CREATED", entityType: "Complaint",
    entityId: complaint.id, metadata: { category: complaint.category, priority: complaint.priority },
  });
  return serializeComplaint(complaint, student);
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function listMine(student, { filters = {}, pagination = {} } = {}) {
  const where = { studentId: student.id };
  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = filters.category;
  const [total, rows] = await Promise.all([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where, include: FULL_INCLUDE,
      orderBy: { submittedAt: "desc" }, ...pagination,
    }),
  ]);
  return { items: rows.map((r) => serializeComplaint(r, student)), total };
}

export async function listComplaintsStaff({ filters, pagination, actor }) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = filters.category;
  if (filters.priority) where.priority = filters.priority;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { student: { fullName: { contains: filters.q, mode: "insensitive" } } },
      { student: { studentId: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.olderThanDays) {
    const cutoff = new Date(Date.now() - Number(filters.olderThanDays) * 24 * 60 * 60 * 1000);
    where.submittedAt = { lt: cutoff };
  }
  const [total, rows] = await Promise.all([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where, include: FULL_INCLUDE,
      orderBy: [{ status: "asc" }, { submittedAt: "asc" }], ...pagination,
    }),
  ]);
  return { items: rows.map((r) => serializeComplaint(r, actor)), total };
}

export async function getComplaint(id, viewer) {
  const complaint = await prisma.complaint.findUnique({ where: { id }, include: FULL_INCLUDE });
  if (!complaint) throw ApiError.notFound("COMPLAINT_NOT_FOUND", "Complaint not found.");
  // Ownership check on the server: a student changing the ID in the URL
  // must never reach another student's complaint.
  if (!isStaff(viewer) && complaint.studentId !== viewer.id) {
    throw ApiError.forbidden("NOT_YOUR_COMPLAINT", "You can only view your own complaints.");
  }
  return serializeComplaint(complaint, viewer);
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

export async function addComment(complaintId, viewer, { message, visibility = "STUDENT_VISIBLE" }) {
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) throw ApiError.notFound("COMPLAINT_NOT_FOUND", "Complaint not found.");

  const staff = isStaff(viewer);
  if (!staff && complaint.studentId !== viewer.id) {
    throw ApiError.forbidden("NOT_YOUR_COMPLAINT", "You can only comment on your own complaints.");
  }
  // Only staff may write INTERNAL notes — reject the attempt explicitly.
  if (!staff && visibility === "INTERNAL") {
    throw ApiError.forbidden("INTERNAL_NOTES_STAFF_ONLY", "Only staff can add internal notes.");
  }
  const effectiveVisibility = staff ? visibility : "STUDENT_VISIBLE";

  const comment = await prisma.complaintComment.create({
    data: { complaintId, authorId: viewer.id, message: message.trim(), visibility: effectiveVisibility },
    include: { author: { select: { fullName: true, role: true } } },
  });

  await prisma.complaintHistory.create({
    data: {
      complaintId, actorId: viewer.id,
      action: effectiveVisibility === "INTERNAL" ? "INTERNAL_NOTE" : "COMMENT_ADDED",
      note: effectiveVisibility === "INTERNAL" ? message.trim().slice(0, 200) : null,
    },
  });

  return {
    id: comment.id,
    message: comment.message,
    visibility: comment.visibility,
    authorName: comment.author.fullName,
    authorRole: comment.author.role,
    at: comment.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Status + assignment (staff, plus student reopen window)             */
/* ------------------------------------------------------------------ */

export async function changeStatus(complaintId, viewer, { status, note = null }) {
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) throw ApiError.notFound("COMPLAINT_NOT_FOUND", "Complaint not found.");

  const staff = isStaff(viewer);

  if (!staff) {
    // Students may ONLY reopen their own resolved complaint, within the window.
    if (!STUDENT_ALLOWED_STATUS_CHANGE.has(status)) {
      throw ApiError.forbidden(
        "STAFF_ONLY_STATUS",
        "Students can only reopen a resolved complaint; other status changes are staff-only."
      );
    }
    if (complaint.studentId !== viewer.id) {
      throw ApiError.forbidden("NOT_YOUR_COMPLAINT", "You can only manage your own complaints.");
    }
    if (!RESOLVED_COMPLAINT_STATUSES.includes(complaint.status)) {
      throw ApiError.conflict("NOT_RESOLVED", "Only resolved or closed complaints can be reopened.");
    }
    const windowMs = config.COMPLAINT_REOPEN_WINDOW_HOURS * 60 * 60 * 1000;
    if (complaint.resolvedAt && Date.now() - complaint.resolvedAt.getTime() > windowMs) {
      throw ApiError.conflict(
        "REOPEN_WINDOW_EXPIRED",
        `Complaints can be reopened within ${config.COMPLAINT_REOPEN_WINDOW_HOURS} hours of resolution. Please submit a new complaint instead.`
      );
    }
    if (!note || !note.trim()) {
      throw ApiError.badRequest("REASON_REQUIRED", "Please explain why the issue is not resolved yet.");
    }
  } else {
    if (!STAFF_STATUSES.has(status)) {
      throw ApiError.badRequest("INVALID_STATUS", `Staff cannot set status ${status} directly.`);
    }
    // Closure/resolution must carry an explanatory, student-visible note.
    if (["RESOLVED", "CLOSED"].includes(status) && (!note || !note.trim())) {
      throw ApiError.badRequest("RESOLUTION_NOTE_REQUIRED", "Please add a short resolution note for the student.");
    }
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.complaint.update({
      where: { id: complaintId },
      data: {
        status,
        resolvedAt: status === "RESOLVED" ? now : status === "REOPENED" ? null : complaint.resolvedAt,
      },
    });
    await tx.complaintHistory.create({
      data: {
        complaintId,
        actorId: viewer.id,
        action: status === "REOPENED" ? "REOPENED" : "STATUS_CHANGED",
        previousStatus: complaint.status,
        newStatus: status,
        note: note ?? null,
      },
    });
    // A student-visible note also becomes a comment so it shows in the thread.
    if (note && note.trim() && (staff || status === "REOPENED")) {
      await tx.complaintComment.create({
        data: { complaintId, authorId: viewer.id, message: note.trim(), visibility: "STUDENT_VISIBLE" },
      });
    }
    return tx.complaint.findUnique({ where: { id: complaintId }, include: FULL_INCLUDE });
  });

  await recordAudit({
    actorId: viewer.id, action: "COMPLAINT_STATUS_CHANGED", entityType: "Complaint",
    entityId: complaintId, metadata: { from: complaint.status, to: status },
  });
  return serializeComplaint(updated, viewer);
}

export async function assignComplaint(complaintId, actor, { assignedToId }) {
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) throw ApiError.notFound("COMPLAINT_NOT_FOUND", "Complaint not found.");

  if (assignedToId) {
    const assignee = await prisma.user.findUnique({ where: { id: assignedToId } });
    if (!assignee || !["WARDEN", "ADMIN"].includes(assignee.role) || !assignee.isActive) {
      throw ApiError.badRequest("INVALID_ASSIGNEE", "Complaints can only be assigned to active wardens/admins.");
    }
  }

  const updated = await prisma.complaint.update({
    where: { id: complaintId },
    data: {
      assignedToId: assignedToId || null,
      // Assigning moves a fresh complaint into ASSIGNED unless already further along.
      status: assignedToId && complaint.status === "SUBMITTED" ? "ASSIGNED" : complaint.status,
    },
  });

  await prisma.complaintHistory.create({
    data: {
      complaintId, actorId: actor.id, action: "ASSIGNED",
      previousStatus: complaint.status, newStatus: updated.status,
      note: assignedToId ? `Assigned to staff member.` : `Assignment removed.`,
    },
  });
  const withHistory = await prisma.complaint.findUnique({ where: { id: complaintId }, include: FULL_INCLUDE });
  await recordAudit({
    actorId: actor.id, action: "COMPLAINT_ASSIGNED", entityType: "Complaint",
    entityId: complaintId, metadata: { assignedToId },
  });
  return serializeComplaint(withHistory, actor);
}
