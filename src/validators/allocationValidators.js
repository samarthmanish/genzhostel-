import { z } from "zod";
import { paginationSchema } from "../middleware/validate.js";

export const createRequestSchema = z.object({
  roomId: z.string().uuid("Select a valid room.").optional().nullable(),
  preferenceNote: z.string().trim().max(500, "Preference note must be at most 500 characters.").optional().nullable(),
});

export const approveSchema = z.object({
  roomId: z.string().uuid("Select the room to assign."),
  startDate: z.coerce.date().optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Please give the student a short reason (min 3 characters).").max(500),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "A reason is required (min 3 characters).").max(500),
});

export const transferSchema = z.object({
  toRoomId: z.string().uuid("Select the destination room."),
  reason: z.string().trim().min(3, "A reason is required (min 3 characters).").max(500),
});

export const allocationListQuerySchema = paginationSchema.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ACTIVE", "VACATED", "CANCELLED"]).optional(),
  blockId: z.string().uuid().optional(),
  q: z.string().trim().max(80).optional(),
});
