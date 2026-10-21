import { createApp, config } from "./app.js";
import { assertDatabaseReachable, prisma } from "./utils/prisma.js";

async function main() {
  // Fail loudly if PostgreSQL is unreachable — never silently fall back to
  // fake in-memory data and claim to be connected.
  await assertDatabaseReachable();
  console.log("[database] PostgreSQL connection verified.");

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`[server] Hostel Management System running at ${config.APP_BASE_URL}`);
    console.log(`[server] Environment: ${config.NODE_ENV}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Force-exit if connections hang
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[server] Failed to start:", err.message);
  process.exit(1);
});
