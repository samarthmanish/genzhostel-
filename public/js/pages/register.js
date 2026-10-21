import { api } from "../api.js";
import { homeForRole, getSession } from "../auth.js";
import { showBanner, hideBanner, setFieldError } from "../validation.js";
import { setPending } from "../ui.js";

const form = document.getElementById("register-form");
const banner = document.getElementById("banner");
const submitBtn = document.getElementById("submit-btn");

const fields = ["fullName", "email", "studentId", "course", "yearOfStudy", "phone", "password", "confirmPassword"]
  .map((name) => ({ name, el: document.getElementById(name), errorEl: document.getElementById(`${name}-error`) }));
const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

document.querySelectorAll(".password-toggle[data-toggle-for]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.toggleFor);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
    btn.setAttribute("aria-pressed", String(show));
  });
});

getSession().then((user) => { if (user) window.location.replace(homeForRole(user.role)); });

// If self-registration is disabled, say so clearly.
api("/auth/config").then((cfg) => {
  if (cfg && cfg.allowSelfRegistration === false) {
    showBanner(banner, "info", "Self-registration is currently disabled. Please ask the hostel office to create your account.");
    submitBtn.disabled = true;
  }
}).catch(() => {});

function clientValidate() {
  let ok = true;
  const v = (name, cond, msg) => {
    if (!cond) { setFieldError(byName[name], msg); ok = false; }
    else setFieldError(byName[name], null);
  };
  v("fullName", byName.fullName.el.value.trim().length >= 2, "Full name is required.");
  v("email", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(byName.email.el.value.trim()), "Enter a valid email address.");
  const sid = byName.studentId.el.value.trim();
  v("studentId", !sid || /^[A-Za-z0-9-]{3,20}$/.test(sid), "Student ID must be 3–20 letters, digits, or hyphens.");
  const pw = byName.password.el.value;
  v("password", pw.length >= 8, "Password must be at least 8 characters.");
  v("confirmPassword", pw === byName.confirmPassword.el.value, "Passwords do not match.");
  return ok;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner(banner);
  if (!clientValidate()) return;

  const data = {};
  for (const f of fields) {
    const val = f.el.value.trim();
    if (val) data[f.name] = val;
  }
  if (data.yearOfStudy) data.yearOfStudy = Number(data.yearOfStudy);

  setPending(submitBtn, true, "Creating account…");
  try {
    const res = await api("/auth/register", { method: "POST", body: data });
    window.location.replace(homeForRole(res.user.role));
  } catch (err) {
    setPending(submitBtn, false);
    // Map field-level server errors onto inputs
    let mapped = 0;
    for (const d of err.details ?? []) {
      if (byName[d.path]) { setFieldError(byName[d.path], d.message); mapped++; }
    }
    showBanner(banner, "error", mapped && mapped === (err.details?.length ?? 0) ? "Please fix the highlighted fields." : err.message);
  }
});
