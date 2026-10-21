import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, formField, openModal, setPending, toastSuccess, toastError, emptyState, errorState, formatDateTime, timeAgo } from "../ui.js";
import { buildFilterBar, commentThread, timeline, pagination as paginationEl } from "../shared.js";

const user = await requireAuth(["STUDENT"]);
if (!user) throw new Error("redirecting");

const CATEGORIES = ["MAINTENANCE", "CLEANLINESS", "WATER", "ELECTRICITY", "WIFI", "SECURITY", "OTHER"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
const STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"];

await buildShell({
  user,
  pageTitle: "My Complaints",
  breadcrumb: "Hostel · Complaints",
  activeHref: "/student/complaints.html",
  renderPage: async ({ content }) => {
    const head = h("div", { class: "page-head" },
      h("div", {},
        h("h1", { text: "Complaints" }),
        h("p", { class: "text-muted text-small", style: "margin:0", text: "Report issues and follow every update until they're resolved." })),
      h("div", { class: "page-head-actions" },
        h("button", { class: "btn btn-primary", id: "new-complaint-btn" }, icon("plus", 15), "New complaint")));
    content.append(head);

    const listWrap = h("div", {});
    const state = { page: 1, limit: 10 };

    const filters = buildFilterBar([
      { type: "select", name: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) })) },
      { type: "select", name: "category", label: "Category", options: CATEGORIES.map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() })) },
    ], (opts) => { state.page = 1; load(); });

    content.append(filters.el, listWrap);
    document.getElementById("new-complaint-btn").addEventListener("click", () => newComplaintModal(load));

    async function load() {
      listWrap.textContent = "";
      listWrap.append(h("div", { class: "loading-row" }, h("div", { class: "spinner" }), "Loading complaints…"));
      try {
        const data = await api("/complaints/mine", { params: { ...filters.values(), page: state.page, limit: state.limit } });
        listWrap.textContent = "";
        filters.setCount(`${data.total} complaint${data.total === 1 ? "" : "s"}`);
        if (!data.items.length) {
          listWrap.append(emptyState({
            iconName: "alert",
            title: filters.values().status || filters.values().category ? "No complaints match these filters" : "No complaints yet",
            message: "Something broken, leaking, or missing? Raise a complaint and the hostel staff will pick it up.",
            actionEl: h("button", { class: "btn btn-primary btn-sm", onclick: () => newComplaintModal(load) }, icon("plus", 14), "New complaint"),
          }));
          return;
        }
        for (const c of data.items) listWrap.append(complaintRow(c, load));
        const pager = paginationEl({ page: state.page, limit: state.limit, total: data.total, onPage: (p) => { state.page = p; load(); } });
        if (pager) listWrap.append(pager);
      } catch (err) {
        listWrap.textContent = "";
        listWrap.append(errorState(err.message, load));
      }
    }

    function complaintRow(c, reload) {
      return h("div", { class: "card", style: "cursor:pointer", role: "button", tabindex: "0",
        onclick: () => complaintDetail(c.id, reload),
        onkeydown: (e) => { if (e.key === "Enter") complaintDetail(c.id, reload); } },
        h("div", { style: "display:flex;align-items:center;gap:12px;flex-wrap:wrap" },
          h("div", { style: "min-width:0;flex:1" },
            h("div", { style: "font-weight:650", text: c.title }),
            h("div", { class: "text-small text-muted",
              text: `${c.category[0]}${c.category.slice(1).toLowerCase()} · ${c.priority.toLowerCase()} priority · ${c.room ? `Room ${c.room.roomNumber} · ` : ""}submitted ${timeAgo(c.submittedAt)}` })),
          statusBadge(c.status)));
    }

    load();
  },
});

/* ---------------- New complaint modal ---------------- */
async function newComplaintModal(onCreated) {
  let rooms = [];
  try {
    const mine = await api("/allocations/mine");
    const active = mine.items.find((a) => ["ACTIVE", "APPROVED"].includes(a.status) && a.room);
    if (active) rooms = [{ value: active.room.id, label: `My room — ${active.room.roomNumber} (${active.room.blockName})` }];
    const dir = await api("/rooms", { params: { limit: 100 } });
    for (const r of dir.items) {
      if (!rooms.some((x) => x.value === r.id)) rooms.push({ value: r.id, label: `${r.roomNumber} · ${r.block?.name ?? ""}` });
    }
  } catch { /* room ref optional */ }

  const title = formField({ name: "title", label: "Title", required: true, placeholder: "e.g. Geyser not heating water", attrs: { maxlength: 120 } });
  const category = formField({ name: "category", label: "Category", type: "select", required: true, placeholder: "Select a category…",
    options: CATEGORIES.map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() })) });
  const priority = formField({ name: "priority", label: "Suggested priority", type: "select", value: "NORMAL",
    options: PRIORITIES.map((p) => ({ value: p, label: p[0] + p.slice(1).toLowerCase() })),
    help: "Staff make the final call on priority — mark URGENT only for safety-critical issues." });
  const room = formField({ name: "roomId", label: "Related room (optional)", type: "select", placeholder: "Not room-specific", options: rooms });
  const desc = formField({ name: "description", label: "Describe the issue", textarea: true, required: true, rows: 4,
    placeholder: "What is happening, since when, and how it affects you. Min 10 characters." });
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-primary", type: "submit" }, "Submit complaint");

  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault();
    err.className = "form-banner";
    // quick client-side pass (server re-validates)
    let ok = true;
    if (title.input.value.trim().length < 4) { err.className = "form-banner error visible"; err.textContent = "Title must be at least 4 characters."; ok = false; }
    else if (!category.input.value) { err.className = "form-banner error visible"; err.textContent = "Select a category."; ok = false; }
    else if (desc.input.value.trim().length < 10) { err.className = "form-banner error visible"; err.textContent = "Please describe the issue in at least 10 characters."; ok = false; }
    if (!ok) return;

    setPending(submit, true, "Submitting…");
    try {
      const created = await api("/complaints", {
        method: "POST",
        body: {
          title: title.input.value.trim(),
          category: category.input.value,
          description: desc.input.value.trim(),
          priority: priority.input.value || "NORMAL",
          roomId: room.input.value || null,
        },
      });
      modal.close();
      toastSuccess(`Complaint submitted — your reference ID is ${created.id.slice(0, 8)}…`);
      onCreated?.();
    } catch (e2) {
      err.className = "form-banner error visible";
      err.textContent = e2.details?.map((d) => d.message).join(" ") || e2.message;
    } finally {
      setPending(submit, false);
    }
  } }, err, title.el, category.el, h("div", { class: "form-row" }, priority.el, room.el), desc.el, submit);

  const modal = openModal({ title: "New complaint", content: form, size: "modal-lg",
    actions: [h("button", { class: "btn btn-secondary", type: "button", onclick: () => modal.close() }, "Cancel")] });
}

/* ---------------- Complaint detail modal ---------------- */
async function complaintDetail(id, reload) {
  const content = h("div", {}, h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
  const modal = openModal({ title: "Complaint details", content, size: "modal-lg", actions: [] });
  try {
    const c = await api(`/complaints/${id}`);
    content.textContent = "";

    content.append(
      h("div", { style: "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px" },
        statusBadge(c.status), statusBadge(c.priority), h("span", { class: "badge badge-neutral", text: c.category[0] + c.category.slice(1).toLowerCase() })),
      h("p", { text: c.description }),
      h("dl", { class: "detail-list" },
        h("dt", { text: "Reference" }), h("dd", { class: "text-mono", text: c.id.slice(0, 13) + "…" }),
        h("dt", { text: "Submitted" }), h("dd", { text: formatDateTime(c.submittedAt) }),
        c.room ? h("dt", { text: "Room" }) : null, c.room ? h("dd", { text: `${c.room.roomNumber} (${c.room.blockName ?? ""})` }) : null,
        c.assignedTo ? h("dt", { text: "Handled by" }) : null, c.assignedTo ? h("dd", { text: c.assignedTo.fullName }) : null,
        c.resolvedAt ? h("dt", { text: "Resolved" }) : null, c.resolvedAt ? h("dd", { text: formatDateTime(c.resolvedAt) }) : null));

    // Reopen action for resolved complaints (within the server-side window)
    if (["RESOLVED", "CLOSED"].includes(c.status)) {
      const reopenBtn = h("button", { class: "btn btn-secondary btn-sm", onclick: () => reopenFlow(c, modal, reload) }, icon("refresh", 14), "Not fixed? Reopen");
      content.append(h("div", { style: "margin-top:12px" }, reopenBtn));
    }

    content.append(
      h("h4", { style: "margin-top:20px", text: "Staff responses" }),
      commentThread(c.comments ?? []),
      h("h4", { style: "margin-top:20px", text: "Status history" }),
      timeline(c.history ?? []));

    // Reply box (student-visible comment)
    const msg = formField({ name: "message", label: "Add a note for staff (optional)", textarea: true, rows: 2 });
    const send = h("button", { class: "btn btn-subtle btn-sm", onclick: async () => {
      if (!msg.input.value.trim()) return;
      setPending(send, true, "Sending…");
      try {
        await api(`/complaints/${c.id}/comments`, { method: "POST", body: { message: msg.input.value.trim(), visibility: "STUDENT_VISIBLE" } });
        modal.close();
        toastSuccess("Note added.");
        reload?.();
      } catch (err) { toastError(err.message); } finally { setPending(send, false); }
    } }, "Send note");
    content.append(h("div", { style: "margin-top:16px" }, msg.el, send));
  } catch (err) {
    content.textContent = "";
    content.append(errorState(err.message));
  }
}

async function reopenFlow(c, modal, reload) {
  const note = formField({ name: "note", label: "Why is it not resolved?", textarea: true, rows: 3, required: true,
    placeholder: "Describe what is still wrong — this goes to the staff." });
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-primary", type: "submit" }, "Reopen complaint");
  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault();
    if (note.input.value.trim().length < 3) { err.className = "form-banner error visible"; err.textContent = "Please explain briefly."; return; }
    setPending(submit, true, "Reopening…");
    try {
      await api(`/complaints/${c.id}/status`, { method: "PATCH", body: { status: "REOPENED", note: note.input.value.trim() } });
      inner.close(); modal.close();
      toastSuccess("Complaint reopened — it's back in the staff queue.");
      reload?.();
    } catch (e2) {
      err.className = "form-banner error visible";
      err.textContent = e2.message;
      setPending(submit, false);
    }
  } }, err, note.el, submit);
  const inner = openModal({ title: "Reopen complaint", content: form,
    actions: [h("button", { class: "btn btn-secondary", onclick: () => inner.close() }, "Cancel")] });
}
