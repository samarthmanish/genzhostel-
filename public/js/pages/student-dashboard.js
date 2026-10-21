import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statCard, statusBadge, formatDate, formatDateTime, timeAgo, emptyState, skeletonCard, errorState, toastError } from "../ui.js";
import { commentThread } from "../shared.js";

const user = await requireAuth(["STUDENT"]);
if (!user) throw new Error("redirecting");

await buildShell({
  user,
  pageTitle: "Dashboard",
  activeHref: "/student/dashboard.html",
  renderPage: async ({ content }) => {
    /* ---- Welcome band ---- */
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    content.append(
      h("div", { class: "welcome-band" },
        h("span", { class: "avatar", text: user.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() }),
        h("div", { class: "welcome-text" },
          h("h1", { text: `${greeting}, ${user.fullName.split(" ")[0]}` }),
          h("p", { text: `${user.course ?? "Student"}${user.yearOfStudy ? ` · Year ${user.yearOfStudy}` : ""}${user.studentId ? ` · ${user.studentId}` : ""}` }))));

    /* ---- Quick actions ---- */
    content.append(
      h("div", { class: "quick-actions", style: "margin-bottom:var(--space-5)" },
        h("a", { class: "btn btn-primary", href: "/student/rooms.html" }, icon("bed", 16), "View rooms"),
        h("a", { class: "btn btn-secondary", href: "/student/allocation.html" }, icon("key", 16), "Request room"),
        h("a", { class: "btn btn-secondary", href: "/student/complaints.html" }, icon("alert", 16), "Raise complaint")));

    /* ---- Data panels load in parallel with independent states ---- */
    const grid = h("div", { class: "grid grid-2" });
    content.append(grid);

    // Panel 1: allocation
    const allocCard = h("div", { class: "card" },
      h("div", { class: "card-head" }, icon("key", 18), h("h3", { text: "My accommodation" })),
      skeletonCard());
    // Panel 2: complaints
    const complaintsCard = h("div", { class: "card" },
      h("div", { class: "card-head" }, icon("alert", 18), h("h3", { text: "My complaints" })),
      skeletonCard());
    grid.append(allocCard, complaintsCard);

    /* ---- Load allocation ---- */
    (async () => {
      const body = allocCard.querySelector(".card-head").nextSibling;
      try {
        const data = await api("/allocations/mine");
        body.replaceWith(allocationPanel(data.items));
      } catch (err) {
        body.replaceWith(errorState(err.message));
      }
    })();

    /* ---- Load complaints ---- */
    (async () => {
      const body = complaintsCard.querySelector(".card-head").nextSibling;
      try {
        const data = await api("/complaints/mine", { params: { limit: 5 } });
        body.replaceWith(complaintsPanel(data));
      } catch (err) {
        body.replaceWith(errorState(err.message));
      }
    })();

    function allocationPanel(items) {
      const active = items.find((a) => ["ACTIVE", "APPROVED"].includes(a.status));
      const pending = items.find((a) => a.status === "PENDING");

      if (active?.room) {
        return h("div", {},
          h("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:12px" },
            h("div", {},
              h("div", { style: "font-size:1.4rem;font-weight:700;letter-spacing:-0.02em", text: `Room ${active.room.roomNumber}` }),
              h("div", { class: "text-muted text-small", text: `${active.room.blockName} · Floor ${active.room.floor} · ${active.room.roomType.toLowerCase()}` })),
            h("div", { style: "margin-left:auto" }, statusBadge(active.status))),
          active.startDate ? h("p", { class: "text-small text-muted", text: `Allocated since ${formatDate(active.startDate)}` }) : null,
          h("a", { class: "btn btn-secondary btn-sm", href: "/student/allocation.html", style: "margin-top:8px" }, "View details & history"));
      }

      if (pending) {
        return h("div", {},
          h("div", { style: "display:flex;align-items:center;gap:12px" },
            h("div", {},
              h("div", { style: "font-weight:650", text: "Room request pending" }),
              h("div", { class: "text-muted text-small", text: `Submitted ${timeAgo(pending.requestedAt)} · ID ${pending.id.slice(0, 8)}…` })),
            h("div", { style: "margin-left:auto" }, statusBadge("PENDING"))),
          h("p", { class: "text-small text-muted", style: "margin-top:12px", text: "A warden will review your request and assign a room based on availability. You'll see the decision here." }),
          h("a", { class: "btn btn-secondary btn-sm", href: "/student/allocation.html", style: "margin-top:4px" }, "Track request"));
      }

      const rejected = items.find((a) => a.status === "REJECTED");
      return emptyState({
        iconName: "key",
        title: "No room yet",
        message: rejected
          ? `Your last request was rejected: ${rejected.decisionReason ?? "no reason given"}. You can submit a new request any time.`
          : "You don't have an allocation or a pending request. Browse available rooms and submit your first request.",
        actionEl: h("a", { class: "btn btn-primary btn-sm", href: "/student/rooms.html" }, "Browse rooms"),
      });
    }

    function complaintsPanel(data) {
      const items = data.items ?? [];
      if (!items.length) {
        return emptyState({
          iconName: "alert",
          title: "No complaints",
          message: "Nothing reported yet — that's good news. If something needs fixing, raise it here and track the response.",
          actionEl: h("a", { class: "btn btn-primary btn-sm", href: "/student/complaints.html" }, "Raise a complaint"),
        });
      }
      const open = items.filter((c) => !["RESOLVED", "CLOSED"].includes(c.status));
      const wrap = h("div", {});
      wrap.append(h("div", { style: "display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap" },
        h("span", { class: "text-small text-muted", text: `${open.length} open · ${items.length} most recent shown` })));
      for (const c of items.slice(0, 4)) {
        wrap.append(h("div", { style: "display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--color-border)" },
          h("div", { style: "min-width:0" },
            h("div", { style: "font-weight:600;font-size:0.92rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", text: c.title }),
            h("div", { class: "text-small text-muted", text: `${c.category.toLowerCase()} · ${timeAgo(c.submittedAt)}` })),
          h("div", { style: "margin-left:auto;flex:none" }, statusBadge(c.status))));
      }
      wrap.append(h("a", { class: "btn btn-secondary btn-sm", href: "/student/complaints.html", style: "margin-top:12px" }, "All complaints"));
      return wrap;
    }
  },
});
