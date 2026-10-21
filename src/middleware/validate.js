import { ApiError } from "../utils/ApiError.js";

/**
 * Validation middleware factory built on Zod.
 * validate({ body: schema, query: schema, params: schema })
 * On failure responds 422 with field-level details the UI can render.
 */
export function validate(schemas) {
  return (req, res, next) => {
    const details = [];
    for (const key of ["params", "query", "body"]) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({ path: issue.path.join(".") || key, message: issue.message });
        }
      } else {
        req[key] = result.data;
      }
    }
    if (details.length > 0) {
      return next(
        new ApiError(422, "VALIDATION_ERROR", "Some fields are invalid. Please review and try again.", details)
      );
    }
    next();
  };
}

/** Shared pagination query schema: page >= 1, 1 <= limit <= 100. */
import { z } from "zod";
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginate(page, limit) {
  return { skip: (page - 1) * limit, take: limit };
}
