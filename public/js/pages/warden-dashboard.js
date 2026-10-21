import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statCard, statusBadge, timeAgo, errorState, shortId } from "../ui.js";

const user = await requireAuth(["WARDEN", "ADMIN"]);
if (!user) throw new Error("redirecting");

await buildShell({
  user,
  pageTitle: user.role === "ADMIN" ? "Warden Dashboard" : "Dashboard",
  activeHref: "/warden/dashboard.html",
  renderPage: async ({ content }) => {
    content.append(h("div", { class: "welcome-band" },
      h("div", { class: "welcome-text" },
        h("h1", { text: `Hello, ${user.fullName.split(" ")[0]}` }),
        h("p", { text: "Everything below is live from the database. Click any card to open the filtered list." }))));

    const statsGrid = h("div", { class: "grid grid-4", id: "stats" },
      ...Array.from({ length: 6 }, () => h("div", { class: "stat-card" }, h("div", { class: "skeleton", style: "height:56px" }))));
    content.append(statsGrid);

    const pendingCard = h("div", { class: "card section-gap" },
      h("div", { class: "card-head" }, icon("key", 18), h("h3", { text: "Allocation requests needing review" }),
        h("div", { class: "card-actions" }, h("a", { class: "btn btn-secondary btn-sm", href: "/warden/allocations.html?status=PENDING" }, "Open queue"))),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    const complaintsCard = h("div", { class: "card section-gap" },
      h("div", { class: "card-head" }, icon("alert", 18), h("h3", { text: "Open complaints" }),
        h("div", { class: "card-actions" }, h("a", { class: "btn btn-secondary btn-sm", href: "/warden/complaints.html?open=1" }, "Open queue"))),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    content.append(pendingCard, complaintsCard);

    /* ---- Stats ---- */
    (async () => {
      try {
        const [stats, allocs] = await Promise.all([
          api("/reports/stats"),
          api("/reports/allocations"),
        ]);
        statsGrid.textContent = "";
        statsGrid.append(
          statCard({ label: "Total rooms", value: stats.totalRooms, help: `${stats.totalBeds} beds in service`, iconName: "bed", href: "/warden/rooms.html" }),
          statCard({ label: "Occupied beds", value: stats.occupiedBeds, help: `${stats.occupancyRate}% occupancy`, iconName: "users", href: "/admin/reports.html" }),
          statCard({ label: "Available beds", value: stats.availableBeds, help: "live from allocations", iconName: "key", href: "/warden/rooms.html" }),
          statCard({ label: "Pending requests", value: stats.pendingRequests, help: "awaiting your decision", iconName: "clock", href: "/warden/allocations.html?status=PENDING" }),
          statCard({ label: "Open complaints", value: stats.openComplaints, help: "not yet resolved", iconName: "alert", href: "/warden/complaints.html?open=1" }),
          statCard({ label: "Active students", value: stats.activeStudents, help: "registered in system", iconName: "users", href: "/admin/users.html?role=STUDENT" }));
      } catch (err) {
        statsGrid.textContent = "";
        statsGrid.append(errorState(err.message));
      }
    })();

    /* ---- Pending allocation requests ---- */
    (async () => {
      const body = pendingCard.querySelector(".loading-row");
      try {
        const data = await api("/allocations", { params: { status: "PENDING", limit: 5 } });
        body.replaceWith(data.items.length
          ? h("div", { class: "table-wrap" }, h("table", { class: "data-table" },
              h("thead", {}, h("tr", {},
                h("th", { text: "Student" }), h("th", { text: "Preferred room" }),
                h("th", { text: "Waiting" }), h("th", { text: "" }))),
              h("tbody", {}, ...data.items.map((a) => h("tr", {},
                h("td", { "data-label": "Student" },
                  h("div", { style: "font-weight:600", text: a.student?.fullName ?? "—" }),
                  h("div", { class: "text-small text-muted", text: a.student?.studentId ?? "" })),
                h("td", { "data-label": "Preferred room", text: a.room ? `${a.room.roomNumber} · ${a.room.blockName}` : "No preference" }),
                h("td", { "data-label": "Waiting", text: timeAgo(a.requestedAt) }),
                h("td", {}, h("div", { class: "row-actions" },
                  h("a", { class: "btn btn-primary btn-sm", href: "/warden/allocations.html?status=PENDING" }, "Review")))))))) 
          : h("p", { class: "text-muted text-small", text: "No pending requests — the queue is clear." }));
      } catch (err) {
        body.replaceWith(errorState(err.message));
      }
    })();

    /* ---- Open complaints ---- */
    (async () => {
      const body = complaintsCard.querySelector(".loading-row");
      try {
        const data = await api("/complaints", { params: { limit: 6 } });
        const open = data.items.filter((c) => !["RESOLVED", "CLOSED"].includes(c.status)).slice(0, 5);
        body.replaceWith(open.length
          ? h("div", {}, ...open.map((c) => h("a", {
              href: `/warden/complaints.html?focus=${c.id}`,
              style: "display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--color-border);color:inherit",
            },
              h("div", { style: "min-width:0;flex:1" },
                h("div", { style: "font-weight:600;font-size:0.92rem", text: c.title }),
                h("div", { class: "text-small text-muted", text: `${c.student?.fullName ?? ""} · ${c.category.toLowerCase()} · ${timeAgo(c.submittedAt)}` })),
              statusBadge(c.status),
              statusBadge(c.priority))))
          : h("p", { class: "text-muted text-small", text: "No open complaints right now." }));
      } catch (err) {
        body.replaceWith(errorState(err.message));
      }
    })();
  },
});
