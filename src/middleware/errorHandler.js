import { ApiError } from "../utils/ApiError.js";

/** 404 for unknown /api routes. */
export function notFoundHandler(req, res, next) {
  next(ApiError.notFound("ROUTE_NOT_FOUND", `Unknown API route: ${req.method} ${req.originalUrl}`));
}

/**
 * Central error handler. Produces a consistent JSON error envelope:
 * { "error": { "code": "...", "message": "...", "details": [...] } }
 * Never leaks stack traces or raw database errors to the browser.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Known operational error
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Zod validation failures that slipped through the validate middleware
  if (err?.name === "ZodError") {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  }

  // Prisma known errors → friendly codes
  if (err?.code === "P2002") {
    return res.status(409).json({
      error: { code: "DUPLICATE_RECORD", message: "A record with the same unique value already exists." },
    });
  }
  if (err?.code === "P2025") {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "The requested record no longer exists." },
    });
  }
  if (err?.code === "P2003") {
    return res.status(400).json({
      error: { code: "INVALID_REFERENCE", message: "A referenced record does not exist." },
    });
  }
  if (err?.code === "P2021") {
    return res.status(503).json({
      error: { code: "DATABASE_NOT_MIGRATED", message: "Database tables are not set up yet. Please run migrations ('npm run db:deploy')." },
    });
  }
  if (err?.code === "P1001" || err?.name === "PrismaClientInitializationError") {
    return res.status(503).json({
      error: { code: "DATABASE_UNREACHABLE", message: "Cannot connect to the database. Please verify DATABASE_URL and ensure your PostgreSQL server is active." },
    });
  }

  // Malformed JSON body
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
    });
  }

  // Unexpected error — log server-side only
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  const isDev = process.env.NODE_ENV !== "production";
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: isDev && err?.message ? err.message : "Something went wrong on the server. Please check database connection.",
    },
  });
}
