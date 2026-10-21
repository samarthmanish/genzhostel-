import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, formField, openModal, setPending, toastSuccess, toastError, emptyState, errorState, formatDate, timeAgo } from "../ui.js";
import { buildFilterBar, dataTable, pagination as paginationEl, commentThread, timeline } from "../shared.js";

const user = await requireAuth(["WARDEN", "ADMIN"]);
if (!user) throw new Error("redirecting");

const CATEGORIES = ["MAINTENANCE", "CLEANLINESS", "WATER", "ELECTRICITY", "WIFI", "SECURITY", "OTHER"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
const STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"];
const OPEN = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "REOPENED"];

await buildShell({
  user,
  pageTitle: "Complaint Management",
  breadcrumb: "Management · Complaints",
  activeHref: "/warden/complaints.html",
  renderPage: async ({ content }) => {
    const urlParams = new URLSearchParams(location.search);
    let staff = [];
    try { staff = (await api("/users/staff")).items; } catch { /* optional */ }

    content.append(h("div", { class: "page-head" },
      h("div", {},
        h("h1", { text: "Complaints" }),
        h("p", { class: "text-muted text-small", style: "margin:0", text: "Assign work, update status, and keep internal notes separate from student-visible responses." }))));

    const listWrap = h("div", {});
    const state = { page: 1, limit: 10 };

    const filters = buildFilterBar([
      { type: "search", name: "q", label: "Search title or student…" },
      { type: "select", name: "status", label: "Status", value: urlParams.get("open") ? "" : urlParams.get("status") ?? "",
        options: STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) })) },
      { type: "select", name: "category", label: "Category", options: CATEGORIES.map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() })) },
      { type: "select", name: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: p[0] + p.slice(1).toLowerCase() })) },
      { type: "select", name: "assignedToId", label: "Assignee", options: staff.map((s) => ({ value: s.id, label: s.fullName })) },
      { type: "select", name: "olderThanDays", label: "Age", options: [
        { value: "3", label: "Older than 3 days" }, { value: "7", label: "Older than a week" }, { value: "30", label: "Older than a month" }] },
    ], () => { state.page = 1; load(); });

    content.append(filters.el, listWrap);

    async function load(focusId) {
      listWrap.textContent = "";
      listWrap.append(h("div", { class: "loading-row" }, h("div", { class: "spinner" }), "Loading complaints…"));
      try {
        const data = await api("/complaints", { params: { ...filters.values(), page: state.page, limit: state.limit } });
        listWrap.textContent = "";
        let items = data.items;
        // ?open=1 → only unresolved
        if (urlParams.get("open") === "1" && !filters.values().status) {
          items = items.filter((c) => OPEN.includes(c.status));
        }
        filters.setCount(`${data.total} complaint${data.total === 1 ? "" : "s"}`);
        if (!items.length) {
          listWrap.append(emptyState({ iconName: "alert", title: "Queue is clear", message: "No complaints match the current filters." }));
          return;
        }
        listWrap.append(dataTable([
          { label: "Complaint", render: (c) => h("div", { style: "min-width:180px" },
              h("div", { style: "font-weight:650", text: c.title }),
              h("div", { class: "text-small text-muted", text: `${c.student?.fullName ?? ""} · ${c.room ? `Room ${c.room.roomNumber}` : "no room ref"}` })) },
          { label: "Category", render: (c) => c.category[0] + c.category.slice(1).toLowerCase() },
          { label: "Priority", render: (c) => statusBadge(c.priority) },
          { label: "Status", render: (c) => statusBadge(c.status) },
          { label: "Assigned", render: (c) => h("span", { class: "text-small", text: c.assignedTo?.fullName ?? "Unassigned" }) },
          { label: "Age", render: (c) => h("span", { class: "text-small", text: timeAgo(c.submittedAt) }) },
          { label: "Actions", render: (c) => h("div", { class: "row-actions" },
              h("button", { class: "btn btn-primary btn-sm", onclick: () => manageModal(c.id, load) }, "Manage")) },
        ], items));
        const pager = paginationEl({ page: state.page, limit: state.limit, total: data.total, onPage: (p) => { state.page = p; load(); } });
        if (pager) listWrap.append(pager);

        const focus = focusId ?? urlParams.get("focus");
        if (focus) { urlParams.delete("focus"); manageModal(focus, load); }
      } catch (err) {
        listWrap.textContent = "";
        listWrap.append(errorState(err.message, () => load()));
      }
    }

    load();
  },
});

/* ---------------- Manage modal ---------------- */
async function manageModal(id, reload) {
  const content = h("div", {}, h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
  const modal = openModal({ title: "Manage complaint", content, size: "modal-lg", actions: [] });

  try {
    const [c, staffRes] = await Promise.all([
      api(`/complaints/${id}`),
      api("/users/staff").catch(() => ({ items: [] })),
    ]);
    content.textContent = "";

    content.append(
      h("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px" },
        statusBadge(c.status), statusBadge(c.priority),
        h("span", { class: "badge badge-neutral", text: c.category[0] + c.category.slice(1).toLowerCase() })),
      h("h3", { text: c.title }),
      h("p", { text: c.description }),
      h("dl", { class: "detail-list" },
        h("dt", { text: "Student" }), h("dd", { text: `${c.student?.fullName ?? "—"} (${c.student?.studentId ?? "no ID"})` }),
        h("dt", { text: "Submitted" }), h("dd", { text: `${formatDate(c.submittedAt)} · ${timeAgo(c.submittedAt)}` }),
        c.room ? h("dt", { text: "Room" }) : null, c.room ? h("dd", { text: `${c.room.roomNumber} (${c.room.blockName ?? ""})` }) : null,
        c.resolvedAt ? h("dt", { text: "Resolved" }) : null, c.resolvedAt ? h("dd", { text: formatDate(c.resolvedAt) }) : null));

    /* Assignment */
    const assignSel = formField({ name: "assignedToId", label: "Assigned staff member", type: "select",
      value: c.assignedTo?.id ?? "", placeholder: "Unassigned",
      options: staffRes.items.map((s) => ({ value: s.id, label: `${s.fullName} (${s.role.toLowerCase()})` })) });
    const assignBtn = h("button", { class: "btn btn-secondary btn-sm", onclick: async () => {
      setPending(assignBtn, true, "Saving…");
      try {
        await api(`/complaints/${c.id}/assignment`, { method: "PATCH", body: { assignedToId: assignSel.input.value || null } });
        toastSuccess("Assignment updated.");
        modal.close(); reload?.();
      } catch (err) { toastError(err.message); setPending(assignBtn, false); }
    } }, "Save assignment");

    /* Status change */
    const nextStatus = formField({ name: "status", label: "Move to status", type: "select", placeholder: "Choose…",
      options: STATUSES.filter((s) => s !== c.status && s !== "REOPENED").map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()) })) });
    const statusNote = formField({ name: "note", label: "Note (student-visible; required for Resolved/Closed)", textarea: true, rows: 2 });
    const statusBtn = h("button", { class: "btn btn-primary btn-sm", onclick: async () => {
      if (!nextStatus.input.value) { toastError("Choose the next status."); return; }
      setPending(statusBtn, true, "Updating…");
      try {
        await api(`/complaints/${c.id}/status`, { method: "PATCH", body: { status: nextStatus.input.value, note: statusNote.input.value.trim() || null } });
        toastSuccess(`Complaint marked ${nextStatus.input.value.replace("_", " ").toLowerCase()}.`);
        modal.close(); reload?.();
      } catch (err) { toastError(err.message); setPending(statusBtn, false); }
    } }, "Update status");

    content.append(
      h("div", { class: "card", style: "margin-top:16px;box-shadow:none;padding:var(--space-4)" },
        h("h4", { text: "Assignment & status" }),
        h("div", { style: "display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap" },
          h("div", { style: "flex:1;min-width:200px" }, assignSel.el), assignBtn),
        h("div", { style: "display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:8px" },
          h("div", { style: "flex:1;min-width:200px" }, nextStatus.el), statusBtn),
        statusNote.el));

    /* Internal note vs student-visible reply */
    const noteText = formField({ name: "noteText", label: "Add a note", textarea: true, rows: 2 });
    const visSel = formField({ name: "visibility", label: "Visibility", type: "select", value: "STUDENT_VISIBLE", options: [
      { value: "STUDENT_VISIBLE", label: "Student can see this" },
      { value: "INTERNAL", label: "Internal staff note only" }] });
    const noteBtn = h("button", { class: "btn btn-subtle btn-sm", onclick: async () => {
      if (!noteText.input.value.trim()) return;
      setPending(noteBtn, true, "Posting…");
      try {
        await api(`/complaints/${c.id}/comments`, { method: "POST", body: { message: noteText.input.value.trim(), visibility: visSel.input.value } });
        toastSuccess(visSel.input.value === "INTERNAL" ? "Internal note added." : "Reply sent to the student.");
        modal.close(); reload?.();
      } catch (err) { toastError(err.message); setPending(noteBtn, false); }
    } }, "Post note");

    content.append(
      h("div", { class: "card", style: "margin-top:16px;box-shadow:none;padding:var(--space-4)" },
        h("h4", { text: "Add note" }),
        noteText.el,
        h("div", { style: "display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap" },
          h("div", { style: "flex:1;min-width:200px" }, visSel.el), noteBtn)));

    content.append(
      h("h4", { style: "margin-top:20px", text: `Conversation (${(c.comments ?? []).length})` }),
      commentThread(c.comments ?? [], { showInternalFlag: true }),
      h("h4", { style: "margin-top:20px", text: "Audit trail" }),
      timeline(c.history ?? []));
  } catch (err) {
    content.textContent = "";
    content.append(errorState(err.message));
  }
}
