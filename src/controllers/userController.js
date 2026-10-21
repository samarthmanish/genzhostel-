import * as userService from "../services/userService.js";
import * as reportService from "../services/reportService.js";
import { ApiError } from "../utils/ApiError.js";

/* ------------------------------ Users ------------------------------ */

export async function listUsersHandler(req, res, next) {
  try {
    const { page, limit, ...filters } = req.query;
    const result = await userService.listUsers({
      filters,
      pagination: { skip: (page - 1) * limit, take: limit },
    });
    res.json({ ...result, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function createUserHandler(req, res, next) {
  try {
    res.status(201).json(await userService.createUser(req.body, req.user));
  } catch (err) {
    next(err);
  }
}

export async function updateUserHandler(req, res, next) {
  try {
    res.json(await userService.updateUser(req.params.id, req.body, req.user));
  } catch (err) {
    next(err);
  }
}

export async function setActiveHandler(req, res, next) {
  try {
    res.json(await userService.setUserActive(req.params.id, req.body.isActive, req.user));
  } catch (err) {
    next(err);
  }
}

/** Self-service profile update (any authenticated user, narrow allowlist). */
export async function updateOwnProfileHandler(req, res, next) {
  try {
    res.json(await userService.updateOwnProfile(req.user, req.body));
  } catch (err) {
    next(err);
  }
}

/** Staff list for complaint assignment dropdowns. */
export async function listStaffHandler(req, res, next) {
  try {
    const { prisma } = await import("../utils/prisma.js");
    const staff = await prisma.user.findMany({
      where: { role: { in: ["WARDEN", "ADMIN"] }, isActive: true },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    });
    res.json({ items: staff });
  } catch (err) {
    next(err);
  }
}

/* ----------------------------- Reports ----------------------------- */

export async function occupancyReportHandler(req, res, next) {
  try {
    res.json(await reportService.occupancyReport());
  } catch (err) {
    next(err);
  }
}

export async function allocationsReportHandler(req, res, next) {
  try {
    res.json(await reportService.allocationsReport());
  } catch (err) {
    next(err);
  }
}

export async function complaintsReportHandler(req, res, next) {
  try {
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    res.json(await reportService.complaintsReport({ from, to }));
  } catch (err) {
    next(err);
  }
}

export async function statsHandler(req, res, next) {
  try {
    res.json(await reportService.systemStats());
  } catch (err) {
    next(err);
  }
}

export async function activityHandler(req, res, next) {
  try {
    res.json({ items: await reportService.recentActivity(12) });
  } catch (err) {
    next(err);
  }
}

export async function exportCsvHandler(req, res, next) {
  try {
    const csv = await reportService.exportCsv({ report: req.query.report });
    if (csv === null) {
      throw ApiError.badRequest("UNKNOWN_REPORT", "Unknown report type.");
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="hostel-${req.query.report}-report.csv"`
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
}
