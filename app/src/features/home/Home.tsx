// Home: the start page. A greeting, then the sections the person
// chose with Customize, in their order: quick actions and capture, recent
// work as a gallery, to-dos, the Inbox, projects, the journal, favourites,
// whiteboards and every page. A blank vault offers a first page and the tour.

import "../dashboard/dashboard.css";

import { longDay, isoDay } from "../../lib/dates";
import { Button } from "../../ui/Button";
import { Customize } from "../dashboard/Customize";
import { DashGrid } from "../dashboard/DashCard";
import { sameList } from "../dashboard/sections";
import { usePrefs } from "../workspace/prefs";
import { useWorkspace } from "../workspace/store";
import { HomeSectionView } from "./HomeSections";
import { HOME_DEFAULT, HOME_SECTIONS, homeSections } from "./sections";

function greeting(hour = new Date().getHours()): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Home() {
  const saved = usePrefs((s) => s.homeSections);
  const sections = homeSections(saved);
  // A new vault has only its templates: offer a first page, or the tour.
  const blank = useWorkspace((s) => !s.notes.some((n) => n.kind !== "template"));
  const { newPage, takeTour } = useWorkspace.getState();
  const items = sections.map((id) => ({ id, wide: HOME_SECTIONS.find((d) => d.id === id)?.wide ?? false, node: <HomeSectionView id={id} /> }));
  return (
    <div className="kasten-home mx-auto w-full max-w-[1000px] px-6 pb-24 pt-12 sm:px-10">
      <header className="mb-6 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-13 font-medium text-muted">{longDay(isoDay(new Date()))}</p>
          <h1 className="mt-1 text-28 font-bold tracking-tight">{greeting()}</h1>
        </div>
        <Customize
          label="Home"
          defs={HOME_SECTIONS}
          sections={sections}
          defaults={HOME_DEFAULT}
          onChange={(next) => usePrefs.getState().set({ homeSections: sameList(next, HOME_DEFAULT) ? null : next })}
        />
      </header>

      {blank && (
        <section className="mb-8 rounded-xl border border-line px-6 py-10 text-center" aria-label="Getting started">
          <p className="text-16 font-semibold">A blank vault, ready for you</p>
          <p className="mx-auto mt-1.5 max-w-sm text-13 text-muted">Write a first page or catch a quick note. The tour shows what else Kasten can do, in a page of its own.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button tone="primary" icon="compose" onClick={() => newPage()}>
              New page
            </Button>
            <Button icon="help" onClick={() => void takeTour()}>
              Take the tour
            </Button>
          </div>
        </section>
      )}

      <DashGrid items={items} />
    </div>
  );
}
