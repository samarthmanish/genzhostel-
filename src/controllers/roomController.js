import { prisma } from "../utils/prisma.js";
import * as roomService from "../services/roomService.js";
import { recordAudit } from "../services/auditService.js";
import { ApiError } from "../utils/ApiError.js";
import { invalidateFaqCache } from "../chatbot/faqService.js";

export async function listRoomsHandler(req, res, next) {
  try {
    const { page, limit, ...filters } = req.query;
    const result = await roomService.listRooms({
      filters: { ...filters, page, limit },
      viewer: req.user,
      pagination: { skip: (page - 1) * limit, take: limit },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getRoomHandler(req, res, next) {
  try {
    res.json(await roomService.getRoom(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

export async function createRoomHandler(req, res, next) {
  try {
    res.status(201).json(await roomService.createRoom(req.body, req.user));
  } catch (err) {
    next(err);
  }
}

export async function updateRoomHandler(req, res, next) {
  try {
    res.json(await roomService.updateRoom(req.params.id, req.body, req.user));
  } catch (err) {
    next(err);
  }
}

export async function setRoomStatusHandler(req, res, next) {
  try {
    res.json(await roomService.setRoomStatus(req.params.id, req.body.status, req.user));
  } catch (err) {
    next(err);
  }
}

/* ---------------- Hostel blocks (admin-managed config) ---------------- */

export async function listBlocksHandler(req, res, next) {
  try {
    const blocks = await prisma.hostelBlock.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { rooms: true } } },
    });
    res.json({
      items: blocks.map((b) => ({
        id: b.id, name: b.name, description: b.description,
        isActive: b.isActive, roomCount: b._count.rooms,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createBlockHandler(req, res, next) {
  try {
    const block = await prisma.hostelBlock.create({
      data: { name: req.body.name, description: req.body.description || null, isActive: req.body.isActive },
    });
    await recordAudit({ actorId: req.user.id, action: "BLOCK_CREATED", entityType: "HostelBlock", entityId: block.id, metadata: { name: block.name } });
    res.status(201).json(block);
  } catch (err) {
    next(err);
  }
}

export async function updateBlockHandler(req, res, next) {
  try {
    const block = await prisma.hostelBlock.update({ where: { id: req.params.id }, data: req.body });
    await recordAudit({ actorId: req.user.id, action: "BLOCK_UPDATED", entityType: "HostelBlock", entityId: block.id });
    res.json(block);
  } catch (err) {
    next(err);
  }
}

/* ---------------- FAQ config (admin) ---------------- */

export async function listFaqsAdminHandler(req, res, next) {
  try {
    const items = await prisma.hostelFAQ.findMany({ orderBy: { question: "asc" } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function upsertFaqHandler(req, res, next) {
  try {
    const { id, ...data } = req.body;
    const faq = id
      ? await prisma.hostelFAQ.update({ where: { id }, data })
      : await prisma.hostelFAQ.create({ data });
    invalidateFaqCache();
    await recordAudit({ actorId: req.user.id, action: id ? "FAQ_UPDATED" : "FAQ_CREATED", entityType: "HostelFAQ", entityId: faq.id });
    res.status(id ? 200 : 201).json(faq);
  } catch (err) {
    next(err);
  }
}

export async function deleteFaqHandler(req, res, next) {
  try {
    await prisma.hostelFAQ.delete({ where: { id: req.params.id } });
    invalidateFaqCache();
    await recordAudit({ actorId: req.user.id, action: "FAQ_DELETED", entityType: "HostelFAQ", entityId: req.params.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/** Enumerations the admin settings page shows (complaint categories etc.). */
export function settingsEnumsHandler(req, res) {
  res.json({
    roomTypes: ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "DORMITORY"],
    amenities: ["Wi-Fi", "Attached Bathroom", "Study Desk", "Wardrobe", "AC", "Geyser", "Balcony", "Laundry"],
    complaintCategories: ["MAINTENANCE", "CLEANLINESS", "WATER", "ELECTRICITY", "WIFI", "SECURITY", "OTHER"],
    complaintPriorities: ["LOW", "NORMAL", "HIGH", "URGENT"],
    complaintStatuses: ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"],
    allocationStatuses: ["PENDING", "APPROVED", "REJECTED", "ACTIVE", "VACATED", "CANCELLED"],
    reopenWindowHours: config_reopenWindow(),
  });
}

function config_reopenWindow() {
  // small indirection to avoid importing config at module top twice
  return Number(process.env.COMPLAINT_REOPEN_WINDOW_HOURS ?? 48);
}
