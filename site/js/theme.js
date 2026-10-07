// Applies the theme the visitor chose before the page paints: light, dark,
// or, with nothing chosen, the system's.
(() => {
  try {
    const theme = localStorage.getItem("kasten-site-theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch {
    // Storage may be off; the system's theme applies.
  }
})();
