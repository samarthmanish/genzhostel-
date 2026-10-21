import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statCard, errorState, timeAgo, titleCase } from "../ui.js";

const user = await requireAuth(["ADMIN"]);
if (!user) throw new Error("redirecting");

await buildShell({
  user,
  pageTitle: "Admin Dashboard",
  activeHref: "/admin/dashboard.html",
  renderPage: async ({ content }) => {
    content.append(h("div", { class: "welcome-band" },
      h("div", { class: "welcome-text" },
        h("h1", { text: "System overview" }),
        h("p", { text: "Live statistics from PostgreSQL, plus the most recent audited activity." }))));

    const quickLinks = h("div", { class: "quick-actions", style: "margin-bottom:var(--space-5)" },
      h("a", { class: "btn btn-secondary", href: "/admin/users.html" }, icon("users", 15), "Users"),
      h("a", { class: "btn btn-secondary", href: "/warden/rooms.html" }, icon("bed", 15), "Rooms"),
      h("a", { class: "btn btn-secondary", href: "/warden/allocations.html" }, icon("key", 15), "Allocations"),
      h("a", { class: "btn btn-secondary", href: "/warden/complaints.html" }, icon("alert", 15), "Complaints"),
      h("a", { class: "btn btn-primary", href: "/admin/reports.html" }, icon("chart", 15), "Reports"));
    content.append(quickLinks);

    const statsGrid = h("div", { class: "grid grid-4" },
      ...Array.from({ length: 4 }, () => h("div", { class: "stat-card" }, h("div", { class: "skeleton", style: "height:56px" }))));
    content.append(statsGrid);

    const grid2 = h("div", { class: "grid grid-2 section-gap" });
    const activityCard = h("div", { class: "card" },
      h("div", { class: "card-head" }, icon("clock", 18), h("h3", { text: "Recent activity (audit log)" })),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    const occupancyCard = h("div", { class: "card" },
      h("div", { class: "card-head" }, icon("chart", 18), h("h3", { text: "Occupancy by block" })),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    grid2.append(activityCard, occupancyCard);
    content.append(grid2);

    (async () => {
      try {
        const stats = await api("/reports/stats");
        statsGrid.textContent = "";
        statsGrid.append(
          statCard({ label: "Rooms in service", value: stats.totalRooms, help: `${stats.totalBeds} total beds`, iconName: "bed", href: "/warden/rooms.html" }),
          statCard({ label: "Occupancy", value: `${stats.occupancyRate}%`, help: `${stats.occupiedBeds} of ${stats.totalBeds} beds`, iconName: "users", href: "/admin/reports.html" }),
          statCard({ label: "Pending requests", value: stats.pendingRequests, help: "awaiting warden review", iconName: "clock", href: "/warden/allocations.html?status=PENDING" }),
          statCard({ label: "Open complaints", value: stats.openComplaints, help: "need staff attention", iconName: "alert", href: "/warden/complaints.html?open=1" }));
      } catch (err) {
        statsGrid.textContent = "";
        statsGrid.append(errorState(err.message));
      }
    })();

    (async () => {
      const body = activityCard.querySelector(".loading-row");
      try {
        const data = await api("/reports/activity");
        body.replaceWith(data.items.length
          ? h("ul", { class: "timeline" }, ...data.items.map((a) => h("li", {},
              h("div", { class: "t-head", text: titleCase(a.action.toLowerCase().replace(/_/g, " ")) }),
              h("div", { class: "t-meta", text: `${a.actorName} · ${a.entityType} · ${timeAgo(a.at)}` }))))
          : h("p", { class: "text-muted text-small", text: "No audited activity yet." }));
      } catch (err) {
        body.replaceWith(errorState(err.message));
      }
    })();

    (async () => {
      const body = occupancyCard.querySelector(".loading-row");
      try {
        const data = await api("/reports/occupancy");
        body.replaceWith(h("div", { class: "bar-chart" },
          ...data.byBlock.map((b) => h("div", { class: "bar-row" },
            h("span", { text: b.block.replace(/^Block\s*/i, "") }),
            h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: `width:${b.occupancyRate}%` })),
            h("span", { class: "bar-value", text: `${b.occupiedBeds}/${b.totalBeds}` })))));
      } catch (err) {
        body.replaceWith(errorState(err.message));
      }
    })();
  },
});
