// What the person chose about updates, kept in this window's storage: the
// daily check (off until turned on, since Kasten asks nothing of anyone
// unasked), whether a release it finds downloads by itself, the release
// already announced or skipped, whether they were asked about the check,
// and the version that ran last.

export const DAY = 24 * 60 * 60 * 1000;
const KEY = "kasten.updates";

export interface UpdatePrefs {
  /** Check once a day, at start and while Kasten stays open. */
  auto: boolean;
  /** A newer version the check finds downloads by itself, ready to
   * install when the person says; where the app can install in place. */
  download: boolean;
  /** When the last daily check ran. */
  checked: number;
  /** The newest release already announced, so it is said once. */
  announced?: string;
  /** A release the person chose to skip. */
  skipped?: string;
  /** Whether they were asked to turn the daily check on. */
  asked?: boolean;
  /** The version that ran last, to say what is new after an update. */
  ran?: string;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);

export function loadUpdates(): UpdatePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<UpdatePrefs> | null;
    return {
      auto: saved?.auto === true,
      download: saved?.download !== false,
      checked: Number(saved?.checked) || 0,
      announced: text(saved?.announced),
      skipped: text(saved?.skipped),
      asked: saved?.asked === true,
      ran: text(saved?.ran),
    };
  } catch {
    return { auto: false, download: true, checked: 0 };
  }
}

export function saveUpdates(prefs: UpdatePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private windows may refuse; the check just runs again next time.
  }
}

/** Changes some of the saved choices and keeps the rest. */
export const updatePrefs = (change: Partial<UpdatePrefs>) => saveUpdates({ ...loadUpdates(), ...change });

/** Whether the daily check should run now. */
export const dueAt = (prefs: UpdatePrefs, now: number) => prefs.auto && now - prefs.checked >= DAY;

/** The numbers of a version such as `v1.2.3-beta.1`, and whether it is a
 * pre-release. */
function parts(version: string): [number[], boolean] {
  const plain = version.trim().replace(/^v/i, "");
  const [numbers = "", ...rest] = plain.split(/[-+]/);
  const pre = plain.slice(numbers.length).startsWith("-") && rest.join("").length > 0;
  return [numbers.split(".").map((n) => Number.parseInt(n, 10) || 0), pre];
}

/** Whether version `a` is newer than `b`: by number, and a release after
 * its own pre-releases. The same rule as the check in the desktop app. */
export function newerThan(a: string, b: string): boolean {
  const [x, xPre] = parts(a);
  const [y, yPre] = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return yPre && !xPre;
}
