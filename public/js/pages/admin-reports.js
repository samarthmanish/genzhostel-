import { api, downloadCsv } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, errorState, toastSuccess, toastError, setPending, formField, dataTable, titleCase } from "../ui.js";

const user = await requireAuth(["WARDEN", "ADMIN"]);
if (!user) throw new Error("redirecting");

await buildShell({
  user,
  pageTitle: "Reports",
  breadcrumb: "Insights · Reports",
  activeHref: "/admin/reports.html",
  renderPage: async ({ content }) => {
    content.append(h("div", { class: "page-head" },
      h("div", {},
        h("h1", { text: "Reports" }),
        h("p", { class: "text-muted text-small", style: "margin:0", text: "Every number is computed live from PostgreSQL at request time. CSV exports are formula-injection safe." })),
      h("div", { class: "page-head-actions" },
        exportBtn("occupancy", "Occupancy CSV"),
        exportBtn("allocations", "Allocations CSV"),
        exportBtn("complaints", "Complaints CSV"))));

    const grid = h("div", { class: "grid grid-2" });
    const occupancyCard = card("Occupancy by block", "bed");
    const typeCard = card("Occupancy by room type", "users");
    const allocCard = card("Allocation requests by status", "key");
    const complaintCard = card("Complaints overview", "alert");
    grid.append(occupancyCard, typeCard, allocCard, complaintCard);
    content.append(grid);

    const pendingCard = h("div", { class: "card section-gap" },
      h("div", { class: "card-head" }, icon("clock", 18), h("h3", { text: "Longest-waiting pending requests" })),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    content.append(pendingCard);

    function card(title, iconName) {
      return h("div", { class: "card" },
        h("div", { class: "card-head" }, icon(iconName, 18), h("h3", { text: title })),
        h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    }

    function exportBtn(report, label) {
      const btn = h("button", { class: "btn btn-secondary btn-sm", onclick: async () => {
        setPending(btn, true, "Exporting…");
        try {
          await downloadCsv("/reports/export.csv", { report }, `hostel-${report}-report.csv`);
          toastSuccess(`${label} downloaded.`);
        } catch (err) { toastError(err.message); } finally { setPending(btn, false); }
      } }, icon("download", 14), label);
      return btn;
    }

    function fill(c, el) {
      const body = c.querySelector(".loading-row");
      body.replaceWith(el);
    }

    function barChart(rows, { valueText }) {
      const max = Math.max(1, ...rows.map((r) => r.pct));
      return h("div", { class: "bar-chart" },
        ...rows.map((r) => h("div", { class: "bar-row" },
          h("span", { text: r.label }),
          h("div", { class: "bar-track", role: "img", "aria-label": `${r.label}: ${valueText(r)}` },
            h("div", { class: "bar-fill", style: `width:${Math.min(100, (r.pct / max) * 100)}%` })),
          h("span", { class: "bar-value", text: valueText(r) }))));
    }

    /* -------- Occupancy -------- */
    (async () => {
      try {
        const data = await api("/reports/occupancy");
        fill(occupancyCard, barChart(
          data.byBlock.map((b) => ({ label: b.block.replace(/^Block\s*/i, "").slice(0, 18), pct: b.occupancyRate, b })),
          { valueText: (r) => `${r.b.occupiedBeds}/${r.b.totalBeds} · ${r.b.occupancyRate}%` }));
        fill(typeCard, barChart(
          data.byRoomType.map((t) => ({ label: titleCase(t.roomType.toLowerCase()), pct: t.occupancyRate, t })),
          { valueText: (r) => `${r.t.occupiedBeds}/${r.t.totalBeds} · ${r.t.occupancyRate}%` }));
        occupancyCard.append(h("p", { class: "text-small text-muted", style: "margin-top:12px", text: `Generated ${new Date(data.generatedAt).toLocaleString()}` }));
      } catch (err) {
        fill(occupancyCard, errorState(err.message));
        fill(typeCard, errorState(err.message));
      }
    })();

    /* -------- Allocations -------- */
    (async () => {
      try {
        const data = await api("/reports/allocations");
        const statuses = ["PENDING", "ACTIVE", "APPROVED", "REJECTED", "VACATED", "CANCELLED"];
        const rows = statuses
          .map((s) => ({ label: titleCase(s.toLowerCase()), pct: data.byStatus[s] ?? 0, status: s }))
          .filter((r) => r.pct > 0);
        fill(allocCard, rows.length
          ? h("div", {},
              h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px" },
                ...statuses.filter((s) => (data.byStatus[s] ?? 0) > 0).map((s) => h("span", { style: "display:inline-flex;gap:6px;align-items:center" }, statusBadge(s), h("span", { class: "text-small text-muted", text: String(data.byStatus[s]) })))),
              barChart(rows, { valueText: (r) => String(r.pct) }))
          : h("p", { class: "text-muted text-small", text: "No allocation records yet." }));
      } catch (err) {
        fill(allocCard, errorState(err.message));
      }
    })();

    /* -------- Complaints -------- */
    (async () => {
      try {
        const data = await api("/reports/complaints");
        const cats = data.byCategory.map((c) => ({ label: titleCase(c.category.toLowerCase()), pct: c.count, count: c.count }));
        const body = h("div", {});
        body.append(
          h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px" },
            ...data.byStatus.map((s) => h("span", { style: "display:inline-flex;gap:6px;align-items:center" }, statusBadge(s.status), h("span", { class: "text-small text-muted", text: String(s.count) })))),
          cats.length ? barChart(cats, { valueText: (r) => String(r.count) }) : h("p", { class: "text-muted text-small", text: "No complaints yet." }),
          h("dl", { class: "detail-list", style: "margin-top:14px" },
            h("dt", { text: "Resolved so far" }), h("dd", { text: String(data.resolvedCount) }),
            h("dt", { text: "Avg. resolution time" }),
            h("dd", { text: data.avgResolutionHours === null ? "—" : `${data.avgResolutionHours} hours` }),
            h("dt", { text: "Range" }),
            h("dd", { text: data.range.from || data.range.to ? `${data.range.from ?? "start"} → ${data.range.to ?? "now"}` : "All time" })));
        fill(complaintCard, body);
      } catch (err) {
        fill(complaintCard, errorState(err.message));
      }
    })();

    /* -------- Pending requests detail -------- */
    (async () => {
      const body = pendingCard.querySelector(".loading-row");
      try {
        const data = await api("/reports/allocations");
        body.replaceWith(data.pendingRequests.length
          ? dataTable([
              { label: "Student", render: (p) => h("div", {}, h("div", { style: "font-weight:650", text: p.studentName }), h("div", { class: "text-small text-muted", text: p.studentId ?? "" })) },
              { label: "Waiting", render: (p) => `${p.waitingDays} day${p.waitingDays === 1 ? "" : "s"}` },
              { label: "Requested", render: (p) => new Date(p.requestedAt).toLocaleDateString() },
              { label: "", render: () => h("a", { class: "btn btn-primary btn-sm", href: "/warden/allocations.html?status=PENDING" }, "Review") },
            ], data.pendingRequests)
          : h("p", { class: "text-muted text-small", text: "No pending requests — nothing waiting." }));
      } catch (err) {
        body.replaceWith(errorState(err.message));
      }
    })();
  },
});
