// Which theme the page around a presentation is in, so that the pages of a presentation that are not the stage (the deck as a page
// that scrolls) are in it too. The editor says it on its root (`data-theme`, when the host names one); an app says it on the page.

export type PageTheme = "light" | "dark";

/** The theme the editor or the page names, or undefined when neither does (the system's then decides). */
export function pageTheme(doc: Document = document): PageTheme | undefined {
  const named = doc.querySelector(".ks-editor[data-theme]")?.getAttribute("data-theme") ?? doc.documentElement.dataset.theme;
  return named === "dark" || named === "light" ? named : undefined;
}
