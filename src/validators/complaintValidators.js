import { z } from "zod";
import { paginationSchema } from "../middleware/validate.js";

export const CATEGORIES = ["MAINTENANCE", "CLEANLINESS", "WATER", "ELECTRICITY", "WIFI", "SECURITY", "OTHER"];
export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
export const STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"];

export const createComplaintSchema = z.object({
  title: z.string().trim().min(4, "Title must be at least 4 characters.").max(120, "Title must be at most 120 characters."),
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: "Select a valid complaint category." }) }),
  description: z.string().trim().min(10, "Please describe the issue in at least 10 characters.").max(4000),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  roomId: z.string().uuid("Select a valid room.").optional().nullable(),
});

export const complaintListQuerySchema = paginationSchema.extend({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedToId: z.string().uuid().optional(),
  olderThanDays: z.coerce.number().int().min(1).max(365).optional(),
  q: z.string().trim().max(80).optional(),
});

export const commentSchema = z.object({
  message: z.string().trim().min(1, "Comment cannot be empty.").max(2000),
  visibility: z.enum(["STUDENT_VISIBLE", "INTERNAL"]).default("STUDENT_VISIBLE"),
});

export const statusChangeSchema = z.object({
  status: z.enum(STATUSES, { errorMap: () => ({ message: "Invalid complaint status." }) }),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const assignSchema = z.object({
  assignedToId: z.string().uuid("Select a valid staff member.").nullable(),
});
