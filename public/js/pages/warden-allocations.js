import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, formField, openModal, confirmDialog, setPending, toastSuccess, toastError, emptyState, errorState, formatDate, timeAgo } from "../ui.js";
import { buildFilterBar, dataTable, pagination as paginationEl, timeline, roomOptions, loadBlocks } from "../shared.js";

const user = await requireAuth(["WARDEN", "ADMIN"]);
if (!user) throw new Error("redirecting");

const STATUSES = ["PENDING", "ACTIVE", "REJECTED", "VACATED", "CANCELLED"];

await buildShell({
  user,
  pageTitle: "Allocation Management",
  breadcrumb: "Management · Allocations",
  activeHref: "/warden/allocations.html",
  renderPage: async ({ content }) => {
    const params = new URLSearchParams(location.search);
    let blocks = [];
    try { blocks = await loadBlocks(); } catch { /* optional */ }

    content.append(h("div", { class: "page-head" },
      h("div", {},
        h("h1", { text: "Allocations" }),
        h("p", { class: "text-muted text-small", style: "margin:0", text: "Approvals re-check capacity inside a database transaction — the last bed can never be double-booked." }))));

    const listWrap = h("div", {});
    const state = { page: 1, limit: 10 };

    const filters = buildFilterBar([
      { type: "search", name: "q", label: "Search student or room…" },
      { type: "select", name: "status", label: "Status", value: params.get("status") ?? "PENDING",
        options: STATUSES.map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })) },
      { type: "select", name: "blockId", label: "All blocks", options: blocks.map((b) => ({ value: b.id, label: b.name })) },
    ], () => { state.page = 1; load(); });

    content.append(filters.el, listWrap);

    async function load() {
      listWrap.textContent = "";
      listWrap.append(h("div", { class: "loading-row" }, h("div", { class: "spinner" }), "Loading allocations…"));
      try {
        const data = await api("/allocations", { params: { ...filters.values(), page: state.page, limit: state.limit } });
        listWrap.textContent = "";
        filters.setCount(`${data.total} record${data.total === 1 ? "" : "s"}`);
        if (!data.items.length) {
          listWrap.append(emptyState({ iconName: "key", title: "Nothing in this queue", message: "No allocation records match the current filters." }));
          return;
        }
        listWrap.append(dataTable([
          { label: "Student", render: (a) => h("div", {},
              h("div", { style: "font-weight:650", text: a.student?.fullName ?? "—" }),
              h("div", { class: "text-small text-muted", text: `${a.student?.studentId ?? ""}${a.student?.course ? ` · ${a.student.course}` : ""}` })) },
          { label: "Room", render: (a) => a.room ? h("div", {},
              h("div", { text: a.room.roomNumber }),
              h("div", { class: "text-small text-muted", text: a.room.blockName })) : h("span", { class: "text-muted text-small", text: a.status === "PENDING" ? (a.preferenceNote ? "Preference noted" : "No preference") : "—" }) },
          { label: "Status", render: (a) => statusBadge(a.status) },
          { label: "Requested", render: (a) => h("span", { class: "text-small", text: `${formatDate(a.requestedAt)} · ${timeAgo(a.requestedAt)}` }) },
          { label: "Actions", render: (a) => h("div", { class: "row-actions" }, ...rowActions(a, load)) },
        ], data.items));
        const pager = paginationEl({ page: state.page, limit: state.limit, total: data.total, onPage: (p) => { state.page = p; load(); } });
        if (pager) listWrap.append(pager);
      } catch (err) {
        listWrap.textContent = "";
        listWrap.append(errorState(err.message, load));
      }
    }

    function rowActions(a, reload) {
      const btns = [];
      btns.push(h("button", { class: "btn btn-secondary btn-sm", onclick: () => detailModal(a.id, reload) }, "Details"));
      if (a.status === "PENDING") {
        btns.push(h("button", { class: "btn btn-primary btn-sm", onclick: () => approveModal(a, reload) }, "Approve…"));
        btns.push(h("button", { class: "btn btn-danger-subtle btn-sm", onclick: () => rejectModal(a, reload) }, "Reject…"));
      }
      if (["ACTIVE", "APPROVED"].includes(a.status)) {
        btns.push(h("button", { class: "btn btn-secondary btn-sm", onclick: () => transferModal(a, reload) }, icon("transfer", 13), "Transfer"));
        btns.push(h("button", { class: "btn btn-danger-subtle btn-sm", onclick: () => vacateModal(a, reload) }, "Vacate"));
      }
      return btns;
    }

    load();
  },
});

/* ---------------- Detail modal ---------------- */
async function detailModal(id, reload) {
  const content = h("div", {}, h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
  const modal = openModal({ title: "Allocation details", content, size: "modal-lg", actions: [] });
  try {
    const a = await api(`/allocations/${id}`);
    content.textContent = "";
    content.append(
      h("div", { style: "display:flex;gap:10px;align-items:center;margin-bottom:12px" }, statusBadge(a.status),
        a.room ? h("strong", { text: `Room ${a.room.roomNumber} · ${a.room.blockName}` }) : null),
      h("dl", { class: "detail-list" },
        h("dt", { text: "Student" }), h("dd", { text: `${a.student?.fullName ?? "—"} (${a.student?.studentId ?? "no ID"})` }),
        h("dt", { text: "Requested" }), h("dd", { text: formatDate(a.requestedAt) }),
        a.decidedAt ? h("dt", { text: "Decided" }) : null, a.decidedAt ? h("dd", { text: `${formatDate(a.decidedAt)} by ${a.decidedBy?.fullName ?? "—"}` }) : null,
        a.decisionReason ? h("dt", { text: "Reason" }) : null, a.decisionReason ? h("dd", { text: a.decisionReason }) : null,
        a.preferenceNote ? h("dt", { text: "Student note" }) : null, a.preferenceNote ? h("dd", { text: a.preferenceNote }) : null,
        a.startDate ? h("dt", { text: "Start" }) : null, a.startDate ? h("dd", { text: formatDate(a.startDate) }) : null,
        a.endDate ? h("dt", { text: "End" }) : null, a.endDate ? h("dd", { text: formatDate(a.endDate) }) : null),
      h("h4", { style: "margin-top:20px", text: "Status history" }),
      timeline(a.history ?? []));
  } catch (err) {
    content.textContent = "";
    content.append(errorState(err.message));
  }
}

/* ---------------- Approve ---------------- */
async function approveModal(allocation, reload) {
  const content = h("div", {}, h("div", { class: "loading-row" }, h("div", { class: "spinner" }), "Loading available rooms…"));
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-primary", disabled: true }, "Approve & assign");
  const modal = openModal({
    title: `Approve request — ${allocation.student?.fullName ?? "student"}`,
    content: h("div", {}, err, content),
    actions: [h("button", { class: "btn btn-secondary", onclick: () => modal.close() }, "Cancel"), submit],
  });

  try {
    const opts = await roomOptions({ onlyAvailable: true });
    content.textContent = "";
    if (allocation.preferenceNote) {
      content.append(h("p", { class: "text-small", style: "background:var(--color-primary-soft);padding:10px 12px;border-radius:10px" },
        h("strong", { text: "Student note: " }), allocation.preferenceNote));
    }
    if (allocation.room) {
      content.append(h("p", { class: "text-small text-muted", text: `Student preferred ${allocation.room.roomNumber} (${allocation.room.blockName}). It is offered below only if it still has capacity.` }));
    }
    const roomSel = formField({ name: "roomId", label: "Assign room", type: "select", required: true,
      placeholder: "Select an available room…",
      value: opts.some((o) => o.value === allocation.room?.id) ? allocation.room.id : "",
      options: opts,
      help: opts.length ? `${opts.length} room(s) have free beds right now.` : "No rooms currently have free beds." });
    const reason = formField({ name: "reason", label: "Note for the student (optional)", placeholder: "e.g. Assigned as per your block preference." });
    content.append(roomSel.el, reason.el);

    submit.disabled = opts.length === 0;
    submit.addEventListener("click", async () => {
      if (!roomSel.input.value) { err.className = "form-banner error visible"; err.textContent = "Select a room to assign."; return; }
      setPending(submit, true, "Approving…");
      try {
        await api(`/allocations/${allocation.id}/approve`, {
          method: "POST",
          body: { roomId: roomSel.input.value, reason: reason.input.value.trim() || null },
        });
        modal.close();
        toastSuccess("Request approved — the student can now see their room.");
        reload?.();
      } catch (e) {
        err.className = "form-banner error visible";
        err.textContent = e.message; // e.g. ROOM_CAPACITY_EXCEEDED if someone took the last bed first
        setPending(submit, false);
      }
    });
  } catch (e) {
    content.textContent = "";
    content.append(errorState(e.message));
  }
}

/* ---------------- Reject ---------------- */
function rejectModal(allocation, reload) {
  const reason = formField({ name: "reason", label: "Reason (visible to the student)", textarea: true, rows: 3, required: true,
    placeholder: "Explain why — e.g. no capacity in preferred block this semester." });
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-danger", type: "submit" }, "Reject request");
  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault();
    if (reason.input.value.trim().length < 3) { err.className = "form-banner error visible"; err.textContent = "A reason is required (min 3 characters)."; return; }
    setPending(submit, true, "Rejecting…");
    try {
      await api(`/allocations/${allocation.id}/reject`, { method: "POST", body: { reason: reason.input.value.trim() } });
      modal.close();
      toastSuccess("Request rejected with reason.");
      reload?.();
    } catch (e2) {
      err.className = "form-banner error visible"; err.textContent = e2.message;
      setPending(submit, false);
    }
  } }, err, reason.el, submit);
  const modal = openModal({
    title: `Reject request — ${allocation.student?.fullName ?? "student"}`,
    content: form,
    actions: [h("button", { class: "btn btn-secondary", onclick: () => modal.close() }, "Cancel")],
  });
}

/* ---------------- Vacate ---------------- */
async function vacateModal(allocation, reload) {
  const ok = await confirmDialog({
    title: "Vacate this allocation?",
    message: `This ends ${allocation.student?.fullName ?? "the student"}'s stay in Room ${allocation.room?.roomNumber ?? ""}. The bed becomes available immediately and the action is recorded in the audit trail. You will still add a reason on the next step.`,
    confirmLabel: "Continue", danger: true,
  });
  if (!ok) return;
  const reason = formField({ name: "reason", label: "Reason (required)", textarea: true, rows: 2, required: true, placeholder: "e.g. Student checked out / disciplinary action / semester end." });
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-danger", type: "submit" }, "Confirm vacate");
  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault();
    if (reason.input.value.trim().length < 3) { err.className = "form-banner error visible"; err.textContent = "A reason is required."; return; }
    setPending(submit, true, "Vacating…");
    try {
      await api(`/allocations/${allocation.id}/vacate`, { method: "POST", body: { reason: reason.input.value.trim() } });
      modal.close();
      toastSuccess("Allocation vacated; the bed is available again.");
      reload?.();
    } catch (e2) {
      err.className = "form-banner error visible"; err.textContent = e2.message;
      setPending(submit, false);
    }
  } }, err, reason.el, submit);
  const modal = openModal({ title: "Vacate allocation", content: form,
    actions: [h("button", { class: "btn btn-secondary", onclick: () => modal.close() }, "Cancel")] });
}

/* ---------------- Transfer ---------------- */
async function transferModal(allocation, reload) {
  const content = h("div", {}, h("div", { class: "loading-row" }, h("div", { class: "spinner" }), "Loading destination rooms…"));
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-primary", disabled: true }, "Transfer");
  const modal = openModal({
    title: `Transfer — ${allocation.student?.fullName ?? "student"}`,
    content: h("div", {}, err, content),
    actions: [h("button", { class: "btn btn-secondary", onclick: () => modal.close() }, "Cancel"), submit],
  });
  try {
    const opts = (await roomOptions({ onlyAvailable: true })).filter((o) => o.value !== allocation.room?.id);
    content.textContent = "";
    content.append(h("p", { class: "text-small text-muted", text: `Current room: ${allocation.room?.roomNumber ?? "—"} (${allocation.room?.blockName ?? ""}). Transfer is transactional — capacity is re-checked at commit time.` }));
    if (!opts.length) {
      content.append(emptyState({ iconName: "bed", title: "No destination rooms available", message: "All other rooms are full or out of service." }));
      return;
    }
    const roomSel = formField({ name: "toRoomId", label: "Destination room", type: "select", required: true, placeholder: "Select destination…", options: opts });
    const reason = formField({ name: "reason", label: "Reason (required)", textarea: true, rows: 2, placeholder: "e.g. Student request / maintenance of current room." });
    content.append(roomSel.el, reason.el);
    submit.disabled = false;
    submit.addEventListener("click", async () => {
      if (!roomSel.input.value || reason.input.value.trim().length < 3) {
        err.className = "form-banner error visible"; err.textContent = "Select a destination and provide a reason (min 3 characters)."; return;
      }
      setPending(submit, true, "Transferring…");
      try {
        await api(`/allocations/${allocation.id}/transfer`, { method: "POST", body: { toRoomId: roomSel.input.value, reason: reason.input.value.trim() } });
        modal.close();
        toastSuccess("Student transferred successfully.");
        reload?.();
      } catch (e) {
        err.className = "form-banner error visible"; err.textContent = e.message;
        setPending(submit, false);
      }
    });
  } catch (e) {
    content.textContent = "";
    content.append(errorState(e.message));
  }
}
