import { Router } from "express";
import * as ctrl from "../controllers/userController.js";
import * as roomCtrl from "../controllers/roomController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validators/authValidators.js";
import { reportQuerySchema, faqUpsertSchema } from "../validators/userValidators.js";

const router = Router();
router.use(authenticate);

// NOTE: authorize() must be applied per-route (not via router.use), because
// this router is mounted on /api/v1 and unmatched requests fall through to
// later routers — router-level middleware would run for ALL /api/v1 traffic.
const staff = authorize("WARDEN", "ADMIN");
const admin = authorize("ADMIN");

/* Reports & dashboard metrics — Warden/Admin only */
router.get("/reports/stats", staff, ctrl.statsHandler);
router.get("/reports/activity", staff, ctrl.activityHandler);
router.get("/reports/occupancy", staff, ctrl.occupancyReportHandler);
router.get("/reports/allocations", staff, ctrl.allocationsReportHandler);
router.get("/reports/complaints", staff, ctrl.complaintsReportHandler);
router.get("/reports/export.csv", staff, validate({ query: reportQuerySchema }), ctrl.exportCsvHandler);

/* Hostel configuration — Admin only (FAQ editing, enums) */
router.get("/settings/enums", staff, roomCtrl.settingsEnumsHandler);
router.get("/settings/faqs", admin, roomCtrl.listFaqsAdminHandler);
router.post("/settings/faqs", admin, validate({ body: faqUpsertSchema }), roomCtrl.upsertFaqHandler);
router.patch("/settings/faqs/:id", admin, validate({ params: idParamSchema, body: faqUpsertSchema }), roomCtrl.upsertFaqHandler);
router.delete("/settings/faqs/:id", admin, validate({ params: idParamSchema }), roomCtrl.deleteFaqHandler);

export default router;
