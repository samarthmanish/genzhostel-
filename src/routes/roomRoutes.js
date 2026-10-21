import { Router } from "express";
import * as ctrl from "../controllers/roomController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate, paginationSchema } from "../middleware/validate.js";
import { idParamSchema } from "../validators/authValidators.js";
import {
  roomListQuerySchema, createRoomSchema, updateRoomSchema, roomStatusSchema,
  createBlockSchema, updateBlockSchema,
} from "../validators/roomValidators.js";

const router = Router();
router.use(authenticate);

/* Rooms */
router.get("/rooms", validate({ query: roomListQuerySchema }), ctrl.listRoomsHandler);
router.get("/rooms/:id", validate({ params: idParamSchema }), ctrl.getRoomHandler);
router.post("/rooms", authorize("WARDEN", "ADMIN"), validate({ body: createRoomSchema }), ctrl.createRoomHandler);
router.patch("/rooms/:id", authorize("WARDEN", "ADMIN"), validate({ params: idParamSchema, body: updateRoomSchema }), ctrl.updateRoomHandler);
router.patch("/rooms/:id/status", authorize("WARDEN", "ADMIN"), validate({ params: idParamSchema, body: roomStatusSchema }), ctrl.setRoomStatusHandler);

/* Hostel blocks */
router.get("/blocks", ctrl.listBlocksHandler);
router.post("/blocks", authorize("ADMIN"), validate({ body: createBlockSchema }), ctrl.createBlockHandler);
router.patch("/blocks/:id", authorize("ADMIN"), validate({ params: idParamSchema, body: updateBlockSchema }), ctrl.updateBlockHandler);

export default router;
