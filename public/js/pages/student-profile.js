import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, formField, setPending, toastSuccess, toastError, formatDate, initials } from "../ui.js";
import { showBanner, hideBanner, setFieldError } from "../validation.js";

const user = await requireAuth(["STUDENT"]);
if (!user) throw new Error("redirecting");

await buildShell({
  user,
  pageTitle: "My Profile",
  breadcrumb: "Account · Profile",
  activeHref: "/student/profile.html",
  renderPage: async ({ content }) => {
    /* ---------- Identity card (read-only fields) ---------- */
    content.append(
      h("div", { class: "card" },
        h("div", { class: "profile-head" },
          h("span", { class: "avatar", text: initials(user.fullName) }),
          h("div", {},
            h("h2", { style: "margin:0", text: user.fullName }),
            h("p", { class: "text-muted text-small", style: "margin:0", text: `Member since ${formatDate(user.createdAt)}` })),
          h("div", { style: "margin-left:auto" }, statusBadge(user.role))),
        h("dl", { class: "detail-list" },
          h("dt", { text: "Email" }), h("dd", { text: user.email }),
          h("dt", { text: "Student ID" }), h("dd", { class: "text-mono", text: user.studentId ?? "Not assigned yet" }),
          h("dt", { text: "Course" }), h("dd", { text: user.course ?? "—" }),
          h("dt", { text: "Year of study" }), h("dd", { text: user.yearOfStudy ? `Year ${user.yearOfStudy}` : "—" })),
        h("p", { class: "text-small text-muted", style: "margin:12px 0 0",
          text: "Student ID, course, and account role are managed by the hostel office — contact an administrator if they need correcting." })));

    /* ---------- Editable contact details ---------- */
    const phone = formField({ name: "phone", label: "Phone number", type: "tel", value: user.phone ?? "", placeholder: "+91-90000-00000" });
    const ecName = formField({ name: "emergencyContactName", label: "Emergency contact name", value: user.emergencyContactName ?? "" });
    const ecPhone = formField({ name: "emergencyContactPhone", label: "Emergency contact phone", type: "tel", value: user.emergencyContactPhone ?? "" });
    const profileErr = h("div", { class: "form-banner", role: "alert" });
    const saveBtn = h("button", { class: "btn btn-primary", type: "submit" }, "Save changes");

    content.append(
      h("div", { class: "card section-gap" },
        h("div", { class: "card-head" }, icon("user", 18), h("h3", { text: "Contact details" })),
        h("form", { style: "max-width:480px", onsubmit: async (e) => {
          e.preventDefault();
          hideBanner(profileErr);
          setPending(saveBtn, true, "Saving…");
          try {
            await api("/users/me/profile", { method: "PATCH", body: {
              phone: phone.input.value.trim(),
              emergencyContactName: ecName.input.value.trim(),
              emergencyContactPhone: ecPhone.input.value.trim(),
            } });
            toastSuccess("Profile updated.");
          } catch (err) {
            showBanner(profileErr, "error", err.details?.map((d) => d.message).join(" ") || err.message);
          } finally {
            setPending(saveBtn, false);
          }
        } }, profileErr, phone.el, ecName.el, ecPhone.el, saveBtn)));

    /* ---------- Password change ---------- */
    const cur = formField({ name: "currentPassword", label: "Current password", type: "password", attrs: { autocomplete: "current-password" } });
    const next = formField({ name: "newPassword", label: "New password", type: "password", attrs: { autocomplete: "new-password" }, help: "At least 8 characters." });
    const conf = formField({ name: "confirmPassword", label: "Confirm new password", type: "password", attrs: { autocomplete: "new-password" } });
    const pwErr = h("div", { class: "form-banner", role: "alert" });
    const pwBtn = h("button", { class: "btn btn-primary", type: "submit" }, "Change password");

    content.append(
      h("div", { class: "card section-gap" },
        h("div", { class: "card-head" }, icon("shield", 18), h("h3", { text: "Password" })),
        h("form", { style: "max-width:480px", onsubmit: async (e) => {
          e.preventDefault();
          hideBanner(pwErr);
          if (next.input.value.length < 8) { showBanner(pwErr, "error", "New password must be at least 8 characters."); return; }
          if (next.input.value !== conf.input.value) { setFieldError(conf, "Passwords do not match."); return; }
          setPending(pwBtn, true, "Updating…");
          try {
            await api("/auth/change-password", { method: "POST", body: {
              currentPassword: cur.input.value, newPassword: next.input.value, confirmPassword: conf.input.value,
            } });
            toastSuccess("Password changed successfully.");
            cur.input.value = next.input.value = conf.input.value = "";
          } catch (err) {
            showBanner(pwErr, "error", err.message);
          } finally {
            setPending(pwBtn, false);
          }
        } }, pwErr, cur.el, next.el, conf.el, pwBtn)));
  },
});
