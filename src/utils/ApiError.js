/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Thrown by services/controllers; serialized by the central error handler.
 */
export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code, message, details) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(code = "UNAUTHORIZED", message = "Authentication required.") {
    return new ApiError(401, code, message);
  }
  static forbidden(code = "FORBIDDEN", message = "You do not have permission to perform this action.") {
    return new ApiError(403, code, message);
  }
  static notFound(code = "NOT_FOUND", message = "Resource not found.") {
    return new ApiError(404, code, message);
  }
  static conflict(code, message, details) {
    return new ApiError(409, code, message, details);
  }
  static unprocessable(code, message, details) {
    return new ApiError(422, code, message, details);
  }
}
