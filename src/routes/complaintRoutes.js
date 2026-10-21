import { Router } from "express";
import * as ctrl from "../controllers/complaintController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validators/authValidators.js";
import {
  createComplaintSchema, complaintListQuerySchema, commentSchema,
  statusChangeSchema, assignSchema,
} from "../validators/complaintValidators.js";

const router = Router();
router.use(authenticate);

/* Student */
router.post("/complaints", authorize("STUDENT"), validate({ body: createComplaintSchema }), ctrl.createHandler);
router.get("/complaints/mine", authorize("STUDENT"), validate({ query: complaintListQuerySchema }), ctrl.mineHandler);

/* Staff queue */
router.get("/complaints", authorize("WARDEN", "ADMIN"), validate({ query: complaintListQuerySchema }), ctrl.listHandler);

/* Owner or staff (ownership enforced in the service) */
router.get("/complaints/:id", validate({ params: idParamSchema }), ctrl.getHandler);
router.post("/complaints/:id/comments", validate({ params: idParamSchema, body: commentSchema }), ctrl.commentHandler);
router.patch("/complaints/:id/status", validate({ params: idParamSchema, body: statusChangeSchema }), ctrl.statusHandler);

/* Staff only */
router.patch("/complaints/:id/assignment", authorize("WARDEN", "ADMIN"), validate({ params: idParamSchema, body: assignSchema }), ctrl.assignHandler);

export default router;
