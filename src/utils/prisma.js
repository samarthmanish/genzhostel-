import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the whole app.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

/** Fail fast at startup if the database is unreachable. */
export async function assertDatabaseReachable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("\n[database] Cannot reach PostgreSQL at the configured DATABASE_URL.");
    console.error(`[database] Reason: ${err.message}`);
    console.error("[database] Start PostgreSQL, check DATABASE_URL in .env, and retry.");
    console.error("[database] The app will NOT fall back to fake in-memory data.\n");
    throw err;
  }
}
