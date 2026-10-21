import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordAudit } from "./auditService.js";
import { config } from "../config/index.js";

const BCRYPT_ROUNDS = 10;

export function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

/**
 * Login by email OR student ID + password.
 * Generic error for any credential mismatch — never reveal which part failed.
 */
export async function login(identifier, password) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: identifier, mode: "insensitive" } },
        { studentId: { equals: identifier, mode: "insensitive" } },
      ],
    },
  });

  if (!user) {
    // Hash anyway to reduce timing signal between known/unknown accounts
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
    throw ApiError.unauthorized("INVALID_CREDENTIALS", "Incorrect identifier or password.");
  }

  if (!user.isActive) {
    throw ApiError.forbidden("ACCOUNT_DEACTIVATED", "This account has been deactivated. Contact the hostel office.");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized("INVALID_CREDENTIALS", "Incorrect identifier or password.");
  }

  await recordAudit({ actorId: user.id, action: "USER_LOGIN", entityType: "User", entityId: user.id });
  return user;
}

/**
 * Self-registration — students only, and only when ALLOW_SELF_REGISTRATION is on.
 * Role is forced to STUDENT server-side; clients can never self-assign staff roles.
 */
export async function registerStudent(data) {
  if (!config.ALLOW_SELF_REGISTRATION) {
    throw ApiError.forbidden(
      "REGISTRATION_DISABLED",
      "Self-registration is disabled. Please ask the hostel office to create your account."
    );
  }

  const conditions = [{ email: { equals: data.email, mode: "insensitive" } }];
  if (data.studentId) {
    conditions.push({ studentId: data.studentId });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: conditions },
    select: { email: true, studentId: true },
  });
  if (existing) {
    if (existing.email?.toLowerCase() === data.email.toLowerCase()) {
      throw ApiError.conflict("EMAIL_TAKEN", "An account with this email already exists.");
    }
    if (data.studentId && existing.studentId === data.studentId) {
      throw ApiError.conflict("STUDENT_ID_TAKEN", "This student ID is already registered.");
    }
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      studentId: data.studentId || null,
      phone: data.phone ?? null,
      course: data.course ?? null,
      yearOfStudy: data.yearOfStudy ?? null,
      passwordHash,
      role: "STUDENT", // enforced server-side
      isActive: true,
    },
  });

  await recordAudit({
    actorId: user.id,
    action: "USER_REGISTERED",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role, via: "self-registration" },
  });
  return user;
}

/** Change own password: requires current password. */
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("USER_NOT_FOUND", "Account not found.");

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized("INVALID_PASSWORD", "Your current password is incorrect.");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await recordAudit({ actorId: userId, action: "PASSWORD_CHANGED", entityType: "User", entityId: userId });
}

export { BCRYPT_ROUNDS };
