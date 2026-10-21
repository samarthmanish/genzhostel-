import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config/index.js";
import { sameOriginGuard } from "./middleware/authenticate.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { prisma } from "./utils/prisma.js";

import authRoutes from "./routes/authRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import allocationRoutes from "./routes/allocationRoutes.js";
import complaintRoutes from "./routes/complaintRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  /* Security headers. CSP: scripts are strictly same-origin external files
     (no inline <script>, no eval). Inline style ATTRIBUTES are allowed —
     they are used for dynamic layout values (bar widths, etc.) and are not
     a script-execution vector; all other directives stay locked down. */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  /* Health check — verifies the real PostgreSQL connection, never lies. */
  app.get("/api/health", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "connected", time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "error", database: "unreachable", time: new Date().toISOString() });
    }
  });

  /* API v1 — cookie auth + same-origin guard for state-changing methods */
  app.use("/api/v1", sameOriginGuard);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1", roomRoutes);
  app.use("/api/v1", allocationRoutes);
  app.use("/api/v1", complaintRoutes);
  app.use("/api/v1", userRoutes);
  app.use("/api/v1", reportRoutes);
  app.use("/api/v1", chatRoutes);

  app.use("/api", notFoundHandler);

  /* Static frontend (multi-page app) */
  app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));

  /* Friendly 404 for unknown pages */
  app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "..", "public", "404.html"), (err) => {
      if (err) res.status(404).send("Not found");
    });
  });

  app.use(errorHandler);
  return app;
}

export { config };
