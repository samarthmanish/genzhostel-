/**
 * Shared UI kit. All rendering uses createElement/textContent — untrusted
 * server strings are never injected via innerHTML (XSS-safe by construction).
 * The only innerHTML usage is for static, hard-coded SVG icon markup below.
 */

/* ---------------- DOM helper ---------------- */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v; // ONLY for trusted static strings (icons)
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v);
  }
  for (const child of children.flat(9)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/* ---------------- Icons (static SVG, consistent 20px outline style) ---------------- */
const ICONS = {
  home: '<path d="M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z"/>',
  bed: '<path d="M3 17v-6a2 2 0 0 1 2-2h9a4 4 0 0 1 4 4v4M3 17h15M3 17v2M18 17v2M3 11V5m3.5 4a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z"/>',
  key: '<circle cx="7.5" cy="12.5" r="3.5"/><path d="M10 10 18 2m-3 0h3v3"/>',
  alert: '<path d="M10 2 18.7 17H1.3zM10 7v5m0 2.2v.3"/>',
  users: '<circle cx="7" cy="7" r="3"/><path d="M1.5 18c.8-3 3-4.5 5.5-4.5S11.7 15 12.5 18M13 5.2a3 3 0 0 1 0 5.6M15 13.8c1.7.5 3 1.9 3.5 4.2"/>',
  chart: '<path d="M3 18V2m0 16h16M7 15V9m4 6V5m4 10v-4"/>',
  settings: '<circle cx="10" cy="10" r="2.6"/><path d="M10 1.8 11.4 4a6.7 6.7 0 0 1 1.9 1.1l2.4-.6 1.4 2.4-1.7 1.9a7 7 0 0 1 0 2.4l1.7 1.9-1.4 2.4-2.4-.6a6.7 6.7 0 0 1-1.9 1.1L10 18.2 8.6 16a6.7 6.7 0 0 1-1.9-1.1l-2.4.6L2.9 13l1.7-1.9a7 7 0 0 1 0-2.4L2.9 6.9l1.4-2.4 2.4.6A6.7 6.7 0 0 1 8.6 4z"/>',
  chat: '<path d="M18 12.5a5.5 5.5 0 0 1-5.5 5.5H7l-4 3v-4.2A5.5 5.5 0 0 1 4.5 7h8A5.5 5.5 0 0 1 18 12.5z"/>',
  sun: '<circle cx="10" cy="10" r="3.6"/><path d="M10 1v2.4M10 16.6V19M19 10h-2.4M3.4 10H1m15.4-6.4-1.7 1.7M5.3 14.7l-1.7 1.7m12.8 0-1.7-1.7M5.3 5.3 3.6 3.6"/>',
  moon: '<path d="M17 11.6A7.4 7.4 0 0 1 8.4 3a7.5 7.5 0 1 0 8.6 8.6z"/>',
  menu: '<path d="M2.5 5h15M2.5 10h15M2.5 15h15"/>',
  close: '<path d="M4.5 4.5l11 11m0-11l-11 11"/>',
  search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4.5 4.5"/>',
  check: '<path d="m3.5 10.5 4.5 4.5 9-10"/>',
  plus: '<path d="M10 3v14M3 10h14"/>',
  logout: '<path d="M7 17H3V3h4m6 12 5-5-5-5m5 5H7"/>',
  user: '<circle cx="10" cy="6" r="3.5"/><path d="M3 18c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5"/>',
  inbox: '<path d="M2.5 11 5 3.5h10L17.5 11v5.5h-15zM2.5 11h4l1 2.5h5l1-2.5h4"/>',
  clock: '<circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3.5 2"/>',
  edit: '<path d="M13.5 3.5l3 3M3 17l1-4L13.5 3.5l3 3L7 16zM13 17h5"/>',
  trash: '<path d="M4 5.5h12M8 5.5V3h4v2.5M5.5 5.5l.8 11h7.4l.8-11M8.3 8.5v5.5m3.4-5.5v5.5"/>',
  download: '<path d="M10 2.5v10m0 0 4-4m-4 4-4-4M3 15v2.5h14V15"/>',
  shield: '<path d="M10 1.8 16.5 4v5c0 4.2-2.7 7.4-6.5 9.2C6.2 16.4 3.5 13.2 3.5 9V4z"/><path d="m7.3 9.6 2 2 3.6-3.8"/>',
  building: '<path d="M4 18V3.5h8V18M12 8h4.5V18M2 18h16M6.5 6.5h3m-3 3h3m-3 3h3m5.5.5h2"/>',
  filter: '<path d="M2.5 4.5h15L11.8 11v5.5l-3.6 1.8V11z"/>',
  refresh: '<path d="M16.5 10a6.5 6.5 0 1 1-2-4.6M16.8 2.5V6h-3.5"/>',
  info: '<circle cx="10" cy="10" r="7.8"/><path d="M10 8.8v5.4M10 5.9v.4"/>',
  send: '<path d="M17.5 2.5 8.8 11.2m8.7-8.7-3 15-5.3-6.3-6.2-5.3z"/>',
  eye: '<path d="M1.8 10S4.9 4.5 10 4.5 18.2 10 18.2 10 15.1 15.5 10 15.5 1.8 10 1.8 10z"/><circle cx="10" cy="10" r="2.6"/>',
  eyeOff: '<path d="M4 4l12 12M8.2 5.2A8.8 8.8 0 0 1 10 5c5.1 0 8.2 5 8.2 5a15 15 0 0 1-2.6 3.2M6.2 7A15 15 0 0 0 1.8 10S4.9 15 10 15c1 0 2-.2 2.8-.5M8.8 8.9a2.6 2.6 0 0 0 3.3 3.4"/>',
  transfer: '<path d="M3 7h11m0 0-3-3m3 3-3 3M17 13H6m0 0 3-3m-3 3 3 3"/>',
  wifi: '<path d="M2 7.5a12 12 0 0 1 16 0M5 10.7a7.8 7.8 0 0 1 10 0M8 13.9a3.5 3.5 0 0 1 4 0"/><circle cx="10" cy="16.8" r="0.6" fill="currentColor"/>',
  report: '<path d="M4.5 2.5h11v15h-11zM7 6h6M7 9h6M7 12h4"/>',
};

export function icon(name, size = 20) {
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ICONS.info}</svg>`;
  span.style.display = "inline-flex";
  span.style.flex = "none";
  return span;
}

export function logoMark(size = 22) {
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">` +
    `<rect x="2.5" y="4" width="19" height="16" rx="4" stroke="currentColor" stroke-width="1.8"/>` +
    `<path d="M8 20V9.5A2.5 2.5 0 0 1 10.5 7h3A2.5 2.5 0 0 1 16 9.5V20" stroke="currentColor" stroke-width="1.8"/>` +
    `<circle cx="12" cy="12.5" r="1.6" fill="currentColor"/></svg>`;
  span.style.display = "inline-flex";
  return span;
}

/* ---------------- Formatting ---------------- */
export function titleCase(s) {
  return String(s ?? "")
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function timeAgo(d) {
  if (!d) return "";
  const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

export function shortId(id) {
  return typeof id === "string" && id.length > 8 ? `${id.slice(0, 8)}…` : id ?? "—";
}

export function initials(name) {
  return String(name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/* ---------------- Status badges ---------------- */
const BADGE_TONE = {
  ACTIVE: "success", APPROVED: "success", RESOLVED: "success", AVAILABLE: "success",
  PENDING: "warning", SUBMITTED: "warning", ASSIGNED: "warning", MAINTENANCE: "warning", REOPENED: "warning",
  IN_PROGRESS: "info",
  REJECTED: "danger", FULL: "danger", URGENT: "danger",
  VACATED: "neutral", CANCELLED: "neutral", CLOSED: "neutral", INACTIVE: "neutral",
  LOW: "neutral", NORMAL: "info", HIGH: "warning",
  STUDENT: "info", WARDEN: "warning", ADMIN: "success",
};

export function statusBadge(value) {
  const tone = BADGE_TONE[value] ?? "neutral";
  return h("span", { class: `badge badge-${tone}` }, titleCase(value));
}

/* ---------------- Stat cards ---------------- */
export function statCard({ label, value, help, iconName, onClick, href }) {
  const card = h(
    "div",
    { class: "stat-card" + (onClick || href ? " is-clickable" : ""), role: onClick ? "button" : null, tabindex: onClick ? "0" : null },
    h("div", { class: "stat-label" }, iconName ? icon(iconName, 15) : null, h("span", { text: label })),
    h("div", { class: "stat-value", text: String(value ?? "—") }),
    help ? h("div", { class: "stat-help", text: help }) : null
  );
  if (onClick) {
    card.addEventListener("click", onClick);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } });
  } else if (href) {
    card.addEventListener("click", () => { window.location.href = href; });
  }
  return card;
}

/* ---------------- Empty / loading / error states ---------------- */
export function emptyState({ iconName = "inbox", title, message, actionEl }) {
  return h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-icon" }, icon(iconName, 26)),
    h("h3", { text: title }),
    message ? h("p", { text: message }) : null,
    actionEl ?? null
  );
}

export function loadingBlock(label = "Loading…") {
  return h("div", { class: "loading-row", role: "status" }, h("div", { class: "spinner" }), h("span", { text: label }));
}

export function skeletonCard() {
  return h("div", { class: "card" },
    h("div", { class: "skeleton", style: "height:18px;width:40%;margin-bottom:12px" }),
    h("div", { class: "skeleton", style: "height:12px;width:90%;margin-bottom:8px" }),
    h("div", { class: "skeleton", style: "height:12px;width:70%" }));
}

export function errorState(message, onRetry) {
  return h("div", { class: "empty-state" },
    h("div", { class: "empty-icon" }, icon("alert", 26)),
    h("h3", { text: "Something went wrong" }),
    h("p", { text: message }),
    onRetry ? h("button", { class: "btn btn-secondary btn-sm", onclick: onRetry }, icon("refresh", 15), "Try again") : null);
}

/* ---------------- Toasts ---------------- */
let toastRegion = null;
function ensureToastRegion() {
  if (!toastRegion || !document.body.contains(toastRegion)) {
    toastRegion = h("div", { class: "toast-region", "aria-live": "polite", role: "status" });
    document.body.append(toastRegion);
  }
  return toastRegion;
}

export function toast(type, message, timeout = 4200) {
  const region = ensureToastRegion();
  const iconName = type === "success" ? "check" : type === "error" ? "alert" : "info";
  const el = h("div", { class: `toast toast-${type}` },
    h("span", { class: "toast-icon" }, icon(iconName, 17)),
    h("span", { text: message }),
    h("button", { class: "toast-close", "aria-label": "Dismiss notification", onclick: () => dismiss() }, icon("close", 14)));
  const timer = setTimeout(dismiss, timeout);
  function dismiss() {
    clearTimeout(timer);
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  }
  region.append(el);
  return dismiss;
}

export const toastSuccess = (m) => toast("success", m);
export const toastError = (m) => toast("error", m, 6000);
export const toastInfo = (m) => toast("info", m);

/** Standard handling for API errors: toast + optional banner. */
export function reportError(err, bannerEl) {
  const msg = err?.message ?? "Unexpected error.";
  if (bannerEl) showBannerText(bannerEl, msg);
  else toastError(msg);
}
function showBannerText(el, msg) {
  el.className = "form-banner error visible";
  el.textContent = msg;
}

/* ---------------- Modal ---------------- */
let lastFocused = null;

export function openModal({ title, content, actions = [], size = "", onClose }) {
  lastFocused = document.activeElement;
  const backdrop = h("div", { class: "modal-backdrop", role: "dialog", "aria-modal": "true", "aria-label": title });
  const modal = h("div", { class: `modal ${size}`.trim() });

  const titleEl = h("h2", { text: title, id: `modal-title-${Date.now()}` });
  modal.append(titleEl);
  backdrop.setAttribute("aria-labelledby", titleEl.id);
  if (content) modal.append(content);

  if (actions.length) {
    modal.append(h("div", { class: "modal-actions" }, ...actions));
  }
  backdrop.append(modal);
  document.body.append(backdrop);
  document.body.style.overflow = "hidden";

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    lastFocused?.focus?.();
    onClose?.();
  }
  function onKey(e) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "Tab") {
      const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  const firstInput = modal.querySelector("input, select, textarea, button");
  (firstInput ?? modal).focus();
  return { close, el: modal };
}

/**
 * Confirmation dialog for destructive actions — explains the consequence.
 * confirmDialog({title, message, confirmLabel, danger}) → Promise<boolean>
 * Dismissing via Escape/backdrop counts as cancel.
 */
export function confirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    const { close } = openModal({
      title,
      content: h("p", { text: message, style: "color:var(--color-muted)" }),
      actions: [
        h("button", { class: "btn btn-secondary", onclick: () => { close(); done(false); } }, cancelLabel),
        h("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, onclick: () => { close(); done(true); } }, confirmLabel),
      ],
      onClose: () => done(false),
    });
  });
}

/* ---------------- Buttons with pending state ---------------- */
export function setPending(btn, pending, pendingLabel = "Working…") {
  if (!btn) return;
  if (pending) {
    btn.dataset.origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "";
    btn.append(h("span", { class: "spinner" }), document.createTextNode(pendingLabel));
  } else {
    btn.disabled = false;
    if (btn.dataset.origHtml !== undefined) btn.innerHTML = btn.dataset.origHtml;
  }
}

/* ---------------- Data table ---------------- */
/**
 * columns: [{ label, key?, render?(row), className?, mobileLabel? }]
 * Renders a <table>; on mobile CSS converts rows into cards using data-label.
 */
export function dataTable(columns, rows, { emptyEl } = {}) {
  if (!rows?.length) return emptyEl ?? emptyState({ title: "Nothing here yet", message: "No records match this view." });

  const thead = h("thead", {},
    h("tr", {}, ...columns.map((c) => h("th", { scope: "col", class: c.className ?? null, text: c.label }))));

  const tbody = h("tbody", {},
    ...rows.map((row) =>
      h("tr", { dataset: { id: row.id ?? "" } },
        ...columns.map((c) =>
          h("td", { "data-label": c.label, class: c.className ?? null },
            c.render ? c.render(row) : String(row[c.key] ?? "—"))))));

  return h("div", { class: "table-wrap" }, h("table", { class: "data-table" }, thead, tbody));
}

/* ---------------- Pagination ---------------- */
export function pagination({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  const mk = (label, target, opts = {}) =>
    h("button", {
      class: "btn btn-secondary btn-sm", ...opts,
      onclick: () => onPage(target),
    }, label);
  return h("div", { class: "pagination" },
    mk("‹ Prev", page - 1, page <= 1 ? { disabled: true } : {}),
    h("span", { text: `Page ${page} of ${pages} · ${total} records` }),
    mk("Next ›", page + 1, page >= pages ? { disabled: true } : {}));
}

/* ---------------- Field builder ---------------- */
/**
 * formField({ label, name, type, value, options?, placeholder?, help?, required?, textarea?, min?, max?, attrs? })
 * Returns { el, input, errorEl }
 */
export function formField(cfg) {
  const errorEl = h("p", { class: "error-text", role: "alert" });
  const id = `f-${cfg.name}-${Math.random().toString(36).slice(2, 7)}`;
  let input;
  if (cfg.textarea) {
    input = h("textarea", { id, name: cfg.name, placeholder: cfg.placeholder ?? "", rows: cfg.rows ?? 4, ...cfg.attrs });
    input.value = cfg.value ?? "";
  } else if (cfg.type === "select") {
    input = h("select", { id, name: cfg.name, ...cfg.attrs },
      ...(cfg.placeholder ? [h("option", { value: "", text: cfg.placeholder })] : []),
      ...(cfg.options ?? []).map((o) => {
        const opt = h("option", { value: o.value, text: o.label });
        if (String(o.value) === String(cfg.value ?? "")) opt.selected = true;
        return opt;
      }));
  } else {
    input = h("input", { id, name: cfg.name, type: cfg.type ?? "text", placeholder: cfg.placeholder ?? "", ...cfg.attrs });
    input.value = cfg.value ?? "";
  }
  if (cfg.required) input.setAttribute("aria-required", "true");
  if (cfg.min !== undefined) input.min = cfg.min;
  if (cfg.max !== undefined) input.max = cfg.max;

  const el = h("div", { class: "form-field" },
    h("label", { for: id }, cfg.label, cfg.required ? h("span", { "aria-hidden": "true", style: "color:var(--color-danger)" }, " *") : null),
    input,
    cfg.help ? h("p", { class: "help-text", text: cfg.help }) : null,
    errorEl);
  return { el, input, errorEl };
}
