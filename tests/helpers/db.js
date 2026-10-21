import "./env.js";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";

export { prisma, request };

export const app = createApp();
export const TEST_PASSWORD = "Test@12345";

/** Wipe all business data (FK-safe order). Run at the start of each file. */
export async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.complaintComment.deleteMany();
  await prisma.complaintHistory.deleteMany();
  await prisma.allocationHistory.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.room.deleteMany();
  await prisma.hostelBlock.deleteMany();
  await prisma.hostelFAQ.deleteMany();
  await prisma.user.deleteMany();
}

export async function makeUser(overrides = {}) {
  const passwordHash = overrides.passwordHash ?? (await bcrypt.hash(TEST_PASSWORD, 10));
  const base = {
    fullName: "Test User",
    email: `user-${Math.random().toString(36).slice(2, 10)}@test.local`,
    role: "STUDENT",
    isActive: true,
  };
  return prisma.user.create({ data: { ...base, passwordHash, ...overrides } });
}

export async function makeBlock(name = "Test Block") {
  return prisma.hostelBlock.create({ data: { name } });
}

export async function makeRoom(blockId, overrides = {}) {
  return prisma.room.create({
    data: {
      blockId,
      roomNumber: `T-${Math.floor(Math.random() * 9000 + 1000)}`,
      floor: 1,
      roomType: "DOUBLE",
      capacity: 2,
      status: "AVAILABLE",
      amenities: ["Wi-Fi"],
      ...overrides,
    },
  });
}

/** Login and return a supertest agent that carries the session cookie. */
export async function loginAs(email, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`Test login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export async function disconnect() {
  await prisma.$disconnect();
}
