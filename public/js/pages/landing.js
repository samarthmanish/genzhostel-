// Landing page: tiny enhancements only. The demo preview numbers are static
// and clearly labelled as illustrative — we deliberately do NOT present them
// as live database data.
import { api } from "../api.js";
import { getSession, homeForRole } from "../auth.js";

(async function () {
  // If already signed in, offer a straight path to the dashboard.
  const user = await getSession();
  if (user) {
    const cta = document.querySelector(".hero-cta .btn-primary");
    if (cta) {
      cta.textContent = "Go to dashboard";
      cta.href = homeForRole(user.role);
    }
  }

  // Health transparency: if the database is unreachable, show an honest note
  // instead of pretending everything works.
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.status !== "ok") throw new Error();
  } catch {
    const note = document.createElement("p");
    note.className = "form-banner error visible";
    note.style.maxWidth = "640px";
    note.style.margin = "0 auto";
    note.setAttribute("role", "status");
    note.textContent =
      "Heads-up: the backend database is currently unreachable, so sign-in and live data will not work until it is connected. See README setup steps.";
    document.querySelector(".hero .container")?.append(note);
  }
})();
