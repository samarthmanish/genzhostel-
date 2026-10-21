import { z } from "zod";

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.");

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or student ID.").max(254),
  password: z.string().min(1, "Password is required.").max(128),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  studentId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,20}$/, "Student ID must be 3–20 letters, digits, or hyphens.")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{6,20}$/, "Enter a valid phone number.")
    .optional()
    .or(z.literal("")),
  course: z.string().trim().max(80).optional().or(z.literal("")),
  yearOfStudy: z.coerce.number().int().min(1).max(10).optional(),
  password,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
}).transform((d) => ({ ...d, studentId: d.studentId || undefined, phone: d.phone || undefined, course: d.course || undefined }));

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: password,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "New passwords do not match.",
  path: ["confirmPassword"],
});

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid record ID."),
});
