/* Classic (blocking) script loaded in <head> — applies the persisted theme
   before first paint to avoid a flash. NOT an ES module: it exposes a small
   global for the shell to toggle. Only the theme preference is stored in
   localStorage — never authentication data. */
(function () {
  var KEY = "hms-theme";
  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function prefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function current() {
    return stored() || (prefersDark() ? "dark" : "light");
  }
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }
  apply(current());

  window.HMSTheme = {
    get: current,
    toggle: function () {
      var next = current() === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
      apply(next);
      return next;
    },
  };
})();
