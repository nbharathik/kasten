# @kasten-slides/render-page

The page a headless Chrome or Chromium draws decks with. `slides render`, the
drawn exports (`slides export -o talk.pdf`, `.png`, `.html`) and the agent
tools' `render_slide` and `render_grid` all point a browser at this page and
call `window.__render`; nothing else draws a deck for them, so a picture made
this way is what the editor shows.

It is a static, offline page: the renderer (`SlideView`), the WebAssembly
engine, the bundled fonts (WOFF2 only) and KaTeX's styles. It loads nothing
from any address but its own. `crates/slides-render` embeds the built folder in
the `slides` program (`build.rs`), serves it to the browser without a network
(every request is answered from memory, see `route.rs` there), and drives it.

## Build

    node scripts/build-render-page.mjs      # the WebAssembly package if stale, then vite build
    cargo build -p slides-cli               # embeds packages/slides-render-page/dist

Without a built page `slides` still builds; drawing says how to get it.
`SLIDES_RENDER_PAGE=<folder>` makes the program use a folder instead of the
embedded page (a page under development).

## `window.__render`

| Call | Does |
| --- | --- |
| `ready` | settles when the engine is loaded |
| `load(deckText, refsBibtex?)` | opens a deck (the text of the `.deck` file); `refsBibtex` is the bibliography the deck's citations are written from ("Vaswani et al., 2017 (NeurIPS)"), and without it they are drawn as their keys |
| `references(bibtex)` | changes the bibliography of the page without opening the deck again (`null`: none, keys are drawn; an empty text: every key is marked `?`) |
| `slide(index, step?)` | draws slide `index` (from 0) at `step` at 1 unit to 1 pixel, settled (fonts, pictures) |
| `grid(columns?, width?)` | every slide as a labelled thumbnail |
| `measure()` | `Measures` for lint: how big the words of every element come out (the editor's own measurer) |
| `pages(options)` | the pictures a PNG export takes, named as the editor names them |
| `print(choice?)` / `unprint()` | the editor's print layout, ready for the browser to print to PDF |
| `html(name?)` | the offline web page of the HTML export |
| `editorPng(index, scale)` | the editor's own SVG-based picture, to compare with a screenshot |

Pictures a deck names are asked for at `media/<path>`; the driver answers.

## Develop

    pnpm --filter @kasten-slides/render-page dev     # http://127.0.0.1:5411, pictures 404
    pnpm --filter @kasten-slides/render-page test
