import { prisma } from "../utils/prisma.js";

const FORBIDDEN_METADATA_KEYS = [
  "password", "passwordhash", "pass", "secret", "token", "session",
  "cookie", "authorization", "apikey", "api_key",
];

/** Recursively strip anything secret-looking from audit metadata. */
function sanitize(value, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_METADATA_KEYS.some((bad) => k.toLowerCase().includes(bad))) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitize(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/**
 * Write an audit log entry. Best-effort: audit failures are logged but must
 * not break the business operation that triggered them.
 */
export async function recordAudit({ actorId = null, action, entityType, entityId = null, metadata = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        entityType,
        entityId: entityId != null ? String(entityId) : null,
        metadata: metadata ? sanitize(metadata) : undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log:", err.message);
  }
}
