import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";

export const COOKIE_NAME = "hms_session";

export function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.SESSION_SECRET,
    { expiresIn: `${config.SESSION_TTL_HOURS}h` }
  );
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: config.SESSION_TTL_HOURS * 60 * 60 * 1000,
  };
}

/**
 * Authentication middleware: verifies the HTTP-only session cookie,
 * loads the user from the database (deactivated accounts are rejected),
 * and attaches { id, role, fullName, email, ... } to req.user.
 */
export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.SESSION_SECRET);
    } catch {
      throw ApiError.unauthorized("SESSION_EXPIRED", "Your session has expired. Please sign in again.");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, fullName: true, email: true, studentId: true, phone: true,
        emergencyContactName: true, emergencyContactPhone: true, course: true,
        yearOfStudy: true, role: true, isActive: true, createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      // Clear stale cookie and reject
      res.clearCookie(COOKIE_NAME, { path: "/" });
      throw ApiError.unauthorized("ACCOUNT_INACTIVE", "This account is deactivated or no longer exists.");
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * CSRF hardening for cookie auth: for state-changing methods, if the browser
 * sent an Origin/Referer header it must match our own origin. SameSite=Lax
 * already blocks most cross-site POSTs; this closes the remaining gaps.
 */
export function sameOriginGuard(req, res, next) {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) return next();

  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
  if (origin) {
    const expected = new URL(config.APP_BASE_URL).origin;
    const originUrl = new URL(origin);
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const isSameHost = host && (originUrl.host === host || originUrl.hostname === host);
    const isVercel = originUrl.hostname.endsWith(".vercel.app");
    const isRender = originUrl.hostname.endsWith(".onrender.com");
    const isLocalhost = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
    const allowed =
      origin === expected ||
      isSameHost ||
      isVercel ||
      isRender ||
      (config.NODE_ENV !== "production" && isLocalhost);
    if (!allowed) {
      return next(ApiError.forbidden("CSRF_REJECTED", "Cross-origin request rejected."));
    }
  }
  next();
}
