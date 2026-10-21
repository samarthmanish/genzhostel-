/**
 * Small client-side validation helpers for form UX.
 * NOTE: these mirror server-side Zod rules for fast feedback only —
 * the server always re-validates (hiding errors in the UI is not validation).
 */
export const rules = {
  required: (label) => (v) => (v && String(v).trim() ? null : `${label} is required.`),
  minLength: (n, label) => (v) => (String(v ?? "").trim().length >= n ? null : `${label} must be at least ${n} characters.`),
  maxLength: (n, label) => (v) => (String(v ?? "").length <= n ? null : `${label} must be at most ${n} characters.`),
  email: () => (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? "").trim()) ? null : "Enter a valid email address."),
  phone: () => (v) => (!v || /^[0-9+\-\s()]{6,20}$/.test(String(v).trim()) ? null : "Enter a valid phone number."),
  password: () => (v) => (String(v ?? "").length >= 8 ? null : "Password must be at least 8 characters."),
  studentId: () => (v) => (!v || /^[A-Za-z0-9-]{3,20}$/.test(String(v).trim()) ? null : "Student ID must be 3–20 letters, digits, or hyphens."),
  positiveInt: (label) => (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? null : `${label} must be a positive whole number.`),
  matches: (getOther, label) => (v) => (v === getOther() ? null : `${label} do not match.`),
};

/**
 * Attach live validation to a form.
 * fields: [{ name: "email", el: inputEl, rules: [fn, fn], errorEl }]
 * Returns { validateAll(): {ok, values}, clear() }
 */
export function createFormValidator(fields) {
  function validateField(field) {
    const value = field.el.value;
    for (const rule of field.rules ?? []) {
      const msg = rule(value);
      if (msg) {
        setFieldError(field, msg);
        return false;
      }
    }
    setFieldError(field, null);
    return true;
  }

  for (const field of fields) {
    field.el.addEventListener("blur", () => validateField(field));
    field.el.addEventListener("input", () => {
      if (field.errorEl?.textContent) validateField(field);
    });
  }

  return {
    validateAll() {
      let ok = true;
      let firstBad = null;
      for (const field of fields) {
        if (!validateField(field)) {
          ok = false;
          firstBad = firstBad ?? field.el;
        }
      }
      if (firstBad) firstBad.focus();
      const values = {};
      for (const field of fields) values[field.name] = field.el.value;
      return { ok, values };
    },
    clear() {
      for (const field of fields) setFieldError(field, null);
    },
  };
}

export function setFieldError(field, message) {
  const wrap = field.errorEl?.closest(".form-field") ?? field.el.closest(".form-field");
  if (message) {
    if (field.errorEl) field.errorEl.textContent = message;
    wrap?.classList.add("has-error");
    field.el.setAttribute("aria-invalid", "true");
  } else {
    if (field.errorEl) field.errorEl.textContent = "";
    wrap?.classList.remove("has-error");
    field.el.removeAttribute("aria-invalid");
  }
}

/** Map server 422 details ([{path, message}]) onto form fields by name. */
export function applyServerErrors(details, fieldsByName, bannerEl) {
  let applied = 0;
  for (const d of details ?? []) {
    const field = fieldsByName[d.path];
    if (field) {
      setFieldError(field, d.message);
      applied++;
    }
  }
  if (bannerEl && (applied === 0 || (details ?? []).length > applied)) {
    const rest = (details ?? [])
      .filter((d) => !fieldsByName[d.path])
      .map((d) => `${d.path}: ${d.message}`)
      .join(" — ");
    if (rest) showBanner(bannerEl, "error", rest);
  }
  return applied;
}

export function showBanner(el, type, message) {
  if (!el) return;
  el.className = `form-banner ${type} visible`;
  el.textContent = message;
  el.setAttribute("role", type === "error" ? "alert" : "status");
}

export function hideBanner(el) {
  if (!el) return;
  el.className = "form-banner";
  el.textContent = "";
}
