# The deck editor

`SlidesEditor` is the whole editor: menus, toolbar, filmstrip, the slide, notes
and panels. It runs on a `SlidesHost`, which is everything it needs from the
place it lives in (saving, images, downloads), so the same editor runs inside
Kasten, in the `slides dev` page and in tests.

## How it is put together

```
SlidesEditor (SlidesEditor.tsx)         makes an EditorSession and an EditorUi, lays out the regions
├─ TitleBar     titlebar/               deck name, saving status, Present
├─ MenuBar      menus/                  File … Help, from the command list
├─ Toolbar      toolbar/                the row of tools
├─ Filmstrip    filmstrip/              thumbnails, reorder, sections
├─ Gallery      gallery/                the images drawer: search, filters, drag onto the slide, where each is used
├─ SlideCanvas  canvas/                 the slide, selection, handles, guides, the text editor
├─ NotesPane    notes/                  speaker notes
├─ OutlineView  outline/   GridView grid/    the other two views
├─ SidePanel    panels/                 format options, steps, assistant
├─ Dialogs      dialogs/                find and replace, layouts, theme, background, shortcuts …
└─ ContextMenus menus/                  right-click menus
```

Every region is a component taking `{ session, ui }` and nothing else.

### `EditorSession` (`session/`) — the deck being edited

* `session.state` (React: `useEditor(session)` or `useEditorValue(session, select)`): `deck`, `slideId`,
  `selection` (element ids on the shown slide), `slideSelection` (slides picked in the filmstrip),
  `editing` (element whose text is open), `tool`, `canUndo/canRedo/undoLabel/redoLabel`,
  `saving`, `revision`.
* `session.slide`, `session.deck`, `session.host`.
* Navigation and selection: `goTo`, `goBy`, `select(ids, "replace" | "add" | "toggle")`, `selectAll`,
  `selectSlides(ids, show?)`, `setTool`, `startEditing`, `stopEditing`, `undo`, `redo`, `flush`.
* `session.slides`: `add`, `duplicate`, `remove`, `move`, `moveBy`, `setFlags`, `setLayout`, `setNotes`,
  `setBackground`, `applyTheme`, `setTitle`.
* `session.elements`: `insert`, `patch`, `style`, `transform`, `place`, `nudge`, `remove`, `arrange`, `group`,
  `ungroup`, `align`, `distribute`, `duplicate`, `flip`, `rotateBy`, `lock`, `setText`, `replaceAll`,
  `find`, `boxOf`.
* `session.steps`: `setSteps`, `addStep`, `removeStep`, `setState` (one element at one step), `setParagraphStep`, `build`
  (`reveal`, `walkthrough`, `spotlight`, `clear` on the selection, or on every element but the title). The Steps panel
  and the Slide menu use these.
* `session.text`: formatting of the words of whole selected elements (`state`, `toggle`, `setRun`,
  `setAlign`, `toggleList`, `indent`, `setLineSpacing`, `clearFormatting`).
* `session.clipboard`: `copy`, `cut`, `paste`.
* `session.core` is the WebAssembly engine, for the commands in `session/` only.

Everything that changes the deck is one engine operation, so it is one step of undo. A view never
edits the deck itself.

### `EditorUi` (`ui-state.ts`) — the window

`ui.state` (React: `useUiState(ui)`): `view` (`edit`, `outline`, `grid`), `panel`, `dialog`, `zoom`,
`fitZoom`, `notesOpen`, `snap`, `filmstripOpen`, `paint`, `text` (the open text editor's handle),
`contextMenu`, `previewStep` (the step of the slide shown on the canvas, null for the slide as styled), `fullScreen`,
`lintBadges`. Methods: `setView`,
`togglePanel`, `openPanel`, `openDialog`, `setZoom`, `stepZoom`, `toggleNotes`, `toggleSnap`, `toggleFilmstrip`, `setPaint`,
`openContextMenu`, `setPreviewStep`, `setFullScreen`/`toggleFullScreen`, `setLintBadges`/`toggleLintBadges`. `ui.actions` holds what
the host lets the editor do: `present`, `exportAs`, `print`, `close`, and `fullScreen` (optional). `ui.areas` notes where the focus
last was and which regions select all of what they hold (see "Selecting text").

### Full screen

View → Full screen, the title-bar button and Ctrl+Shift+F put the editor over the whole window of the app it runs in
(`.ks-editor.is-fullscreen`, `position: fixed; inset: 0`, at `--ks-fullscreen-z`, 1000 unless the host sets it lower). It is not the
monitor's full screen: the browser's Fullscreen API is not used, so the editor's own title bar, menus, toolbar, filmstrip, canvas
and panels are what is left of the window, and nothing of the host's chrome shows around them. `watchFullScreen` (`full-screen.ts`)
marks the body with `data-ks-fullscreen` while it is on (the page cannot scroll behind the editor, and a host may hide its own
chrome with the attribute), tells the host through the optional `ui.actions.fullScreen(on)` (a desktop shell may take its own
window full screen), and leaves the mode on Escape when nothing else took the key: the slide cancels a drag, an edit, a step
preview, the tool and the selection first; a field, a menu, a dialog and a host's `aria-modal` window keep Escape. Back, closing
the deck and unmounting the editor leave it. A host whose panes contain their layout (`container-type`) must lift that while the
editor is full screen, or the fixed editor is framed by the pane (Kasten does, in `slides.css`).

### Lint (`lint/`) — problems found while editing

`lintOf(session)` is the session's `LintService`. A change to the deck costs it a comparison of the slides with the
ones it saw last and one timer (well under a millisecond on a deck of 60 slides); after 400 ms of quiet it checks the
slides that changed, one at a time in the browser's idle time. For each it asks the engine what to measure
(`lintProbes`), draws those words off the page with `TextBlock` and reads their sizes (`measure.ts`), and hands the
sizes back with the slide (`lintSlide`), so "does the text fit its box" is answered with the real fonts. A new theme, a
new bibliography (`setReferences`) or fonts that finished loading check every slide again. Views read it with
`useSlideIssues(lint, slideId)` (the badge on a slide in the filmstrip, for errors and warnings) and
`useLintSnapshot(lint)` (the Lint dialog, Tools → Lint, which groups problems by slide, filters by severity, goes to
a problem when its Show button is pressed and says which rules could not be checked).

Lint never speaks unasked. The badges are off until the person turns them on (View → Lint badges, `ui.state.lintBadges`, kept in
the browser's `localStorage`), and while they are off the service does no work of its own: `lintOf` makes it with
`background: false`, and the filmstrip switches it with `setBackground` as the badges are shown or hidden (no timer, no idle time,
nothing loaded). It still notes which slides changed, so turning the badges on checks what changed meanwhile. The dialog does not
depend on it: it asks for a check of every slide (`checkAll`) when it opens.

### Selecting text

Text can be selected wherever it is information, and Select all does what the place asks. One function, `selectAllHere`
(`select-all/`), serves the key (Ctrl+A on the slide, or anywhere no region has a key of its own), Edit → Select all and the
right-click menus: the open text box takes its own words; a field (notes, a name) its text; the outline the text of every row;
the filmstrip and the grid every slide that can be seen; a panel or the images drawer their text; a dialog its words (the dialog
handles the key itself); the slide the elements on it. Where the focus was is `ui.areas.focused` (a menu has taken the focus by
then); regions that keep their own select all register it (`ui.areas.register("slides" | "outline", run)`).

`user-select` is off only for what is a picture or a control: the slide (a drag moves things, except the text box that is open, which
is text all the way down), thumbnails and tiles, buttons, menus and toolbars. Every rule names `-webkit-user-select` too, and inputs
are set to `text` so WebKit keeps them typeable. `select-css.test.ts` reads the sheets and fails on a rule without the prefix, on a
control that could be selected, and on a sheet of a place with words to read that turns selection off.

The outline's fields cannot be selected together, so each has a `Ghost` (`outline/`): its words again as plain text over it,
unseen. A press on the ghost of a field that has not the focus is a press on page text: the browser selects across rows as it
does anywhere, and when the button is up `settle` gives a selection that stayed in one field to the field (its caret, its
selection) and leaves one that reached another row as it is, with the focus on the outline so Escape, Ctrl+A and Ctrl+C reach it.
A field that has the focus is used directly. Copy puts each field on a line of its own (`selectedWords`).

### Commands (`commands/`)

One list of every command (`COMMANDS`), each with an id, label, icon, keys, an `enabled` test and a
`run`. Menus, the toolbar, context menus and the key handler all read it, so a command is named,
enabled and bound in one place.

* `commandOf(id)`, `runCommand(id, { session, ui })`, `isEnabled(command, { session, ui })`,
  `keysOf(id)` (the keys as written on this system), `showCombo`.
* A menu item built from a command: label, icon, `keys`, `disabled` from `enabled`, `checked` from `checked`,
  `run` from `run`.
* Text formatting from anywhere goes through `textFormat` (`commands/format.ts`): with a text box open
  the change goes to its editor, otherwise to all the words of the selected boxes.

### Composites and the insert palette

The nine composite kinds (code, formula, conversation, token probabilities, cards, citation, step
label, embedded page, video) are made, seen and edited here:

* `composite-kinds.ts` names them and says how each starts (`newComposite`); `insert-composite.ts` puts one on the
  shown slide, in the largest free place (`placement.ts`), selected, as one step of undo. Every way in (the Insert
  menu, the palette, the address dialogs) comes through `insertComposite`.
* `commands/composites.ts`: `insert.<kind>` for each kind, `insert.palette` (Ctrl+Shift+P, or `/` when the slide has the
  keys) and `arrange.ungroup-composite` ("Ungroup to shapes", which runs the `expand_composite` operation; not offered
  for a formula, whose expansion is a picture the deck does not keep).
* `dialogs/InsertDialog.tsx`: the palette. It lists what can be inserted, the layouts to add as a slide, the host's
  pictures and every command that can be done now; `palette-rank.ts` filters and ranks by the words typed.
  `EmbedDialog` and `VideoDialog` ask for an address.
* `panels/format/composites/`: a section of the format options for each kind. A double click on a composite opens
  them with the caret in the field marked `data-primary` (`field-focus.ts` carries the request from the canvas to
  the panel). `CitationSection` leaves the place for a picker of references; `addCitationKeys` is what it calls.
* Formulas are drawn by KaTeX (`render/elements/MathView.tsx`). For PowerPoint they are turned into pictures in the
  browser (`export/math-png.ts`, on `export/raster.ts`, which turns any markup into a PNG).

### The images drawer (`gallery/`)

`ui.toggleGallery()` opens it beside the filmstrip (Insert, "Image from the gallery…"). It lists `host.images()` and, when
the host has them, uses `thumbnailUrl` (small copies), `imageUsage` (where each image is used, in one look), `setImageMeta`
(tags, caption, citation key), `watchImages` and `openPath`; every one of them is optional. The open deck's own use of an
image is read from the deck being edited (`usesInDeck`), not from the saved file. An image dragged out of a tile carries
`IMAGE_MIME`; the slide's page takes it with `useImageDrops` (over an empty image slot it fills it, cropped to cover;
elsewhere it lands where it is let go). A double click, Enter or "Add to slide" puts it in the largest free place
(`spotFor` in `place.ts`, on top of `placement.ts`). Files pasted or dropped on the drawer go to `host.addImage` as
`pasted` or `file`; the same bytes give the same image. Each way of placing an image then calls `citeImage`
(`citations/cite-image.ts`), so a figure that has a citation key puts its paper in the slide's footer citation: a second
step of undo, and none when the slide already cites the key.

### Building blocks (`ui/`)

`Icon` (names in `ui/icons.ts`, a subset of Lucide; append a name there if one is missing),
`IconButton`, `TextButton`, `Divider`, `Popover`, `Menu` (items with icons, keys, checks, sub-menus,
keyboard), `Dialog`, `ColorPicker`, `NumberField`, `Segmented`, `Toggle`, `Section`.

The look is `editor.css`: every colour, radius and shadow is a variable `--ks-*` on `.ks-editor`. Use
those and nothing else, so a host restyles the editor by setting them and a dark theme needs no
changes. Class names start with `ks-`.

`data-ks-keep-focus` on a control tells the text editor not to end its edit when the control takes
the focus; toolbar buttons have it.

## Rules for a region

* Keep to your folder. Ask for a change to `session/`, `commands/`, `ui-state.ts`, `SlidesEditor.tsx` or
  the shared CSS instead of making it; do what you need with the public API meanwhile.
* No colours, fonts or sizes of your own: variables from `editor.css`. Slide content always takes
  its colours and fonts from the deck's theme (`src/theme`), never from the editor's variables.
* Every action is a call to the session (an engine operation) or to `ui`. Views never keep a copy of
  the deck.
* A control that shows a value the selection may disagree about shows "mixed" and still works.
* Keyboard first: everything reachable with the mouse is reachable with keys, with visible focus.
* Files stay under about 350 lines. Tests use `@testing-library/react` with a real deck from
  `src/test/engine.ts` (`newDeck()`), a `MemoryHost` and `new EditorSession(engine, host)`.

## Seeing it

`packages/slides-dev` is a Vite page with the editor on a sample deck (`pnpm --filter @kasten-slides/dev dev`,
usually already running at http://127.0.0.1:5174/). `?deck=empty`, `?theme=Dark|Serif|Lecture`,
`?ui=dark`. In the page, `window.__ks` is `{ session, ui, host }`, for scripts. Drive it with
Playwright's Chromium from a Node script and look at the screenshots.
