import { Router } from "express";
import * as ctrl from "../controllers/allocationController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validators/authValidators.js";
import {
  createRequestSchema, approveSchema, rejectSchema, reasonSchema, transferSchema,
  allocationListQuerySchema,
} from "../validators/allocationValidators.js";

const router = Router();
router.use(authenticate);

/* Student */
router.post("/allocations/requests", authorize("STUDENT"), validate({ body: createRequestSchema }), ctrl.createRequestHandler);
router.get("/allocations/mine", authorize("STUDENT"), ctrl.mineHandler);
router.post("/allocations/:id/cancel", authorize("STUDENT"), validate({ params: idParamSchema }), ctrl.cancelHandler);

/* Staff */
router.get("/allocations", authorize("WARDEN", "ADMIN"), validate({ query: allocationListQuerySchema }), ctrl.listHandler);

/* Owner or staff */
router.get("/allocations/:id", validate({ params: idParamSchema }), ctrl.getHandler);

/* Staff decisions */
router.post("/allocations/:id/approve", authorize("WARDEN", "ADMIN"), validate({ params: idParamSchema, body: approveSchema }), ctrl.approveHandler);
router.post("/allocations/:id/reject", authorize("WARDEN", "ADMIN"), validate({ params: idParamSchema, body: rejectSchema }), ctrl.rejectHandler);
router.post("/allocations/:id/vacate", authorize("WARDEN", "ADMIN"), validate({ params: idParamSchema, body: reasonSchema }), ctrl.vacateHandler);
router.post("/allocations/:id/transfer", authorize("WARDEN", "ADMIN"), validate({ params: idParamSchema, body: transferSchema }), ctrl.transferHandler);

export default router;
