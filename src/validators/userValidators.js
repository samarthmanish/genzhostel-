import { z } from "zod";
import { paginationSchema } from "../middleware/validate.js";

export const userListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  role: z.enum(["STUDENT", "WARDEN", "ADMIN"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  studentId: z.string().trim().regex(/^[A-Za-z0-9-]{3,20}$/, "Student ID must be 3–20 letters, digits, or hyphens.").optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, "Enter a valid phone number.").optional().or(z.literal("")),
  course: z.string().trim().max(80).optional().or(z.literal("")),
  yearOfStudy: z.coerce.number().int().min(1).max(10).optional(),
  role: z.enum(["STUDENT", "WARDEN", "ADMIN"], { errorMap: () => ({ message: "Select a valid role." }) }),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  isActive: z.boolean().default(true),
}).transform((d) => ({ ...d, studentId: d.studentId || null, phone: d.phone || null, course: d.course || null }));

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).optional(),
  studentId: z.string().trim().regex(/^[A-Za-z0-9-]{3,20}$/).optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/).optional().or(z.literal("")),
  course: z.string().trim().max(80).optional().or(z.literal("")),
  yearOfStudy: z.coerce.number().int().min(1).max(10).optional().nullable(),
  role: z.enum(["STUDENT", "WARDEN", "ADMIN"]).optional(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update." });

export const activeStatusSchema = z.object({
  isActive: z.boolean({ required_error: "isActive (true/false) is required." }),
});

/** Self-service profile: narrow allowlist — role/studentId/email are NOT editable here. */
export const ownProfileSchema = z.object({
  phone: z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, "Enter a valid phone number.").optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(120).optional().or(z.literal("")),
  emergencyContactPhone: z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, "Enter a valid emergency contact number.").optional().or(z.literal("")),
}).refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update." });

export const faqUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().trim().min(5).max(300),
  answer: z.string().trim().min(5).max(4000),
  intent: z.string().trim().min(2).max(60),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  isPublished: z.boolean().default(true),
});

export const reportQuerySchema = z.object({
  report: z.enum(["occupancy", "allocations", "complaints", "users"]),
});

export const complaintReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
