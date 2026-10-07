// The theme button: follow the system, light or dark, in turn. The choice
// is kept in this browser, and pictures follow it too.

const KEY = "kasten-site-theme";
const THEMES = [
  { name: "system", icon: "#i-monitor", label: "Theme: follow the system" },
  { name: "light", icon: "#i-sun", label: "Theme: light" },
  { name: "dark", icon: "#i-moon", label: "Theme: dark" },
];

export function setupTheme() {
  const button = document.querySelector("[data-theme-toggle]");
  const use = button?.querySelector("use");
  let current = document.documentElement.dataset.theme ?? "system";

  const apply = (name) => {
    current = name;
    const theme = THEMES.find((t) => t.name === name) ?? THEMES[0];
    if (name === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = name;
    use?.setAttribute("href", theme.icon);
    button?.setAttribute("aria-label", theme.label);
    // A dark picture shows where the page is dark.
    const media = { system: "(prefers-color-scheme: dark)", light: "not all", dark: "all" }[name];
    for (const source of document.querySelectorAll("source[data-dark]")) source.media = media;
  };

  apply(current);
  button?.addEventListener("click", () => {
    const next = THEMES[(THEMES.findIndex((t) => t.name === current) + 1) % THEMES.length].name;
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Without storage the choice lasts until the page closes.
    }
  });
}
