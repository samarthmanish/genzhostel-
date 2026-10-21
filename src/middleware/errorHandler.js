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

  // Prisma known errors → friendly codes (no raw DB internals exposed)
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

  // Malformed JSON body
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
    });
  }

  // Unexpected error — log server-side only
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong on the server. Please try again." },
  });
}
