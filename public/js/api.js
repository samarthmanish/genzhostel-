/**
 * Central API client. Every frontend module talks to the backend through this.
 * - Same-origin cookies are sent with credentials: "same-origin".
 * - Normalizes the server error envelope into thrown ApiError-like objects.
 * - No direct database access anywhere in the browser — only these REST APIs.
 */
export const API_BASE = "/api/v1";

export class ApiRequestError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details; // [{path, message}] for validation errors
  }
}

function buildUrl(path, params) {
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url;
}

export async function api(path, { method = "GET", body, params, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* non-JSON response */ }
  }

  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiRequestError(
      res.status,
      err.code ?? `HTTP_${res.status}`,
      err.message ?? `Request failed (${res.status}).`,
      err.details
    );
  }
  return data;
}

/** Download helper for authorized CSV exports (uses session cookie). */
export async function downloadCsv(path, params, filename) {
  const res = await fetch(buildUrl(path, params), { credentials: "same-origin" });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try { msg = (await res.json()).error?.message ?? msg; } catch { /* ignore */ }
    throw new ApiRequestError(res.status, "EXPORT_FAILED", msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
