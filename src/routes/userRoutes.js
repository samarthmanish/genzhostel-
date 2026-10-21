import { Router } from "express";
import * as ctrl from "../controllers/userController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validators/authValidators.js";
import {
  userListQuerySchema, createUserSchema, updateUserSchema, activeStatusSchema,
  ownProfileSchema,
} from "../validators/userValidators.js";

const router = Router();
router.use(authenticate);

/* Self-service (any authenticated user) */
router.patch("/users/me/profile", validate({ body: ownProfileSchema }), ctrl.updateOwnProfileHandler);

/* Staff: list of wardens/admins for assignment dropdowns (no contact details) */
router.get("/users/staff", authorize("WARDEN", "ADMIN"), ctrl.listStaffHandler);

/* Admin: user management */
router.get("/users", authorize("ADMIN"), validate({ query: userListQuerySchema }), ctrl.listUsersHandler);
router.post("/users", authorize("ADMIN"), validate({ body: createUserSchema }), ctrl.createUserHandler);
router.patch("/users/:id", authorize("ADMIN"), validate({ params: idParamSchema, body: updateUserSchema }), ctrl.updateUserHandler);
router.patch("/users/:id/active-status", authorize("ADMIN"), validate({ params: idParamSchema, body: activeStatusSchema }), ctrl.setActiveHandler);

export default router;
