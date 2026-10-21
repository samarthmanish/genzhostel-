import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, formatDate, formatDateTime, timeAgo, emptyState, errorState, toastSuccess, setPending, formField, openModal, confirmDialog } from "../ui.js";
import { timeline, roomOptions } from "../shared.js";

const user = await requireAuth(["STUDENT"]);
if (!user) throw new Error("redirecting");

await buildShell({
  user,
  pageTitle: "My Allocation",
  breadcrumb: "Hostel · Allocation",
  activeHref: "/student/allocation.html",
  renderPage: async ({ content }) => {
    const statusCard = h("div", { class: "card" }, h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    const historyCard = h("div", { class: "card section-gap" },
      h("div", { class: "card-head" }, icon("clock", 18), h("h3", { text: "Request history" })),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    content.append(statusCard, historyCard);

    async function load() {
      try {
        const data = await api("/allocations/mine");
        renderStatus(data.items);
        renderHistory(data.items);
      } catch (err) {
        statusCard.textContent = "";
        statusCard.append(errorState(err.message, load));
      }
    }

    function renderStatus(items) {
      statusCard.textContent = "";
      const active = items.find((a) => ["ACTIVE", "APPROVED"].includes(a.status));
      const pending = items.find((a) => a.status === "PENDING");

      if (active?.room) {
        statusCard.append(
          h("div", { class: "card-head" }, icon("key", 18), h("h3", { text: "Current room" }),
            h("div", { class: "card-actions" }, statusBadge(active.status))),
          h("div", { style: "display:flex;gap:16px;align-items:center;flex-wrap:wrap" },
            h("div", {},
              h("div", { style: "font-size:1.7rem;font-weight:700;letter-spacing:-0.02em", text: active.room.roomNumber }),
              h("div", { class: "text-muted", text: `${active.room.blockName} · Floor ${active.room.floor} · ${active.room.roomType.toLowerCase()}` })),
            h("dl", { class: "detail-list", style: "margin-left:auto" },
              h("dt", { text: "Since" }), h("dd", { text: formatDate(active.startDate) }),
              h("dt", { text: "Request ID" }), h("dd", { class: "text-mono", text: active.id.slice(0, 13) + "…" }))),
          h("p", { class: "text-small text-muted", style: "margin-top:12px",
            text: "Need to change rooms or move out? Talk to your warden — they can transfer or vacate your allocation, and it will be recorded here." }));
        return;
      }

      if (pending) {
        const cancelBtn = h("button", { class: "btn btn-danger-subtle btn-sm", onclick: () => cancel(pending, cancelBtn) }, "Cancel request");
        statusCard.append(
          h("div", { class: "card-head" }, icon("clock", 18), h("h3", { text: "Pending request" }),
            h("div", { class: "card-actions" }, statusBadge("PENDING"), cancelBtn)),
          h("dl", { class: "detail-list" },
            h("dt", { text: "Submitted" }), h("dd", { text: `${formatDateTime(pending.requestedAt)} (${timeAgo(pending.requestedAt)})` }),
            h("dt", { text: "Request ID" }), h("dd", { class: "text-mono", text: pending.id }),
            h("dt", { text: "Preferred room" }), h("dd", { text: pending.room ? `${pending.room.roomNumber} (${pending.room.blockName})` : "No preference stated" }),
            h("dt", { text: "Note to warden" }), h("dd", { text: pending.preferenceNote || "—" })),
          h("p", { class: "text-small text-muted", style: "margin-top:12px",
            text: "A warden reviews pending requests and assigns rooms based on real availability. Approval is not automatic — you'll see the decision (and reason) here." }));
        return;
      }

      statusCard.append(
        emptyState({
          iconName: "key",
          title: "No active allocation",
          message: "Submit a request below. Pick a preferred room first (optional) — the warden confirms the final assignment based on availability.",
        }),
        newRequestForm(statusCard, load));
    }

    function newRequestForm(parent, reload) {
      let options = [];
      const roomSel = formField({ name: "roomId", label: "Preferred room (optional)", type: "select", placeholder: "Loading rooms…", options: [] });
      const noteF = formField({ name: "preferenceNote", label: "Preferences / note for the warden (optional)", textarea: true, rows: 3,
        placeholder: "Block preference, move-in date, medical needs…" });
      const err = h("div", { class: "form-banner", role: "alert" });
      const submit = h("button", { class: "btn btn-primary", type: "submit" }, "Submit request");

      roomOptions({ onlyAvailable: true }).then((opts) => {
        options = opts;
        roomSel.input.textContent = "";
        roomSel.input.append(h("option", { value: "", text: "No preference — assign any available room" }),
          ...opts.map((o) => h("option", { value: o.value, text: o.label })));
      }).catch(() => {
        roomSel.input.textContent = "";
        roomSel.input.append(h("option", { value: "", text: "No preference" }));
      });

      const form = h("form", {
        style: "max-width:560px;margin:0 auto;width:100%;text-align:left",
        onsubmit: async (e) => {
          e.preventDefault();
          err.className = "form-banner";
          setPending(submit, true, "Submitting…");
          try {
            await api("/allocations/requests", {
              method: "POST",
              body: { roomId: roomSel.input.value || null, preferenceNote: noteF.input.value.trim() || null },
            });
            toastSuccess("Room request submitted. The warden will review it shortly.");
            reload();
          } catch (e2) {
            err.className = "form-banner error visible";
            err.textContent = e2.message;
          } finally {
            setPending(submit, false);
          }
        },
      }, err, roomSel.el, noteF.el, submit);
      return form;
    }

    function renderHistory(items) {
      historyCard.textContent = "";
      historyCard.append(h("div", { class: "card-head" }, icon("clock", 18), h("h3", { text: "Request history" })));
      if (!items.length) {
        historyCard.append(h("p", { class: "text-muted text-small", text: "No requests yet." }));
        return;
      }
      for (const a of items) {
        const details = h("div", { style: "border:1px solid var(--color-border);border-radius:var(--radius-control);padding:var(--space-4);margin-bottom:var(--space-3)" });
        details.append(
          h("div", { style: "display:flex;align-items:center;gap:10px;flex-wrap:wrap" },
            h("strong", { text: a.room ? `Room ${a.room.roomNumber}` : "Room request" }),
            statusBadge(a.status),
            h("span", { class: "text-small text-muted", style: "margin-left:auto", text: `Requested ${formatDate(a.requestedAt)}` })),
          a.decisionReason ? h("p", { class: "text-small", style: "margin:8px 0 0" }, h("strong", { text: "Reason: " }), a.decisionReason) : null);
        const body = h("div", { style: "margin-top:12px" }, timeline(a.history ?? []));
        const toggleBtn = h("button", { class: "btn btn-subtle btn-sm", style: "margin-top:10px", "aria-expanded": "false",
          onclick: () => {
            const shown = body.style.display !== "none";
            body.style.display = shown ? "none" : "block";
            toggleBtn.textContent = shown ? "Show status history" : "Hide status history";
            toggleBtn.setAttribute("aria-expanded", String(!shown));
          } }, "Show status history");
        body.style.display = "none";
        details.append(toggleBtn, body);
        historyCard.append(details);
      }
    }

    async function cancel(allocation, btn) {
      const ok = await confirmDialog({
        title: "Cancel this request?",
        message: "Your pending room request will be withdrawn. You can submit a new one any time, but it will go to the back of the review queue.",
        confirmLabel: "Cancel request", danger: true,
      });
      if (!ok) return;
      setPending(btn, true, "Cancelling…");
      try {
        await api(`/allocations/${allocation.id}/cancel`, { method: "POST" });
        toastSuccess("Request cancelled.");
        load();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Cancel request";
        const b = h("div", { class: "form-banner error visible", text: err.message });
        statusCard.append(b);
      }
    }

    load();
  },
});
