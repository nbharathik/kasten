// Home's sections: what each one is, and the usual set. The
// person's choice is the window preference `homeSections`.

import { chosen, type SectionDef } from "../dashboard/sections";

export type HomeSection = "actions" | "capture" | "recent" | "todo" | "inbox" | "projects" | "journal" | "favourites" | "boards" | "pages";

export const HOME_SECTIONS: readonly SectionDef<HomeSection>[] = [
  { id: "actions", label: "Quick actions", icon: "zap", hint: "New page, quick note, today's journal, templates, search", wide: true },
  { id: "capture", label: "Quick note", icon: "inbox", hint: "Catch a thought, or clip a link, into the Inbox", wide: true },
  { id: "recent", label: "Jump back in", icon: "clock", hint: "What you opened and edited last, as a gallery", wide: true },
  { id: "todo", label: "To-dos", icon: "tasks", hint: "Overdue, today's and upcoming to-dos" },
  { id: "inbox", label: "Inbox", icon: "inbox", hint: "Quick notes waiting to be sorted" },
  { id: "projects", label: "Projects", icon: "project", hint: "Every project, with its progress", wide: true },
  { id: "pages", label: "Pages", icon: "page", hint: "Every project's pages, and the rest, a click away", wide: true },
  { id: "journal", label: "Journal", icon: "journal", hint: "Today's page and the days before" },
  { id: "favourites", label: "Favourites", icon: "star", hint: "The notes you starred" },
  { id: "boards", label: "Whiteboards", icon: "board", hint: "Your latest whiteboards", wide: true },
];

export const HOME_DEFAULT: readonly HomeSection[] = ["actions", "capture", "recent", "todo", "inbox", "projects", "pages", "boards"];

/** The sections Home shows for the saved preference. */
export const homeSections = (saved: readonly string[] | null): HomeSection[] => chosen(saved, HOME_SECTIONS, HOME_DEFAULT);
