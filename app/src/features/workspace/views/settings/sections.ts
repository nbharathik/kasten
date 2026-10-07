// The groups on the Settings page, in order, and the anchor each one has, so
// the section list can jump to them.

export const SECTIONS = [
  "Appearance",
  "Pages",
  "Calendar",
  "Templates",
  "AI providers",
  "Search by meaning",
  "AI agents",
  "Vault",
  "History and backup",
  "Desktop",
  "Keyboard shortcuts",
  "About",
] as const;

/** The element id of a Settings group, from its title. */
export function sectionId(title: string): string {
  return `settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
