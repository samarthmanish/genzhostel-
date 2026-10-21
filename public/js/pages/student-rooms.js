import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, emptyState, errorState, toastSuccess, toastError, setPending, formField, openModal, confirmDialog } from "../ui.js";
import { buildFilterBar, loadBlocks, pagination as paginationEl } from "../shared.js";

const user = await requireAuth(["STUDENT"]);
if (!user) throw new Error("redirecting");

const ROOM_TYPES = ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "DORMITORY"];
const AMENITIES = ["Wi-Fi", "Attached Bathroom", "Study Desk", "Wardrobe", "AC", "Geyser", "Balcony", "Laundry"];

await buildShell({
  user,
  pageTitle: "Room Directory",
  breadcrumb: "Hostel · Rooms",
  activeHref: "/student/rooms.html",
  renderPage: async ({ content }) => {
    content.append(h("p", { class: "text-muted", style: "margin-bottom:var(--space-5)",
      text: "Live availability computed from current allocations. Only rooms with free beds accept requests — the warden makes the final assignment." }));

    const listWrap = h("div", {});
    const state = { page: 1, limit: 9, blocks: [] };

    try {
      state.blocks = await loadBlocks();
    } catch { /* filters will lack block names */ }

    const filters = buildFilterBar([
      { type: "search", name: "q", label: "Search room number or block…" },
      { type: "select", name: "blockId", label: "All blocks", options: state.blocks.map((b) => ({ value: b.id, label: b.name })) },
      { type: "select", name: "roomType", label: "Room type", options: ROOM_TYPES.map((t) => ({ value: t, label: t[0] + t.slice(1).toLowerCase() })) },
      { type: "select", name: "availability", label: "Availability", options: [{ value: "available", label: "Available only" }, { value: "full", label: "Full" }] },
      { type: "select", name: "amenity", label: "Amenity", options: AMENITIES.map((a) => ({ value: a, label: a })) },
    ], (opts) => {
      if (opts?.reset) { // rebuild filter values & reload
        state.page = 1;
        load({ q: "", blockId: "", roomType: "", availability: "", amenity: "" });
        location.hash = "";
        return;
      }
      state.page = 1;
      load();
    });

    content.append(filters.el, listWrap);

    // Own allocation state — hide the request button if the student already has one
    let hasActiveOrPending = false;
    try {
      const mine = await api("/allocations/mine");
      hasActiveOrPending = mine.items.some((a) => ["ACTIVE", "APPROVED", "PENDING"].includes(a.status));
    } catch { /* non-fatal */ }

    async function load(overrideParams) {
      listWrap.textContent = "";
      listWrap.append(h("div", { class: "grid grid-3" }, skeleton(), skeleton(), skeleton()));
      const params = overrideParams ?? { ...filters.values(), page: state.page, limit: state.limit };
      if (!overrideParams) { params.page = state.page; params.limit = state.limit; }
      try {
        const data = await api("/rooms", { params });
        listWrap.textContent = "";
        filters.setCount(`${data.total} room${data.total === 1 ? "" : "s"}`);
        if (!data.items.length) {
          listWrap.append(emptyState({
            iconName: "bed",
            title: "No rooms match your filters",
            message: "Try clearing a filter or searching for a different block or room number.",
          }));
          return;
        }
        listWrap.append(h("div", { class: "grid grid-3" }, ...data.items.map((r) => roomCard(r))));
        const pager = paginationEl({ page: state.page, limit: state.limit, total: data.total, onPage: (p) => { state.page = p; load(); } });
        if (pager) listWrap.append(pager);
      } catch (err) {
        listWrap.textContent = "";
        listWrap.append(errorState(err.message, () => load()));
      }
    }

    function skeleton() {
      return h("div", { class: "room-card" },
        h("div", { class: "skeleton", style: "height:24px;width:45%" }),
        h("div", { class: "skeleton", style: "height:12px;width:80%" }),
        h("div", { class: "skeleton", style: "height:12px;width:60%" }),
        h("div", { class: "skeleton", style: "height:36px;width:100%;margin-top:auto" }));
    }

    function roomCard(r) {
      const occPct = r.capacity ? Math.round((r.occupancy / r.capacity) * 100) : 0;
      const canRequest = r.canRequest && !hasActiveOrPending;
      const reqBtn = h("button", {
        class: `btn btn-sm ${canRequest ? "btn-primary" : "btn-secondary"}`,
        disabled: !canRequest,
        title: hasActiveOrPending && r.canRequest ? "You already have an active allocation or pending request" : "",
        onclick: () => requestRoom(r, reqBtn),
      }, icon("key", 14), "Request this room");

      return h("article", { class: "room-card" },
        h("div", { class: "room-head" },
          h("div", {},
            h("div", { class: "room-number", text: r.roomNumber }),
            h("div", { class: "room-block", text: `${r.block?.name ?? ""} · Floor ${r.floor}` })),
          statusBadge(r.status)),
        h("div", { class: "room-meta" },
          h("span", {}, icon("users", 14), `${r.roomType[0]}${r.roomType.slice(1).toLowerCase()} · ${r.occupancy}/${r.capacity} occupied`)),
        h("div", { class: "occupancy-bar", role: "img", "aria-label": `${occPct}% occupied` },
          h("div", { style: `width:${occPct}%` })),
        r.amenities?.length
          ? h("div", { class: "amenity-tags" }, ...r.amenities.map((a) => h("span", { class: "amenity-tag", text: a })))
          : null,
        h("div", { class: "room-foot" },
          h("span", { class: "beds-note", text: r.availableBeds > 0 ? `${r.availableBeds} bed${r.availableBeds === 1 ? "" : "s"} free` : "No free beds" }),
          reqBtn));
    }

    async function requestRoom(room, btn) {
      const noteField = formField({
        name: "preferenceNote", label: "Preference note (optional)", textarea: true, rows: 3,
        placeholder: "Anything the warden should know — e.g. preferred roommate, medical needs, move-in date.",
        help: `You are requesting Room ${room.roomNumber} (${room.block?.name}). The warden confirms the final assignment.`,
      });
      const errorEl = h("div", { class: "form-banner", role: "alert" });
      const submit = h("button", { class: "btn btn-primary", type: "button" }, "Submit request");
      const modal = openModal({
        title: `Request Room ${room.roomNumber}`,
        content: h("div", {}, errorEl, noteField.el),
        actions: [h("button", { class: "btn btn-secondary", type: "button", onclick: () => modal.close() }, "Cancel"), submit],
      });
      submit.addEventListener("click", async () => {
        setPending(submit, true, "Submitting…");
        try {
          await api("/allocations/requests", {
            method: "POST",
            body: { roomId: room.id, preferenceNote: noteField.input.value.trim() || null },
          });
          modal.close();
          toastSuccess(`Request submitted for Room ${room.roomNumber}. Track it on the Allocation page.`);
          hasActiveOrPending = true;
          load();
        } catch (err) {
          setPending(submit, false);
          errorEl.className = "form-banner error visible";
          errorEl.textContent = err.message;
        }
      });
    }

    load();
  },
});
