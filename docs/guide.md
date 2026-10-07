# Kasten user guide

Kasten is a desktop app for notes, whiteboards and a journal. Everything it
keeps is a plain file in one folder you choose, the *vault*, and every
change is saved in the vault's history.

- [Your vault](#your-vault)
- [A tour of the app](#a-tour-of-the-app)
- [Slides](#slides)
- [Templates and starter kits](#templates-and-starter-kits)
- [AI in Kasten](#ai-in-kasten)
- [Quick capture and the tray](#quick-capture-and-the-tray)
- [Connect AI agents](#connect-ai-agents)
- [Backup and restore](#backup-and-restore)
- [Updates](#updates)

## Your vault

- Pages, cards and journal days are Markdown files; tag databases are
  YAML; whiteboards are JSON Canvas. [The vault format](vault-format.md)
  describes every file.
- Each project is a folder of its own, with its pages inside.
- Every change is a git commit, so any change can be taken back. History
  and the trash are how things are removed; nothing is deleted outright.
- Open the folder in any editor. Kasten notices changes made outside it
  and keeps both versions if the same note changed in two places.
- Keep the vault out of folders a sync app copies, such as OneDrive,
  Dropbox, iCloud Drive or Google Drive. Those apps copy files while
  Kasten writes them, which can leave conflicted copies or a half-copied
  history, so Kasten warns when a vault is in one. For a copy in the
  cloud, use [Backup and restore](#backup-and-restore).

## A tour of the app

**Write.**
- Pages work like Notion: type `/` for any block, including callouts, toggles, tables, code, to-dos and colours.
- Equations are TeX between dollar signs: `$E = mc^2$` in a line, `$$` on lines of their own, drawn with KaTeX. A price like $5 stays text.
- `[[` links a page, and `@` links a page or a day.
- Pages have covers and icons. A page's ••• menu gives it its own font, small text or full width; Settings → Pages sets them for every page.
- A page's tags and properties sit under its title, and Add property starts one.
- Ctrl+F finds in the page you are on, and Ctrl+Alt+F replaces too; Replace all is one step Ctrl+Z takes back.
- Paste a web address over selected text to link it.
- A whiteboard, a tag database or another page can sit inside a page (`/whiteboard`, `/database`, `![[Page]]`).
- Pages start blank, with just a title. On an empty page, type `/` and pick **Template…** to start from a template, or **Ask AI…** to draft it. See [Templates and starter kits](#templates-and-starter-kits).
- A new page is only a draft until you write in it: one you leave untouched leaves no file behind.
- One box catches quick notes, on Home, in the Inbox and on each project's home. Ctrl+N goes to it, or opens a new card where there is none.

**Plan.**
- Home is a start page you arrange. Every project page opens with its own home: a summary, to-dos, a quick note, recent and sub-pages, a kanban and its whiteboards.
- Tasks gathers every to-do from every page. Filter them by place, day and status, group them by project, or work them on a board.
- The Calendar is your notes by day: each day's journal, dated notes and to-dos, and the pages that mention the day, as a month, a week or an agenda. Click a day to open its journal; its + adds a to-do, a task, a note or a page there. Drag a note to reschedule it.

**Think visually.**
- Whiteboards hold cards, stickies, sections, images and labelled arrows.
- Sketch and diagram on them: a pen, an eraser and flowchart shapes, with straight, curved or elbowed arrows.
- Present a board: each section is a slide, shown full screen.
- Keys make things, the right button pans, and a mind-map mode grows ideas as a tree.
- A card on two boards is the same note on both.

**Keep a journal.** Today is a full page, with the days before it beside it. A day starts empty and fills as you write.

**Organise.**
- The Inbox catches quick notes. Triage keys file them, with suggested homes.
- The Card Library finds anything by kind, tag, project and date.
- To work on several pages at once, choose Select in a page's ••• menu in the sidebar, then click the others, from any project or the Pages list (Shift+click picks a run of rows). The bar that appears puts them inside a page, moves them to a project, adds them to a whiteboard or moves them to the trash. Escape stops picking.
- Tags become databases, shown as a table, a board, a list, a gallery or a calendar, with properties and relations.

**Read.** Drop in a PDF to read and highlight it. Turn highlights into cards that link back to their page. Choose Clip in the reader's bar and drag a box around a figure to keep it, at 300 dpi, among the vault's images. The picture remembers its paper, page and box, and the paper's citation key if you give one, so a slide that shows it can cite the paper.

**Work with AI.** Ask about a selection while you write, chat with your open pages, or brainstorm on a board. See [AI in Kasten](#ai-in-kasten).

**Present.** Slide decks are files in the vault like any note: build them, present them full screen and export them to PowerPoint. See [Slides](#slides).

**Bring your notes.** Kasten imports an Obsidian vault or any Markdown folder, a Notion export, or a Heptabase backup. Pick the folder with Browse, or drop Markdown files or a folder on the window. Import shows what will come in first, and each import is one change you can undo. An Obsidian vault can also be opened as it is, with its folders kept as folders.

## Slides

Kasten Slides is an editor for talks, lectures and reviews, in the style of Google Slides. A deck is one plain file, `something.deck`, in your vault ([the format](slides-format.md)), so it has history like your notes, moves with its project, and AI agents can work on it.

**Make a deck.**
- Choose **Slides** in the sidebar, then **New deck**, or **Import PowerPoint…** to start from a `.pptx` file. A deck made outside a project goes in `library/`; one made in a project goes in that project's `decks/` folder.
- Pick a look from four themes (Light, Dark, Serif, Lecture) and twelve layouts (Title, Section, Title + body, Title only, Two columns, Title + image, Image + caption, Code, Comparison, Big number, Quote, Blank). **Slide → Change layout…**, **Change background…** and **Edit theme…** change them; a theme sets the colours, fonts and text styles of the whole deck.
- The same editor works on a plain folder of decks without Kasten: see [Slides on the command line](#slides-on-the-command-line).

**Edit.**
- The filmstrip on the left lists the slides. Drag to reorder; Ctrl+M adds a slide and Ctrl+D duplicates one. **Slide → Skip slide** leaves a slide out of the show, and **Backup slide** files it under the slide before it, to be opened with the down key when a question calls for it. Sections group slides: add, rename and remove them from the filmstrip's menu, and fold them away.
- **Insert** adds a text box, image, shape, line or table. Drag to move, resize and rotate; guides snap; group, align, distribute and lock from **Arrange**. Lists (Ctrl+Shift+8 and 7), links (Ctrl+K) and find and replace (Ctrl+F) work as in a document, and each action is one step of undo.
- **Move a block by its handle.** A small four-arrow chip sits at the top-left corner of the selected block, and a lighter one appears when you point at any block; it stays put while you type in a text box. Drag it to move the block (snapping and guides work as usual). The arrow keys nudge by 1 and Shift with an arrow by 10.
- **Add with one key.** With the slide in focus (not while you type in a text box) press **T** for a text box at the pointer, ready to type, **R** for a rectangle, **O** for an oval, **L** for a line, **A** for an arrow (drag to draw them) and **I** for the image gallery. The keys are shown beside the items in **Insert** and in **Help → Keyboard shortcuts**.
- **Select all** (Ctrl+A) does what fits where you are: every element on the slide, all the text in a text box, the whole outline in the outline view, every slide in the filmstrip or grid. Text you only read, such as lint messages, dialogs and references, can be selected with the mouse and copied.
- **Full screen** (the button at the top right, **View → Full screen**, or Ctrl+Shift+F) gives the whole app window to the deck: Kasten's sidebar, tabs and chat dock go away and the editor fills the window, so you can just work on the slides. It stays inside the app; it does not take over the monitor. Press Esc (when nothing else is being cancelled), the button or Ctrl+Shift+F again to come back.
- **View → Speaker notes** shows the notes under the slide. **View → Views** switches between the slide editor, an outline you edit as text, and a grid of all the slides. **Format options** (Ctrl+Alt+O) opens the details of what is selected.

**Parts that draw themselves.** Insert a **Code block** (coloured for many languages, with lines to bring into focus one at a time), a **Formula** (LaTeX), a **Conversation**, **Token probabilities**, a **Card grid**, a **Citation…**, a **Step label**, an **Embedded page…** or a **Video…**. Each stays editable in the Format panel and goes to PowerPoint as ordinary shapes and pictures. **Arrange → Ungroup to shapes** turns one into plain shapes when you want to draw on it.

**Steps.** A slide can build up in steps. **Slide → Steps** turns a list into steps that reveal one by one, walks a highlight through the elements, or spotlights one at a time; the Steps panel (**View → Steps**) shows every element against every step. A code block with lines in focus gets a step for each. A slide with the Morph transition (**Slide → Transition…**) glides the elements it shares with the slide before to their new places.

**Present.**
- **View → Present** (Ctrl+Enter) shows the deck full screen from the current slide, **Present from beginning** (Ctrl+Shift+Enter) from the first, and **Presenter view** (Ctrl+Alt+Enter) opens a second window with your notes, the next slide, a clock and a timer. **Scroll view with notes** lists every slide with its notes on one page.
- The keys: → or Space for the next step and then the next slide, ← or Shift+Space back, ↓ and ↑ into and out of the backup slides, O for an overview, a number and Enter to go to a slide, B for a black screen, L for a laser pointer, F for full screen, ? for the list, Esc to leave. Click a picture to see it large. Embedded pages run live and videos play.

**Export and print.** **File → Download** gives a PowerPoint file (a slide with steps becomes one slide for each step, so it builds the same way in PowerPoint), a PDF, PNG images (at 1×, 2× or 4×, for each slide or each step), a Markdown outline, or the whole talk as one web page (.html) that plays offline. **File → Print…** prints it.

**Import.** **File → Import slides from PowerPoint…** reads a `.pptx` and asks whether to add its slides to the deck, replace the deck with them, or bring them in as a new version of a deck you took to PowerPoint and edited there (what is still in the file keeps its place, what is new is added, and slides the file lacks stay). Runs of similar slides can be collapsed into steps. What Kasten cannot draw, such as a chart, is kept as it was and written back untouched, and the import lists what it could not keep exactly. It is one step of undo.

**Check the deck.** **Tools → Lint** looks for what goes wrong on a screen: text that does not fit its box, is too small or too pale, things off the slide, overlapping or almost aligned, empty placeholders, pictures without a description, missing fonts, too many words, thin margins, steps that show nothing, citations that name no work, and things PowerPoint would draw differently. The dialog lists them and jumps to each. Nothing warns you on its own while you work; if you want a badge on each thumbnail that counts what is wrong, switch on **View → Lint badges** (Kasten remembers the choice on this computer).

**Images and the gallery.** Every picture you paste, drop, clip or import is kept once, in the vault's `assets/` folder, and any page, whiteboard or deck can show it. Nothing is ever deleted for you: a picture that nothing uses stays where it is.
- Where a picture came from is remembered. Beside each picture, in a hidden `.meta` folder, a small file records its name, size, when it came in, how (pasted, a file, clipped from a paper, made by an agent, or brought in from PowerPoint) and who added it. You can give it tags, a caption and a citation key. Pictures that were there before are listed as they are and get their file when you first change something about them.
- The same picture is one picture. Paste the same image twice, or drop a file you already have under another name, and you get the picture you already have, not a copy.
- Open the gallery from a deck with **Insert → Image → Image from the gallery…**. It lists every picture in the vault, newest first, as small thumbnails. Search finds a name, a tag, a caption or the title of the paper a figure came from. The filters show pictures in **This deck**, **Recent** (the last two weeks), **Agent-made**, **From papers** and **Unused**.
- Double-click a picture (or press Enter, or choose **Add to slide**) to place it in the largest free part of the slide. Drag it onto the slide to place it where you let go, or onto an empty image placeholder to fill it. Paste a picture into the gallery, or drop files on it, to add them.
- Choose a picture to see the notes, whiteboards and decks that show it; a slide of the open deck is a link that jumps to it. "Unused" only filters: it never deletes.

**Papers and citations.** Keep the bibliographies of your papers in `.bib` files anywhere in the vault. **Insert → Citation…** finds a work by key, author, title or year and adds it to the slide's footer as "Vaswani et al., 2017 (NeurIPS)", as a number, or as a full reference; a slide made of a citation list prints every work the deck cites, in order. A key that names no work is marked, and the lint says which work it may be. In the PDF reader, choose **Clip** and drag a box around a figure to keep it at 300 dpi, with its paper, page and box remembered; placing it on a slide adds the paper to that slide's citations.

**Work with AI.** The deck tools are part of Kasten's MCP server (see [Connect AI agents](#connect-ai-agents)), and the chat can use them too: an agent can outline a deck, build slides and diagrams, place pictures, cite works and check the result with the lint. Its changes are commits like any other. A small edit goes straight in; taking many slides out (removing them, or emptying them) waits for your review (`guardrails.max_slides_removed` in `.kasten/config.yaml`, 3 in ten minutes by default) with the slides before and after side by side, and **undo session** takes back everything a session did. [skills/kasten-slides/SKILL.md](../skills/kasten-slides/SKILL.md) teaches Claude Code the loop: outline first, then build, render, lint and repeat until nothing is an error.

**The assistant tab.** **View → Assistant** (or the sparkle button at the top right) opens Kasten's chat beside the slide. It knows which slide you are on and which elements you have selected, so "tighten this" and "add a diagram that shows the loop" mean what you are looking at. Each deck has a conversation of its own, and what it changes is one session you can take back with **Undo this chat's changes**.
- **Stars mark the assistant's work.** Whatever an assistant makes or changes in a deck, from this tab or over MCP, carries a small star until you accept it or change it yourself: one in the corner of the element, and one on the slide's thumbnail in the filmstrip. Right-click an element and choose **Accept**, or use **Accept all** in the tab or in the **Tools** menu. Changing an element yourself takes its star off. An assistant cannot accept its own work. The stars are kept in the deck file (see [the format](slides-format.md)); they never show when you present or export.
- **A deck from a note.** Ask for a deck from one of your notes (the `deck_from_note` tool): its headings become slides, its lists the slides and its prose the speaker notes, and its pictures and the works it cites come along, with the notes it links to as sections when you ask. Then refine it slide by slide.

### Slides on the command line

The `slides` program works on decks in any folder, with or without Kasten. It is built from the source for now (`cargo build -p slides-cli`; build the page it draws with first, `node scripts/build-render-page.mjs`, to have `render` and the PDF, PNG and web page exports):

```sh
slides new talk.deck --title "My talk"        # a deck with a title slide
slides dev ~/talks                            # edit the folder's decks in your browser
slides outline talk.deck                      # the deck as a Markdown outline
slides lint talk.deck                         # what is wrong; exits 1 on errors
slides export talk.deck -o talk.pptx          # PowerPoint; -o talk.pdf, .png or .html draw it with Chrome or Chromium
slides render talk.deck --grid -o grid.png    # a picture of every slide (Chrome or Chromium)
slides import old.pptx -o old.deck            # from PowerPoint
slides mcp --folder ~/talks                   # the deck tools for an AI agent, over stdio
```

Drawing runs the browser in its sandbox, which is what keeps a damaged picture in a deck from taking it over. As the administrator (root), and in some containers, the sandbox cannot start; the command then says so and names `SLIDES_RENDER_NO_SANDBOX=1`, which runs the browser without it. Set it only where the container or machine is itself the boundary you trust. The browser is driven over a port on the machine's own loopback interface, so on a computer you share with people you do not trust, draw inside your own container.

## Templates and starter kits

- **Templates.** Nearly sixty ship with Kasten, on shelves for daily
  notes and reviews, knowledge, work, life and writing: a daily planner,
  a weekly plan, meeting notes, book notes, a trip plan and more. Open the
  gallery with **From a template** on Home or the palette for a new page,
  or type `/` on an empty page and pick **Template…** to fill that page.
  Each fills in the date, the time, the weekday, the week, the month and
  the year as it starts.
- **Your own.** **Save as template** in a page's ••• menu makes one from
  any page. In the gallery, **Edit template** opens a template's own page
  to change it. The journal's template for new days is chosen in
  Settings → Templates. A project's home menu sets the template for its
  new pages: **Template…** on one of them opens the gallery on it.
- **Starter kits** set up a way of working in one step: a daily planner
  and journal, a second brain (PARA), a Zettelkasten, Getting Things Done,
  a student's courses and assignments, or a researcher's papers and lab
  notebook. Each adds a page that explains it, templates, tag databases
  and boards, never touches your own files, and one Undo takes it all
  back. Pick one when you create a vault, or later from the gallery's
  Starter kits tab or Settings → Templates.

## AI in Kasten

AI is optional, and you bring the model.

- **Set it up** in Settings → AI providers. Pick Anthropic, OpenAI,
  OpenRouter, Ollama, LM Studio, vLLM or any other OpenAI-compatible
  server; Kasten fills in the address, lists the models the server
  offers, and tests the connection before you save. Keys go to your
  system's keychain, never into the vault, and are sent only to the
  address they were saved for.
- **While you write.** Select text and choose **Ask AI** in the toolbar,
  or type `/` for **Ask AI…**, **Continue writing** or **Summarize page**;
  on an empty page, **Ask AI…** drafts it. The answer appears in a preview
  beside the text: **Replace selection**, **Insert below** (or **Insert**
  when nothing was selected), **Try again** or
  **Discard**. Nothing enters the page until you take it, and Ctrl+Z
  takes it back.
- **The chat** sits at the top right (Ctrl+Shift+A) and reads the pages
  you have open; **+ Context**, or typing `@` or `[[`, adds more. It can
  create and design pages, add cards and fill whiteboards, rewrite a
  section and propose templates. **Ask AI about this page** in a page's
  ••• menu starts a chat about it. Brainstorm on a board, and every idea
  arrives as a card.
- **Everything the AI writes** is marked on the page, listed in History
  and undone in one step. Pages you lock with **Lock for agents** are
  read-only to it.

## Quick capture and the tray

- **Quick capture** opens a small box over whatever you are doing:
  Ctrl+Shift+Space (⌘⇧Space on a Mac), from any app. Type and press
  Enter to put it in the Inbox. Tab switches the target to Today's
  journal or a project. Esc closes it and keeps what you typed for next
  time. Change the shortcut in Settings → Desktop.
- On Linux with Wayland, apps can't claim a global shortcut. Bind
  `kasten-app --capture` in your desktop's keyboard settings instead;
  Settings → Desktop shows the exact command.
- **Closing the window keeps Kasten running** in the tray (or the Dock on
  a Mac), so capture and backups carry on. The tray menu opens Kasten,
  starts a quick capture, backs up now, gets the latest or quits. Turn
  off **Keep running when the window closes** in Settings → Desktop to
  quit when the window closes.
- **Notifications** say when a backup keeps failing or an update is
  ready, only while Kasten is in the background, and never show what a
  note says. They can be turned off in Settings → Desktop.

## Connect AI agents

Kasten serves its vault over [MCP](https://modelcontextprotocol.io). Agents read, search and write through the same core and guardrails as the app:

- locked notes and oversized writes are refused (lock a page from its menu with **Lock for agents**);
- templates, big removals and bursts of changes wait for your review;
- every agent session can be undone.

Turn on history for the vault first, in Settings or with `kasten start-history --vault ~/Notes`.

The installed app is the MCP server: `kasten-app --mcp`. **Settings → AI agents** copies each line below with the app's full path on your computer, which is `/usr/bin/kasten-app` on Linux and `/Applications/Kasten.app/Contents/MacOS/kasten-app` on macOS.

```sh
# Claude Code, over stdio, in every folder you use it from
claude mcp add --scope user kasten -- kasten-app --mcp --vault ~/Notes

# Clients that connect by URL: http://127.0.0.1:7433/mcp, with a bearer token
kasten-app --mcp --vault ~/Notes --http
# token: ~/Notes/.kasten/cache/mcp-token (Settings → AI agents → Copy the token)
```

For Claude Desktop, Cursor and other apps with an `mcpServers` setting, Settings copies a ready-made entry. A build from source can run `kasten-mcp` with the same arguments in place of `kasten-app --mcp`.

[skills/kasten/SKILL.md](../skills/kasten/SKILL.md) teaches Claude Code the vault's conventions. Review and undo agent work from the app, or from the command line:

```sh
kasten proposals --diff        # changes waiting for review
kasten accept ID               # or: kasten reject ID
kasten undo-session ID         # revert a session as new commits
```

## Backup and restore

Kasten is desktop-first: backup keeps your notes safe and moves them to a
new computer. It isn't live sync. Everything below is in Settings →
History and backup, and the status bar's dot says how the last backup
went.

- **GitHub.** **Sign in with GitHub**: GitHub shows a code to confirm,
  and Kasten creates a private repository and pushes your vault to it.
  After that it pushes a few minutes after changes and at least hourly,
  never with force. Sign out removes the token from this computer.
- **Any other git host.** Give a private repository's address (`https://`
  or SSH) with a token for it, or use SSH keys or git's credential helper.
  The token is checked before it is saved, kept in your system's
  keychain and sent only to that host.
- **Backup files.** Choose a folder, such as one Dropbox, Google Drive or
  OneDrive keeps in sync, or a disk. Once a day, after Kasten has been
  idle for a moment, it writes the whole vault and its history to one
  file there, checks it, and keeps the newest seven. Backup files aren't
  encrypted, so choose a folder only you can read.
- **Restore.** On a new computer, choose **Restore from a backup** where
  you open a vault: sign in with GitHub and pick the repository, give a
  git address, or pick a backup file. The folder you restore into must be
  empty. The vault comes back with every page and its whole history.
- **Get latest.** Moving between two computers? **Get latest** brings in
  the changes made on the other one, from the remote or from a backup
  file. It never overwrites: if both computers changed a page, their
  version is kept beside yours as a copy, named after the other computer.
  Kasten tells you when the backup is ahead of this computer.
- **Restore a point in time.** History's **Restore everything to this
  point** puts the whole vault back as it was. Files made since then go
  to the trash, and Undo reverses it.
- **Empty trash** (Trash view) removes trashed files for good from the
  folder, only when you ask, never through AI or agents. What was in them
  stays in the vault's history, and Undo brings them back.

Pushes go only to a remote you set or confirmed on this computer, so a
vault someone shares cannot send your notes elsewhere; a vault that names
one waits for **Back up now**. Protect the remote's main branch against
force pushes and deletion: it is the one copy no local process can
destroy.

## Updates

- Turn on **Check for new versions** in Settings → About; the app also
  offers it once, after it first opens a vault. It then asks GitHub for
  the latest release once a day, and sends nothing else.
- A new version shows in the status bar, with **What's new** listing the
  changes. **Install and restart** downloads it, checks its signature,
  writes every open page and restarts into the new version. With
  **Download new versions automatically** on, the download happens by
  itself and the status bar says **Restart to update**.
- Where an update can't install itself, **Download** fetches the
  installer for your computer, and the release page has every package.
- Installing replaces only the app: your vault stays where it is.
  **Skip this version** hides that release until a newer one is out.
