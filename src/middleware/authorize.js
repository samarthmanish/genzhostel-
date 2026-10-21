import { ApiError } from "../utils/ApiError.js";

/**
 * Role-based authorization middleware factory.
 * Usage: router.get("/users", authenticate, authorize("ADMIN"), handler)
 * Hiding buttons in the frontend is NOT authorization — every protected
 * route re-checks the role here on the server.
 */
export function authorize(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.has(req.user.role)) {
      return next(
        ApiError.forbidden(
          "ROLE_FORBIDDEN",
          `This action requires one of the following roles: ${[...allowed].join(", ")}.`
        )
      );
    }
    next();
  };
}

export const isStaff = (user) => user && (user.role === "WARDEN" || user.role === "ADMIN");
