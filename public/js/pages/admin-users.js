import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, formField, openModal, confirmDialog, setPending, toastSuccess, toastError, emptyState, errorState, formatDate } from "../ui.js";
import { buildFilterBar, dataTable, pagination as paginationEl } from "../shared.js";

const user = await requireAuth(["ADMIN"]);
if (!user) throw new Error("redirecting");

const ROLES = ["STUDENT", "WARDEN", "ADMIN"];

await buildShell({
  user,
  pageTitle: "User Management",
  breadcrumb: "System · Users",
  activeHref: "/admin/users.html",
  renderPage: async ({ content }) => {
    const params = new URLSearchParams(location.search);
    content.append(h("div", { class: "page-head" },
      h("div", {},
        h("h1", { text: "Users" }),
        h("p", { class: "text-muted text-small", style: "margin:0", text: "Create and manage accounts. Roles are assigned here — self-registration always creates Students only." })),
      h("div", { class: "page-head-actions" },
        h("button", { class: "btn btn-primary", id: "add-user" }, icon("plus", 15), "Add user"))));

    const listWrap = h("div", {});
    const state = { page: 1, limit: 10 };
    const filters = buildFilterBar([
      { type: "search", name: "q", label: "Search name, email, student ID…" },
      { type: "select", name: "role", label: "All roles", value: params.get("role") ?? "", options: ROLES.map((r) => ({ value: r, label: r[0] + r.slice(1).toLowerCase() })) },
      { type: "select", name: "isActive", label: "Active & inactive", options: [{ value: "true", label: "Active only" }, { value: "false", label: "Inactive only" }] },
    ], () => { state.page = 1; load(); });

    content.append(filters.el, listWrap);
    document.getElementById("add-user").addEventListener("click", () => userFormModal(null, load));

    async function load() {
      listWrap.textContent = "";
      listWrap.append(h("div", { class: "loading-row" }, h("div", { class: "spinner" }), "Loading users…"));
      try {
        const data = await api("/users", { params: { ...filters.values(), page: state.page, limit: state.limit } });
        listWrap.textContent = "";
        filters.setCount(`${data.total} user${data.total === 1 ? "" : "s"}`);
        if (!data.items.length) {
          listWrap.append(emptyState({ iconName: "users", title: "No users found", message: "Adjust filters or create a new account." }));
          return;
        }
        listWrap.append(dataTable([
          { label: "Name", render: (u) => h("div", {},
              h("div", { style: "font-weight:650", text: u.fullName }, u.id === user.id ? h("span", { class: "badge badge-info", style: "margin-left:6px", text: "you" }) : null),
              h("div", { class: "text-small text-muted", text: u.email })) },
          { label: "Student ID", render: (u) => h("span", { class: "text-mono text-small", text: u.studentId ?? "—" }) },
          { label: "Role", render: (u) => statusBadge(u.role) },
          { label: "Status", render: (u) => u.isActive ? statusBadge("ACTIVE") : statusBadge("INACTIVE") },
          { label: "Joined", render: (u) => h("span", { class: "text-small", text: formatDate(u.createdAt) }) },
          { label: "Actions", render: (u) => h("div", { class: "row-actions" },
              h("button", { class: "btn btn-secondary btn-sm", onclick: () => userFormModal(u, load) }, icon("edit", 13), "Edit"),
              u.isActive
                ? h("button", { class: "btn btn-danger-subtle btn-sm", onclick: () => toggleActive(u, false, load) }, "Deactivate")
                : h("button", { class: "btn btn-subtle btn-sm", onclick: () => toggleActive(u, true, load) }, "Reactivate")) },
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

async function toggleActive(u, activate, reload) {
  if (!activate) {
    const ok = await confirmDialog({
      title: `Deactivate ${u.fullName}?`,
      message: "They will be signed out immediately and cannot sign in again until reactivated. Their historical records (allocations, complaints) are kept.",
      confirmLabel: "Deactivate", danger: true,
    });
    if (!ok) return;
  }
  try {
    await api(`/users/${u.id}/active-status`, { method: "PATCH", body: { isActive: activate } });
    toastSuccess(activate ? `${u.fullName} reactivated.` : `${u.fullName} deactivated.`);
    reload?.();
  } catch (err) {
    toastError(err.message); // e.g. LAST_ADMIN protection
  }
}

function userFormModal(existing, reload) {
  const fullName = formField({ name: "fullName", label: "Full name", required: true, value: existing?.fullName ?? "" });
  const email = formField({ name: "email", label: "Email", type: "email", required: true, value: existing?.email ?? "", attrs: { autocomplete: "off" } });
  const studentId = formField({ name: "studentId", label: "Student ID", value: existing?.studentId ?? "", help: "Students only.", attrs: { maxlength: 20 } });
  const role = formField({ name: "role", label: "Role", type: "select", required: true, value: existing?.role ?? "STUDENT",
    options: ROLES.map((r) => ({ value: r, label: r[0] + r.slice(1).toLowerCase() })) });
  const phone = formField({ name: "phone", label: "Phone", type: "tel", value: existing?.phone ?? "" });
  const course = formField({ name: "course", label: "Course", value: existing?.course ?? "" });
  const year = formField({ name: "yearOfStudy", label: "Year of study", type: "select", value: existing?.yearOfStudy ?? "",
    placeholder: "—", options: [1, 2, 3, 4].map((y) => ({ value: y, label: `Year ${y}` })) });
  const password = formField({ name: "password", label: existing ? "New password (leave blank to keep)" : "Password", type: "password",
    required: !existing, help: "Min 8 characters. Stored as a bcrypt hash.", attrs: { autocomplete: "new-password" } });
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-primary", type: "submit", text: existing ? "Save changes" : "Create user" });

  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault();
    err.className = "form-banner";
    const body = {
      fullName: fullName.input.value.trim(),
      email: email.input.value.trim(),
      role: role.input.value,
      studentId: studentId.input.value.trim() || undefined,
      phone: phone.input.value.trim() || undefined,
      course: course.input.value.trim() || undefined,
      yearOfStudy: year.input.value ? Number(year.input.value) : undefined,
    };
    if (password.input.value) body.password = password.input.value;
    if (!existing && !body.password) { err.className = "form-banner error visible"; err.textContent = "Password is required for new users."; return; }

    setPending(submit, true, existing ? "Saving…" : "Creating…");
    try {
      if (existing) await api(`/users/${existing.id}`, { method: "PATCH", body });
      else await api("/users", { method: "POST", body });
      modal.close();
      toastSuccess(existing ? "User updated." : `User created with role ${body.role.toLowerCase()}.`);
      reload?.();
    } catch (e2) {
      err.className = "form-banner error visible";
      err.textContent = e2.details?.map((d) => d.message).join(" ") || e2.message;
      setPending(submit, false);
    }
  } }, err,
    h("div", { class: "form-row" }, fullName.el, email.el),
    h("div", { class: "form-row" }, studentId.el, role.el),
    h("div", { class: "form-row" }, course.el, year.el),
    h("div", { class: "form-row" }, phone.el, password.el),
    submit);

  const modal = openModal({
    title: existing ? `Edit ${existing.fullName}` : "Add a user",
    content: form, size: "modal-lg",
    actions: [h("button", { class: "btn btn-secondary", onclick: () => modal.close() }, "Cancel")],
  });
}
