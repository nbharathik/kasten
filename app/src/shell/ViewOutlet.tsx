import { Suspense } from "react";

import { LazyBoard } from "../features/boards/canvas/LazyBoard";
import { LazyDeck } from "../features/slides/LazyDeck";
import { LazyNotePage } from "../features/workspace/page/LazyNotePage";
import { Home } from "../features/home/Home";
import { Inbox } from "../features/inbox/Inbox";
import { JournalView } from "../features/journal/JournalView";
import { howFromView, useWorkspace, type Place } from "../features/workspace/store";
import { BoardsHome, CalendarView, ChatView, HighlightsHome, History, ImportView, LibraryView, PdfReader, Review, Settings, SlidesHome, TagDatabase, TagsHome, Tasks, Trash } from "./lazy-views";
import { ViewBoundary } from "../ui/ViewBoundary";

/** Renders a tab's place; views load their code when first opened. */
export function ViewOutlet({ place }: { place: Place }) {
  return (
    <ViewBoundary place={`${place.view}:${place.path ?? ""}`}>
      <Suspense fallback={null}>
        <View place={place} />
      </Suspense>
    </ViewBoundary>
  );
}

function View({ place }: { place: Place }) {
  const client = useWorkspace((s) => s.client);
  if (!client) return null;
  switch (place.view) {
    case "home":
      return <Home />;
    case "page":
      // Not keyed by path: a rename moves the open page, which keeps its
      // editor and caret; another page reloads inside it.
      return <LazyNotePage client={client} path={place.path!} />;
    case "inbox":
      return <Inbox />;
    case "journal":
      return <JournalView path={place.path} />;
    case "boards":
      return place.path ? <LazyBoard key={place.path} path={place.path} /> : <BoardsHome />;
    case "slides":
      return place.path ? <LazyDeck key={place.path} path={place.path} /> : <SlidesHome />;
    case "library":
      // Ctrl+click opens a card in a tab, Shift+click on the side stack.
      return <LibraryView onOpen={(path, event) => useWorkspace.getState().openPath(path, howFromView(event))} />;
    case "tasks":
      return <Tasks />;
    case "calendar":
      return <CalendarView />;
    case "highlights":
      return place.path ? <PdfReader key={place.path} path={place.path} /> : <HighlightsHome />;
    case "tags":
      return place.path ? <TagDatabase key={place.path} tag={place.path.replace(/^#/, "")} /> : <TagsHome />;
    case "chat":
      return <ChatView />;
    case "trash":
      return <Trash />;
    case "settings":
      return <Settings />;
    case "import":
      return <ImportView />;
    case "review":
      return <Review />;
    case "history":
      return <History />;
    default:
      return <Home />;
  }
}
