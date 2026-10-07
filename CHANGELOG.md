# Changelog

Every release of Kasten, newest first. Versions follow
[Semantic Versioning](https://semver.org); the vault format has its own
version, described in [docs/vault-format.md](docs/vault-format.md).

## 1.0.0

- Windows installer for local use.

## 0.1.0

The first public release, for Windows, macOS and Linux.

### Write and plan

- Pages that work like Notion: `/` for any block, `[[` to link a page,
  covers, icons, callouts, toggles, tables, equations and colours, with
  properties under the title and find and replace (Ctrl+F).
- A new page is a draft until you type: nothing is written for a page you
  leave empty.
- Per-page font, width and text size, kept in the page's own frontmatter.
- Project homes, a task board of every to-do, a calendar of your notes by
  day, and a journal with today as a full page and the days before beside
  it.
- Whiteboards with cards, stickies, shapes, arrows and a pen, presented
  section by section.
- An inbox, a card library, and tags that become databases shown as a
  table, a board, a gallery or a calendar.
- A PDF reader whose highlights become cards that link back.
- Import from Obsidian, Notion, Heptabase or any folder of Markdown.

### Slides

- A Google-Slides-style editor for decks that are plain `.deck` files in
  the vault: themes, layouts, shapes, tables, pictures, sections, speaker
  notes, undo, and find and replace.
- Parts that draw themselves: code with syntax colours and lines in focus,
  LaTeX formulas, conversations, token charts, card grids, citations, step
  labels, embedded pages and video.
- Steps and a Morph transition. Present full screen with a presenter
  window (notes, next slide, timer), an overview, a laser pointer and
  backup slides.
- Export to PowerPoint (a slide for each step), PDF, PNG, Markdown and one
  web page that plays offline. Import from PowerPoint as new slides, as a
  replacement, or as a new version that keeps your edits.
- A lint for slides on demand (Tools → Lint), with thumbnail badges you can
  switch on. Nothing warns while you work.
- Full screen inside the app (the sidebar and tabs go away), a handle on
  every block to move it, one-key adds (T for a text box, R, O, L, A, I),
  and Ctrl+A that fits the place: elements, a text box's text, the outline,
  the filmstrip.
- An assistant tab beside the slide that knows what you have selected and
  marks what it changed with a star until you accept it, and a deck from a
  note.
- A picture gallery that shows where each picture is used, figures clipped
  from PDFs at 300 dpi that cite their paper, and citations from `.bib`
  files in the vault.
- Deck tools in the MCP server and the chat, within the same guardrails
  (removing many slides waits for review), and a `slides` command with its
  own MCP server for decks outside a vault.

### Start ready

- Six starter kits (Daily planner and journal, Second brain, Zettelkasten,
  Getting Things Done, Student, Research), each added in one step that
  Undo takes back.
- 58 templates, with `{{date}}`, `{{time}}`, `{{weekday}}`, `{{week}}`,
  `{{month}}` and `{{year}}` filled in. Type `/` on an empty page and pick
  Template… to start from one, and save any page as a template.
- A journal template, and a default template for each project.

### AI that asks first

- Ask AI about a selection while you write, continue writing or summarise
  a page. Nothing enters the page until you choose Replace or Insert, and
  one Undo takes it back.
- A chat that reads your open pages and writes new ones, and brainstorming
  on a board.
- Any MCP agent, such as Claude Code, through the app's own `--mcp`
  command, within the same guardrails: no deletes, no history rewriting,
  large changes waiting for review, and a whole session undone in one
  step.
- Provider presets for Anthropic, OpenAI, OpenRouter, Ollama, LM Studio and
  vLLM, a model list, and a test before saving. Bring your own model, or
  none.
- Lock a page for agents from its menu.

### Keep everything

- Every change is a git commit in the vault and can be taken back; the
  whole vault can go back to any point, and that is undoable too.
- Backup to GitHub with Sign in with GitHub, to any git host with a token
  or SSH, or as a checked daily backup file in a folder Dropbox, Google
  Drive or OneDrive keeps, with the newest seven kept.
- Restore on a new computer, and Get latest to bring changes across
  without overwriting: when both computers changed a page, both versions
  are kept.
- Empty trash, for a person only and undoable.
- Unsaved typing survives a crash, and a vault in a synced folder is
  flagged.

### On the desktop

- Quick capture from anywhere with a global shortcut
  (Ctrl+Shift+Space, or Cmd+Shift+Space on a Mac), into the Inbox, today's
  journal or a project.
- A tray icon, and closing the window keeps Kasten running; Settings can
  switch this off.
- One window, back where you left it, with no white flash on start.
- Updates install in place after their signature is checked.
- Notifications when a backup is failing or an update is ready.
- A motion setting, a light and dark theme, and the Inter typeface.
