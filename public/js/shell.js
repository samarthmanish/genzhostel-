/**
 * App shell: renders the sidebar, topbar, user menu, theme switch,
 * toast region, and chat widget for every authenticated page.
 * Navigation is role-aware (UX convenience) — real authorization is
 * always enforced server-side.
 */
import { h, icon, logoMark, initials, toast } from "./ui.js";
import { logout, homeForRole } from "./auth.js";
import { mountChatWidget } from "./chatbot.js";

const NAV = {
  STUDENT: [
    { section: "Overview" },
    { label: "Dashboard", href: "/student/dashboard.html", icon: "home" },
    { section: "Hostel" },
    { label: "Room Directory", href: "/student/rooms.html", icon: "bed" },
    { label: "My Allocation", href: "/student/allocation.html", icon: "key" },
    { label: "Complaints", href: "/student/complaints.html", icon: "alert" },
    { section: "Account" },
    { label: "Profile", href: "/student/profile.html", icon: "user" },
  ],
  WARDEN: [
    { section: "Overview" },
    { label: "Dashboard", href: "/warden/dashboard.html", icon: "home" },
    { section: "Management" },
    { label: "Rooms", href: "/warden/rooms.html", icon: "bed" },
    { label: "Allocations", href: "/warden/allocations.html", icon: "key" },
    { label: "Complaints", href: "/warden/complaints.html", icon: "alert" },
    { section: "Insights" },
    { label: "Reports", href: "/admin/reports.html", icon: "chart" },
  ],
  ADMIN: [
    { section: "Overview" },
    { label: "Dashboard", href: "/admin/dashboard.html", icon: "home" },
    { section: "Management" },
    { label: "Users", href: "/admin/users.html", icon: "users" },
    { label: "Rooms", href: "/warden/rooms.html", icon: "bed" },
    { label: "Allocations", href: "/warden/allocations.html", icon: "key" },
    { label: "Complaints", href: "/warden/complaints.html", icon: "alert" },
    { section: "System" },
    { label: "Reports", href: "/admin/reports.html", icon: "chart" },
    { label: "Settings", href: "/admin/settings.html", icon: "settings" },
  ],
};

/**
 * Build the shell for an authenticated page.
 * renderPage({ title, user, activeHref }) must return the page content element(s).
 */
export async function buildShell({ user, pageTitle, activeHref, breadcrumb, renderPage }) {
  const root = document.getElementById("app");
  root.textContent = "";

  const navItems = NAV[user.role] ?? NAV.STUDENT;

  /* ---------- Sidebar ---------- */
  const sidebar = h("aside", { class: "app-sidebar", "aria-label": "Main navigation" },
    h("a", { class: "sidebar-brand", href: homeForRole(user.role) }, logoMark(22), "Hostel System"),
    h("nav", {},
      ...navItems.map((item) =>
        item.section
          ? h("div", { class: "nav-section", text: item.section })
          : h("a", {
              class: "nav-link",
              href: item.href,
              ...(normalizePath(activeHref) === normalizePath(item.href) ? { "aria-current": "page" } : {}),
            }, icon(item.icon, 18), item.label))),
    h("div", { class: "sidebar-foot" },
      h("button", { class: "btn btn-secondary btn-sm btn-block", onclick: () => logout() },
        icon("logout", 15), "Sign out")));

  /* ---------- Topbar ---------- */
  const themeBtn = h("button", {
    class: "icon-btn",
    "aria-label": "Switch theme",
    title: "Switch light/dark theme",
    onclick: (e) => {
      const next = window.HMSTheme.toggle();
      e.currentTarget.textContent = "";
      e.currentTarget.append(icon(next === "dark" ? "sun" : "moon", 18));
    },
  }, icon(window.HMSTheme.get() === "dark" ? "sun" : "moon", 18));

  const userMenu = h("div", { class: "user-menu", id: "user-menu" },
    h("div", { class: "user-menu-head" },
      h("div", { style: "font-weight:650;font-size:0.9rem", text: user.fullName }),
      h("div", { style: "color:var(--color-muted);font-size:0.78rem", text: `${user.email} · ${user.role[0] + user.role.slice(1).toLowerCase()}` })),
    user.role === "STUDENT"
      ? h("a", { href: "/student/profile.html" }, icon("user", 16), "My profile")
      : h("a", { href: homeForRole(user.role) }, icon("home", 16), "Dashboard"),
    h("button", { class: "danger", onclick: () => logout() }, icon("logout", 16), "Sign out"));

  const userChip = h("button", {
    class: "user-chip",
    "aria-haspopup": "menu",
    "aria-expanded": "false",
    "aria-label": `Account menu for ${user.fullName}`,
    onclick: () => {
      const open = userMenu.classList.toggle("open");
      userChip.setAttribute("aria-expanded", String(open));
    },
  },
    h("span", { class: "avatar", text: initials(user.fullName) }),
    h("span", { class: "hide-sm", text: user.fullName.split(" ")[0] }),
    userMenu);

  // Close the menu on outside click / Escape
  document.addEventListener("click", (e) => {
    if (!userChip.contains(e.target)) {
      userMenu.classList.remove("open");
      userChip.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      userMenu.classList.remove("open");
      userChip.setAttribute("aria-expanded", "false");
    }
  });

  const shell = h("div", { class: "app-shell", id: "app-shell" });
  const menuBtn = h("button", {
    class: "icon-btn menu-btn",
    "aria-label": "Open navigation menu",
    onclick: () => shell.classList.toggle("sidebar-open"),
  }, icon("menu", 20));

  const topbar = h("header", { class: "app-topbar" },
    menuBtn,
    h("div", {},
      breadcrumb ? h("div", { class: "breadcrumb", text: breadcrumb }) : null,
      h("h1", { class: "page-title", text: pageTitle })),
    h("div", { class: "topbar-actions" }, themeBtn, userChip));

  const backdrop = h("div", {
    class: "sidebar-backdrop",
    onclick: () => shell.classList.remove("sidebar-open"),
    "aria-hidden": "true",
  });

  const content = h("main", { class: "app-content", id: "main-content", tabindex: "-1" });

  shell.append(sidebar, backdrop, h("div", { class: "app-main" }, topbar, content));
  root.append(h("a", { class: "skip-link", href: "#main-content", text: "Skip to content" }), shell);

  /* ---------- Page content ---------- */
  try {
    const rendered = await renderPage({ user, content });
    if (rendered) content.append(...(Array.isArray(rendered) ? rendered : [rendered]));
  } catch (err) {
    console.error(err);
    content.append(h("div", { class: "card" },
      h("h2", { text: "Failed to load this page" }),
      h("p", { class: "text-muted", text: err?.message ?? "Unexpected error." })));
  }

  /* ---------- Chat widget (all signed-in roles) ---------- */
  mountChatWidget(user);

  return { content, shell };
}

function normalizePath(p) {
  return String(p ?? "").replace(/\/index\.html$/, "/").replace(/\.html$/, "");
}

/** Small helper pages can use for a consistent page header with actions. */
export function pageHead(title, { desc, actions } = {}) {
  return h("div", { class: "page-head" },
    h("h1", { text: title }),
    actions?.length ? h("div", { class: "page-head-actions" }, ...actions) : null,
    desc ? h("p", { class: "page-desc", text: desc }) : null);
}

export { toast };
