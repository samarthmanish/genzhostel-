import { login, registerStudent, changePassword, publicUser } from "../services/authService.js";
import { signSessionToken, cookieOptions, COOKIE_NAME } from "../middleware/authenticate.js";
import { config } from "../config/index.js";

export async function loginHandler(req, res, next) {
  try {
    const user = await login(req.body.identifier, req.body.password);
    const token = signSessionToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req, res, next) {
  try {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function meHandler(req, res) {
  res.json({ user: req.user });
}

export async function registerHandler(req, res, next) {
  try {
    const user = await registerStudent(req.body);
    // Auto-login after successful registration for a smoother demo flow.
    const token = signSessionToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function changePasswordHandler(req, res, next) {
  try {
    await changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    res.json({ ok: true, message: "Password changed successfully." });
  } catch (err) {
    next(err);
  }
}

/** Public bootstrap info the login/register pages need (no secrets). */
export function publicConfigHandler(req, res) {
  res.json({
    allowSelfRegistration: config.ALLOW_SELF_REGISTRATION,
    seedDemoUsers: config.SEED_DEMO_USERS && config.NODE_ENV === "development",
  });
}
