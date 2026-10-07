// How this window shows things: theme, page font and width, favourites,
// and how the Projects list is arranged. Preferences, not content, so they
// live in the browser's storage.

import { create } from "zustand";

import { applyMotion, MOTION_PREFS, type MotionPref } from "../../lib/motion";
import { readSets, type TabSet } from "./tab-sets";
import { ACCENTS, applyAccent, applyTheme, loadTheme, type Accent, type ThemePref } from "./theme";

export type PageFont = "default" | "serif" | "mono";

interface Stored {
  font: PageFont;
  smallText: boolean;
  fullWidth: boolean;
  spellcheck: boolean;
  /** The accent colour of buttons, selection and focus. */
  accent: Accent;
  /** Paths of favourite notes, in the order they were added. */
  favourites: string[];
  /** Project folders in the order the person arranged them. */
  projectOrder: string[];
  /** Project folders pinned to the top of the Projects list. */
  pinnedProjects: string[];
  /** The journal shows its list of days beside the page. */
  journalDays: boolean;
  /** Where a page picked in a calendar, table or board opens (Notion's peeks). */
  peekMode: PeekMode;
  /** A click on a page opens it in its own tab, keeping the one you are on. */
  newTabs: boolean;
  /** Home's sections in order, as Customize left them; null for the usual. */
  homeSections: string[] | null;
  /** Tabs saved together under a name, to open again. */
  tabSets: TabSet[];
  /** What the Calendar shows on its days. */
  calendarShow: CalendarShow;
  /** The day weeks start on: 1 Monday, 0 Sunday, 6 Saturday. */
  weekStart: WeekStart;
  /** The sidebar's width in pixels, as its edge was dragged. */
  sidebarWidth: number;
  /** Whether menus, dialogs and views move as they open. */
  motion: MotionPref;
  /** Sidebar sections folded away, by title. */
  foldedSections: string[];
}

/** The sidebar's usual width and its limits. */
export const SIDEBAR_WIDTH = { initial: 240, min: 200, max: 440 };

const sidebarWidth = (value: unknown): number =>
  typeof value === "number" && value >= SIDEBAR_WIDTH.min && value <= SIDEBAR_WIDTH.max ? Math.round(value) : SIDEBAR_WIDTH.initial;

/** What the Calendar shows: journal days, notes by their date properties,
 * dated to-dos, notes that mention a day, and notes made on a day. */
/** The day weeks start on: 1 Monday, 0 Sunday, 6 Saturday. */
export type WeekStart = 0 | 1 | 6;
export const WEEK_STARTS: readonly WeekStart[] = [1, 0, 6];

export interface CalendarShow {
  journal: boolean;
  dated: boolean;
  tasks: boolean;
  mentions: boolean;
  made: boolean;
}

export const CALENDAR_SHOW: CalendarShow = { journal: true, dated: true, tasks: true, mentions: true, made: false };

function readShow(value: unknown): CalendarShow {
  const saved = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof CalendarShow, unknown>>;
  const pick = (key: keyof CalendarShow) => (typeof saved[key] === "boolean" ? (saved[key] as boolean) : CALENDAR_SHOW[key]);
  return { journal: pick("journal"), dated: pick("dated"), tasks: pick("tasks"), mentions: pick("mentions"), made: pick("made") };
}

export type PeekMode = "center" | "side" | "full";
const PEEKS: readonly PeekMode[] = ["center", "side", "full"];

interface PrefsState extends Stored {
  theme: ThemePref;
  setTheme(theme: ThemePref): void;
  set(patch: Partial<Stored>): void;
  toggleFavourite(path: string): void;
  /** Keeps favourites pointing at a note that moved or went away. */
  moveFavourite(from: string, to: string | null): void;
  /** Pins a project folder to the top of the list, or unpins it. */
  togglePinnedProject(project: string): void;
}

const KEY = "kasten.prefs";
const DEFAULTS: Stored = { font: "default", smallText: false, fullWidth: false, spellcheck: true, accent: "blue", favourites: [], projectOrder: [], pinnedProjects: [], journalDays: true, peekMode: "center", newTabs: false, homeSections: null, tabSets: [], calendarShow: CALENDAR_SHOW, weekStart: 1, sidebarWidth: SIDEBAR_WIDTH.initial, motion: "system", foldedSections: [] };

const names = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

function load(): Stored {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Stored>;
    const accent = ACCENTS.includes(saved.accent as Accent) ? (saved.accent as Accent) : "blue";
    return {
      ...DEFAULTS,
      ...saved,
      accent,
      favourites: Array.isArray(saved.favourites) ? saved.favourites : [],
      projectOrder: names(saved.projectOrder),
      pinnedProjects: names(saved.pinnedProjects),
      journalDays: saved.journalDays !== false,
      peekMode: PEEKS.includes(saved.peekMode as PeekMode) ? (saved.peekMode as PeekMode) : "center",
      newTabs: saved.newTabs === true,
      homeSections: Array.isArray(saved.homeSections) ? names(saved.homeSections) : null,
      tabSets: readSets(saved.tabSets),
      calendarShow: readShow(saved.calendarShow),
      weekStart: WEEK_STARTS.includes(saved.weekStart as WeekStart) ? (saved.weekStart as WeekStart) : 1,
      sidebarWidth: sidebarWidth(saved.sidebarWidth),
      motion: MOTION_PREFS.includes(saved.motion as MotionPref) ? (saved.motion as MotionPref) : "system",
      foldedSections: names(saved.foldedSections),
    };
  } catch {
    return DEFAULTS;
  }
}

function save(state: Stored): void {
  const { font, smallText, fullWidth, spellcheck, accent, favourites, projectOrder, pinnedProjects, journalDays, peekMode, newTabs, homeSections, tabSets, calendarShow, weekStart, sidebarWidth, motion, foldedSections } = state;
  try {
    localStorage.setItem(KEY, JSON.stringify({ font, smallText, fullWidth, spellcheck, accent, favourites, projectOrder, pinnedProjects, journalDays, peekMode, newTabs, homeSections, tabSets, calendarShow, weekStart, sidebarWidth, motion, foldedSections }));
  } catch {
    // Preferences fall back to their defaults next time.
  }
}

export const usePrefs = create<PrefsState>()((set, get) => {
  const update = (patch: Partial<Stored>) => {
    set(patch);
    if (patch.accent) applyAccent(patch.accent);
    if (patch.motion) applyMotion(patch.motion);
    save(get());
  };
  return {
    ...load(),
    theme: loadTheme(),
    setTheme(theme) {
      applyTheme(theme);
      set({ theme });
    },
    set: update,
    toggleFavourite(path) {
      const { favourites } = get();
      update({ favourites: favourites.includes(path) ? favourites.filter((p) => p !== path) : [...favourites, path] });
    },
    moveFavourite(from, to) {
      const { favourites } = get();
      if (!favourites.includes(from)) return;
      update({ favourites: to ? favourites.map((p) => (p === from ? to : p)) : favourites.filter((p) => p !== from) });
    },
    togglePinnedProject(project) {
      const { pinnedProjects } = get();
      update({ pinnedProjects: pinnedProjects.includes(project) ? pinnedProjects.filter((p) => p !== project) : [...pinnedProjects, project] });
    },
  };
});
