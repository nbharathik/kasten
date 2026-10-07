// Pages opened lately, newest first, kept in this browser's storage: a
// convenience for Home, the palette and Quick glance.

const RECENT_KEY = "kasten.recent";
export const MAX_RECENT = 20;

export function loadRecent(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export function saveRecent(recent: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // Recent pages are a convenience; losing them is fine.
  }
}
