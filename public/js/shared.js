/**
 * Shared page-level building blocks used by multiple role pages:
 * block/room loaders, timelines, detail views, filter bar factory.
 */
import { api } from "./api.js";
import { h, icon, statusBadge, formatDate, formatDateTime, timeAgo, shortId, initials, emptyState, loadingBlock, dataTable, pagination as paginationEl } from "./ui.js";

export async function loadBlocks() {
  const data = await api("/blocks");
  return data.items;
}

/** <select> options for rooms, optionally only bookable ones. */
export async function roomOptions({ onlyAvailable = false } = {}) {
  const params = { limit: 100 };
  if (onlyAvailable) params.availability = "available";
  const data = await api("/rooms", { params });
  return data.items.map((r) => ({
    value: r.id,
    label: `${r.roomNumber} · ${r.block?.name ?? ""} · ${r.roomType.toLowerCase()} · ${r.availableBeds}/${r.capacity} beds free`,
    room: r,
  }));
}

export function roomOptionsForSelect(options, placeholder = "Select a room…") {
  return { type: "select", options: [{ value: "", label: placeholder }, ...options] };
}

/* ---------------- Timeline ---------------- */
export function timeline(entries, { emptyText = "No history yet." } = {}) {
  if (!entries?.length) return h("p", { class: "text-muted text-small", text: emptyText });
  return h("ol", { class: "timeline" },
    ...entries.slice().reverse().map((e) =>
      h("li", {},
        h("div", { class: "t-head" }, humanAction(e.action),
          e.newStatus ? h("span", { style: "margin-left:8px" }, statusBadge(e.newStatus)) : null),
        h("div", { class: "t-meta", text: `${e.actorName ?? "System"} · ${formatDateTime(e.at)}` }),
        e.reason ? h("div", { class: "t-note", text: e.reason }) : null,
        e.note ? h("div", { class: "t-note", text: e.note }) : null)));
}

function humanAction(action) {
  const map = {
    REQUESTED: "Request submitted", APPROVED: "Approved", REJECTED: "Rejected",
    VACATED: "Vacated", TRANSFERRED: "Room transferred", CANCELLED: "Cancelled by student",
    CREATED: "Complaint created", STATUS_CHANGED: "Status changed", ASSIGNED: "Assignment updated",
    REOPENED: "Reopened by student", COMMENT_ADDED: "Comment added", INTERNAL_NOTE: "Internal note added",
  };
  return map[action] ?? action;
}

/* ---------------- Comment thread ---------------- */
export function commentThread(comments, { showInternalFlag = false } = {}) {
  if (!comments?.length) return h("p", { class: "text-muted text-small", text: "No messages yet." });
  return h("div", {},
    ...comments.map((c) =>
      h("div", { class: "comment" + (c.visibility === "INTERNAL" && showInternalFlag ? " internal-flag" : "") },
        h("span", { class: "avatar", text: initials(c.authorName) }),
        h("div", { style: "min-width:0" },
          h("div", { class: "comment-head" },
            h("span", { class: "comment-author", text: c.authorName }),
            c.authorRole && c.authorRole !== "STUDENT" ? h("span", { class: "badge badge-neutral", text: c.authorRole.toLowerCase() }) : null,
            c.visibility === "INTERNAL" && showInternalFlag ? h("span", { class: "badge badge-warning", text: "Internal note" }) : null,
            h("span", { class: "comment-time", text: timeAgo(c.at) })),
          h("div", { class: "comment-body", text: c.message })))));
}

/* ---------------- Filter bar factory ---------------- */
/**
 * buildFilterBar([{type:'search'|'select', name, label, options, value}], onChange, countText)
 * Returns { el, values() }
 */
export function buildFilterBar(controls, onChange) {
  const values = {};
  const els = [];
  for (const c of controls) {
    if (c.type === "search") {
      const input = h("input", { type: "search", placeholder: c.label, "aria-label": c.label, value: c.value ?? "" });
      let timer;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => { values[c.name] = input.value.trim(); onChange(); }, 300);
      });
      els.push(h("div", { class: "search-input" }, icon("search", 16), input));
      values[c.name] = c.value ?? "";
    } else if (c.type === "select") {
      const select = h("select", { "aria-label": c.label },
        h("option", { value: "", text: c.placeholder ?? c.label }),
        ...c.options.map((o) => {
          const opt = h("option", { value: o.value, text: o.label });
          if (String(o.value) === String(c.value ?? "")) opt.selected = true;
          return opt;
        }));
      select.addEventListener("change", () => { values[c.name] = select.value; onChange(); });
      els.push(select);
      values[c.name] = c.value ?? "";
    }
  }
  const clearBtn = h("button", { class: "btn btn-secondary btn-sm", onclick: () => {
    for (const c of controls) values[c.name] = "";
    onChange({ reset: true });
  }}, "Clear");
  const countEl = h("span", { class: "filter-count" });
  const el = h("div", { class: "filter-bar" }, ...els, clearBtn, countEl);
  return {
    el,
    values: () => ({ ...values }),
    setCount(text) { countEl.textContent = text; },
  };
}

export { dataTable, paginationEl, paginationEl as pagination, emptyState, loadingBlock, formatDate, formatDateTime, timeAgo, shortId, statusBadge };
