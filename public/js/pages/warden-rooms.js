import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, formField, openModal, confirmDialog, setPending, toastSuccess, toastError, emptyState, errorState } from "../ui.js";
import { buildFilterBar, loadBlocks, dataTable, pagination as paginationEl } from "../shared.js";

const user = await requireAuth(["WARDEN", "ADMIN"]);
if (!user) throw new Error("redirecting");

const ROOM_TYPES = ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "DORMITORY"];
const AMENITIES = ["Wi-Fi", "Attached Bathroom", "Study Desk", "Wardrobe", "AC", "Geyser", "Balcony", "Laundry"];

await buildShell({
  user,
  pageTitle: "Room Administration",
  breadcrumb: "Management · Rooms",
  activeHref: "/warden/rooms.html",
  renderPage: async ({ content }) => {
    let blocks = [];
    try { blocks = await loadBlocks(); } catch { /* handled below */ }

    const head = h("div", { class: "page-head" },
      h("div", {},
        h("h1", { text: "Rooms" }),
        h("p", { class: "text-muted text-small", style: "margin:0", text: "Occupancy is computed live from active allocations. Rooms with history are deactivated, never deleted." })),
      h("div", { class: "page-head-actions" },
        h("button", { class: "btn btn-primary", id: "add-room" }, icon("plus", 15), "Add room")));
    content.append(head);
    document.getElementById("add-room").addEventListener("click", () => roomFormModal(blocks, null, load));

    const listWrap = h("div", {});
    const state = { page: 1, limit: 12 };

    const filters = buildFilterBar([
      { type: "search", name: "q", label: "Search room or block…" },
      { type: "select", name: "blockId", label: "All blocks", options: blocks.map((b) => ({ value: b.id, label: b.name })) },
      { type: "select", name: "roomType", label: "Room type", options: ROOM_TYPES.map((t) => ({ value: t, label: t[0] + t.slice(1).toLowerCase() })) },
      { type: "select", name: "status", label: "Status", options: [
        { value: "MAINTENANCE", label: "Maintenance" }, { value: "INACTIVE", label: "Inactive" }] },
    ], () => { state.page = 1; load(); });

    content.append(filters.el, listWrap);

    async function load() {
      listWrap.textContent = "";
      listWrap.append(h("div", { class: "loading-row" }, h("div", { class: "spinner" }), "Loading rooms…"));
      try {
        const data = await api("/rooms", { params: { ...filters.values(), page: state.page, limit: state.limit } });
        listWrap.textContent = "";
        filters.setCount(`${data.total} rooms`);
        if (!data.items.length) {
          listWrap.append(emptyState({ iconName: "bed", title: "No rooms found", message: "Adjust filters or add the first room.",
            actionEl: h("button", { class: "btn btn-primary btn-sm", onclick: () => roomFormModal(blocks, null, load) }, "Add room") }));
          return;
        }
        listWrap.append(dataTable([
          { label: "Room", render: (r) => h("div", {},
              h("div", { style: "font-weight:650", text: r.roomNumber }),
              h("div", { class: "text-small text-muted", text: r.block?.name ?? "" })) },
          { label: "Floor", render: (r) => String(r.floor) },
          { label: "Type", render: (r) => r.roomType[0] + r.roomType.slice(1).toLowerCase() },
          { label: "Occupancy", render: (r) => h("div", { style: "min-width:120px" },
              h("div", { class: "text-small", text: `${r.occupancy}/${r.capacity} beds` }),
              h("div", { class: "meter", style: "margin-top:4px" },
                h("div", { style: `width:${r.capacity ? Math.round((r.occupancy / r.capacity) * 100) : 0}%` }))) },
          { label: "Status", render: (r) => statusBadge(r.status) },
          { label: "Amenities", render: (r) => h("div", { class: "amenity-tags" }, ...(r.amenities ?? []).slice(0, 3).map((a) => h("span", { class: "amenity-tag", text: a })), (r.amenities?.length ?? 0) > 3 ? h("span", { class: "amenity-tag", text: `+${r.amenities.length - 3}` }) : null) },
          { label: "Actions", className: "nowrap", render: (r) => h("div", { class: "row-actions" },
              h("button", { class: "btn btn-secondary btn-sm", onclick: () => roomDetailModal(r, blocks, load) }, "Manage")) },
        ], data.items));
        const pager = paginationEl({ page: state.page, limit: state.limit, total: data.total, onPage: (p) => { state.page = p; load(); } });
        if (pager) listWrap.append(pager);
      } catch (err) {
        listWrap.textContent = "";
        listWrap.append(errorState(err.message, load));
      }
    }

    load();
  },
});

/* ---------------- Room detail / manage modal ---------------- */
async function roomDetailModal(summary, blocks, reload) {
  const content = h("div", {}, h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
  const modal = openModal({ title: `Room ${summary.roomNumber}`, content, size: "modal-lg", actions: [] });
  try {
    const r = await api(`/rooms/${summary.id}`);
    content.textContent = "";
    content.append(
      h("div", { style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px" },
        statusBadge(r.status),
        h("span", { class: "text-small text-muted", text: `${r.block?.name} · Floor ${r.floor} · ${r.roomType.toLowerCase()} · ${r.occupancy}/${r.capacity} occupied` })),
      h("h4", { text: "Residents (staff view)" }),
      r.residents?.length
        ? h("div", { class: "table-wrap" }, h("table", { class: "data-table" },
            h("thead", {}, h("tr", {}, h("th", { text: "Student" }), h("th", { text: "ID" }), h("th", { text: "Since" }))),
            h("tbody", {}, ...r.residents.map((res) => h("tr", {},
              h("td", { "data-label": "Student", text: res.studentName }),
              h("td", { "data-label": "ID", class: "text-mono", text: res.studentId ?? "—" }),
              h("td", { "data-label": "Since", text: new Date(res.since).toLocaleDateString() }))))))
        : h("p", { class: "text-muted text-small", text: "No active residents." }),
      h("h4", { style: "margin-top:20px", text: "Room status" }),
      h("p", { class: "text-small text-muted", text: "Maintenance and Inactive rooms cannot receive new allocations. Rooms with residents must be emptied (transfer/vacate) before being taken out of service." }));

    const statusRow = h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" });
    for (const st of ["AVAILABLE", "MAINTENANCE", "INACTIVE"]) {
      const btn = h("button", {
        class: `btn btn-sm ${r.status === st || (st === "AVAILABLE" && r.status === "FULL") ? "btn-primary" : "btn-secondary"}`,
        disabled: r.status === st,
        onclick: () => changeStatus(r, st, btn, modal, reload),
      }, st === "INACTIVE" ? "Deactivate" : st[0] + st.slice(1).toLowerCase());
      statusRow.append(btn);
    }
    if (r.status === "FULL") statusRow.prepend(h("span", { class: "badge badge-danger", style: "align-self:center", text: "FULL — derived from occupancy" }));
    content.append(statusRow);

    content.append(h("div", { style: "margin-top:20px;display:flex;gap:8px" },
      h("button", { class: "btn btn-secondary btn-sm", onclick: () => { modal.close(); roomFormModal(blocks, r, reload); } }, icon("edit", 14), "Edit details")));
  } catch (err) {
    content.textContent = "";
    content.append(errorState(err.message));
  }
}

async function changeStatus(room, status, btn, modal, reload) {
  if (status === "INACTIVE") {
    const ok = await confirmDialog({
      title: "Deactivate this room?",
      message: "The room will stop accepting allocations and disappear from the student directory. It is kept for historical records — rooms are never deleted. You can reactivate it later by setting status to Available.",
      confirmLabel: "Deactivate room", danger: true,
    });
    if (!ok) return;
  }
  setPending(btn, true, "Saving…");
  try {
    await api(`/rooms/${room.id}/status`, { method: "PATCH", body: { status } });
    toastSuccess(`Room ${room.roomNumber} marked ${status.toLowerCase()}.`);
    modal.close();
    reload?.();
  } catch (err) {
    toastError(err.message);
    setPending(btn, false);
  }
}

/* ---------------- Create / edit room modal ---------------- */
function roomFormModal(blocks, existing, reload) {
  const block = formField({ name: "blockId", label: "Hostel block", type: "select", required: true,
    value: existing?.block?.id ?? existing?.blockId ?? "",
    placeholder: "Select a block…", options: blocks.filter((b) => b.isActive !== false).map((b) => ({ value: b.id, label: b.name })) });
  const number = formField({ name: "roomNumber", label: "Room number", required: true, value: existing?.roomNumber ?? "", placeholder: "e.g. A-301", attrs: { maxlength: 20 } });
  const floor = formField({ name: "floor", label: "Floor", type: "number", required: true, value: existing?.floor ?? 1, min: 0, max: 50 });
  const type = formField({ name: "roomType", label: "Room type", type: "select", required: true, value: existing?.roomType ?? "",
    placeholder: "Select type…", options: ROOM_TYPES.map((t) => ({ value: t, label: t[0] + t.slice(1).toLowerCase() })) });
  const capacity = formField({ name: "capacity", label: "Capacity (beds)", type: "number", required: true, value: existing?.capacity ?? 2, min: 1, max: 50,
    help: "Cannot be set below current occupancy." });
  const amenitiesWrap = h("div", { class: "form-field" },
    h("span", { class: "form-label", text: "Amenities" }),
    h("div", { style: "display:flex;flex-wrap:wrap;gap:10px" },
      ...AMENITIES.map((a) => {
        const id = `am-${a.replace(/\W/g, "")}`;
        const cb = h("input", { type: "checkbox", id, value: a });
        if ((existing?.amenities ?? []).includes(a)) cb.checked = true;
        return h("label", { class: "checkbox-line", for: id }, cb, a);
      })));
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-primary", type: "submit", text: existing ? "Save changes" : "Create room" });

  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault();
    err.className = "form-banner";
    const amenities = [...amenitiesWrap.querySelectorAll("input:checked")].map((i) => i.value);
    const body = {
      blockId: block.input.value, roomNumber: number.input.value.trim(),
      floor: Number(floor.input.value), roomType: type.input.value,
      capacity: Number(capacity.input.value), amenities,
    };
    if (!body.blockId) { err.className = "form-banner error visible"; err.textContent = "Select a hostel block."; return; }
    if (!body.roomNumber) { err.className = "form-banner error visible"; err.textContent = "Room number is required."; return; }
    if (!Number.isInteger(body.capacity) || body.capacity < 1) { err.className = "form-banner error visible"; err.textContent = "Capacity must be a positive whole number."; return; }

    setPending(submit, true, existing ? "Saving…" : "Creating…");
    try {
      if (existing) await api(`/rooms/${existing.id}`, { method: "PATCH", body });
      else await api("/rooms", { method: "POST", body });
      modal.close();
      toastSuccess(existing ? `Room ${body.roomNumber} updated.` : `Room ${body.roomNumber} created.`);
      reload?.();
    } catch (e2) {
      err.className = "form-banner error visible";
      err.textContent = e2.details?.map((d) => d.message).join(" ") || e2.message;
      setPending(submit, false);
    }
  } }, err,
    h("div", { class: "form-row" }, block.el, number.el),
    h("div", { class: "form-row" }, floor.el, type.el),
    capacity.el, amenitiesWrap, submit);

  const modal = openModal({
    title: existing ? `Edit Room ${existing.roomNumber}` : "Add a room",
    content: form, size: "modal-lg",
    actions: [h("button", { class: "btn btn-secondary", onclick: () => modal.close() }, "Cancel")],
  });
}
