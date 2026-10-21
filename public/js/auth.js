/**
 * Session handling for the frontend.
 * The session itself lives in an HTTP-only cookie managed by the server —
 * JavaScript never stores tokens. This module only caches the /auth/me
 * response for the current page load to render the shell.
 */
import { api } from "./api.js";

let cachedUser;

export async function getSession() {
  if (cachedUser) return cachedUser;
  try {
    const data = await api("/auth/me");
    cachedUser = data.user;
    return cachedUser;
  } catch {
    return null;
  }
}

/**
 * Page guard: ensures a signed-in user with an allowed role.
 * Redirects to /login.html otherwise. Returns the user.
 */
export async function requireAuth(allowedRoles = null) {
  const user = await getSession();
  if (!user) {
    redirectToLogin();
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Signed in but wrong role → send to their own dashboard
    window.location.href = homeForRole(user.role);
    return null;
  }
  return user;
}

export function homeForRole(role) {
  switch (role) {
    case "ADMIN": return "/admin/dashboard.html";
    case "WARDEN": return "/warden/dashboard.html";
    case "STUDENT": return "/student/dashboard.html";
    default: return "/index.html";
  }
}

export function redirectToLogin() {
  const back = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login.html?next=${back}`;
}

export async function logout() {
  try {
    await api("/auth/logout", { method: "POST" });
  } finally {
    cachedUser = null;
    window.location.href = "/login.html?signedout=1";
  }
}
