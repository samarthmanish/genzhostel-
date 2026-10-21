import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { recordAudit } from "./auditService.js";
import { BCRYPT_ROUNDS, publicUser } from "./authService.js";

export async function listUsers({ filters, pagination }) {
  const where = {};
  if (filters.role) where.role = filters.role;
  if (filters.isActive !== undefined) where.isActive = filters.isActive === "true";
  if (filters.q) {
    where.OR = [
      { fullName: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { studentId: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      ...pagination,
    }),
  ]);
  return { items: rows.map(publicUser), total };
}

export async function createUser(data, actor) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: data.email, mode: "insensitive" } },
        ...(data.studentId ? [{ studentId: data.studentId }] : []),
      ],
    },
    select: { id: true, email: true, studentId: true },
  });
  if (existing) {
    throw ApiError.conflict("USER_EXISTS", "A user with this email or student ID already exists.");
  }
  if (data.studentId && data.role !== "STUDENT") {
    throw ApiError.badRequest("STUDENT_ID_STAFF", "Only student accounts may carry a student ID.");
  }

  const user = await prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      studentId: data.studentId ?? null,
      phone: data.phone ?? null,
      course: data.course ?? null,
      yearOfStudy: data.yearOfStudy ?? null,
      role: data.role, // admin-assigned only — this endpoint is ADMIN-authorized
      isActive: data.isActive ?? true,
      passwordHash: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
    },
  });
  await recordAudit({
    actorId: actor.id, action: "USER_CREATED", entityType: "User",
    entityId: user.id, metadata: { role: user.role, email: user.email },
  });
  return publicUser(user);
}

export async function updateUser(id, data, actor) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound("USER_NOT_FOUND", "User not found.");

  const patch = {};
  if (data.fullName !== undefined) patch.fullName = data.fullName;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.emergencyContactName !== undefined) patch.emergencyContactName = data.emergencyContactName;
  if (data.emergencyContactPhone !== undefined) patch.emergencyContactPhone = data.emergencyContactPhone;
  if (data.email !== undefined && data.email.toLowerCase() !== user.email) {
    const dup = await prisma.user.findFirst({
      where: { email: { equals: data.email, mode: "insensitive" }, NOT: { id } },
    });
    if (dup) throw ApiError.conflict("EMAIL_TAKEN", "Another account already uses this email.");
    patch.email = data.email.toLowerCase();
  }
  if (data.role !== undefined) {
    await assertNotLastAdmin(user, data.role, actor);
    patch.role = data.role;
  }
  if (data.course !== undefined) patch.course = data.course;
  if (data.yearOfStudy !== undefined) patch.yearOfStudy = data.yearOfStudy;
  if (data.studentId !== undefined && data.studentId !== user.studentId) {
    const dup = data.studentId
      ? await prisma.user.findFirst({ where: { studentId: data.studentId, NOT: { id } } })
      : null;
    if (dup) throw ApiError.conflict("STUDENT_ID_TAKEN", "Another account already uses this student ID.");
    patch.studentId = data.studentId || null;
  }
  if (data.password) {
    patch.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  }

  const updated = await prisma.user.update({ where: { id }, data: patch });
  const { passwordHash, ...safePatch } = patch;
  await recordAudit({
    actorId: actor.id, action: "USER_UPDATED", entityType: "User", entityId: id,
    metadata: { fields: Object.keys(safePatch), passwordReset: Boolean(passwordHash) },
  });
  return publicUser(updated);
}

/**
 * Guard: never allow the platform to lose its last active admin
 * (demotion, deactivation, or self-demotion all funnel through here).
 */
async function assertNotLastAdmin(user, newRole, actor) {
  const wasAdmin = user.role === "ADMIN";
  const staysAdmin = newRole === "ADMIN";
  if (wasAdmin && !staysAdmin) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    if (admins <= 1) {
      throw ApiError.conflict(
        "LAST_ADMIN",
        "This is the last active admin account. Promote another admin before changing this role."
      );
    }
  }
}

export async function setUserActive(id, isActive, actor) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound("USER_NOT_FOUND", "User not found.");

  if (user.id === actor.id && !isActive) {
    throw ApiError.badRequest("SELF_DEACTIVATE", "You cannot deactivate your own account.");
  }
  if (user.role === "ADMIN" && user.isActive && !isActive) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    if (admins <= 1) {
      throw ApiError.conflict("LAST_ADMIN", "Cannot deactivate the last active admin account.");
    }
  }

  const updated = await prisma.user.update({ where: { id }, data: { isActive } });
  await recordAudit({
    actorId: actor.id, action: isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
    entityType: "User", entityId: id,
  });
  return publicUser(updated);
}

/**
 * Self-service profile update — deliberately narrow allowlist.
 * Students can NEVER change their own role, studentId, email-via-this-path
 * handled separately, or approval status.
 */
export async function updateOwnProfile(user, data) {
  const patch = {};
  const ALLOWED = ["phone", "emergencyContactName", "emergencyContactPhone"];
  for (const key of ALLOWED) {
    if (data[key] !== undefined) patch[key] = data[key];
  }
  if (Object.keys(patch).length === 0) {
    throw ApiError.badRequest("NOTHING_TO_UPDATE", "No editable fields were provided.");
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data: patch });
  await recordAudit({
    actorId: user.id, action: "PROFILE_UPDATED", entityType: "User", entityId: user.id,
    metadata: { fields: Object.keys(patch) },
  });
  return publicUser(updated);
}
