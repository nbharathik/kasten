# The Kasten Slides deck format

A deck is one file with the extension `.deck`. It is JSON, written the same
way every time, so a deck is always the same bytes and a change shows in git
as a few lines. Nothing in it is a database or a binary: images stay as
separate files, and the deck refers to them by path.

The format is defined by the Rust types in `crates/slides-core`. Two files
are generated from them and kept in `packages/slides-wasm/ts/generated`:
`deck.schema.json` (JSON Schema for a whole deck) and `ops.json` (every
operation with its input and output schema). Read those for the exact shape;
this page explains what the parts mean.

## Version

`format` is always `kasten-deck` and `formatVersion` is `1`. A build refuses a
deck with a newer version and says so. When the version changes, the change is
listed at the end of this page and older decks are migrated when opened.

Fields a build does not know are kept when it reads a deck and written back,
so a deck saved by a newer build survives an older one.

## Units

A 16:9 slide is **960 x 540 units**; a 4:3 slide is 720 x 540. One unit is 1/96
inch, exactly 9525 EMU in PowerPoint, so exporting never rounds. The origin is
the top left and angles are degrees clockwise. Type sizes are in points, as in
Google Slides (1 pt is 4/3 units).

Numbers are written without a fraction when they are whole, and positions are
rounded to two decimals.

## The file

```json
{
  "format": "kasten-deck",
  "formatVersion": 1,
  "id": "d-4b1e0x9a",
  "title": "Tool use in language models",
  "size": { "w": 960, "h": 540 },
  "theme": { "name": "Light", "colors": {}, "fonts": {}, "textStyles": {}, "layouts": [], "master": [] },
  "slides": [],
  "sections": [{ "title": "Part two", "startsAt": "s-91c2ab3d" }],
  "present": { "slideNumbers": true, "stepLabel": "Step {n} / {total}" }
}
```

Keys are written in alphabetical order. Ids are a kind prefix and eight random
base36 characters: `d-` for a deck, `s-` for a slide, `e-` for an element.

### Theme

A deck carries its own copy of its theme, so it opens the same anywhere.

- **colors**: `text1`, `text2`, `bg1`, `bg2` and `accent1` to `accent6`, each
  `#rrggbb`. They match PowerPoint's theme colours one for one.
- **fonts**: `heading`, `body` and `code`, each a family with fallbacks.
- **textStyles**: named looks (`title`, `subtitle`, `body`, `caption`, `code`,
  `citation` and a few more): size in points, colour token, font role.
- **layouts**: named layouts with placeholders (slots). A placeholder has a
  role (`title`, `body`, `image`, ...), a box, a text style and a prompt.
- **master**: elements drawn on every slide, such as a header bar, a logo and a
  slide number. A layout can hide them.

Anywhere a colour is wanted, write a token (`accent2`) so it follows the theme,
or a hex value (`#1a73e8`) for a colour of its own.

### Slides

```json
{
  "id": "s-91c2ab3d",
  "layout": "title-body",
  "notes": "Say this first.",
  "hidden": true,
  "backup": true,
  "steps": 7,
  "transition": { "kind": "morph", "duration": 0.6 },
  "elements": []
}
```

`elements` run from the bottom of the stack to the top. A `hidden` slide is
skipped when presenting. A `backup` slide is stacked under the slide above it
and reached only by going down; the first slide cannot be one.

### Marks on an assistant's work

A slide may carry `x-agent`: the elements an assistant (an AI agent working through the tools) made or
changed and nobody has looked at since, so that an editor can badge them until the person changes them or
accepts them.

```json
"x-agent": [{ "at": 1790000000000, "by": "claude-code", "ids": ["e-4b1e0x9a", "e-77c0a1d2"], "session": "01K8Z3K6Q2M4X7V9B1C5D8E0F2" }]
```

A batch is the elements one agent made or changed, on this slide, up to `at` (milliseconds since 1970). `by` is
the agent's client, `ids` are the elements (at any depth) and `session` is the agent's session, which a host can
undo as a whole; it may be left out.

- **The tools write them.** After a change, the tools an agent works through mark what differs between the deck
  they read and the deck they made, and keep the marks the deck already had on what the change left alone. Whatever
  marks an agent's output carries are set aside: an agent can neither add nor take off a mark itself, and it
  is refused `accept_marks`.
- **An edit takes them off.** An operation that changes an element or deletes it takes its mark off in the same
  step of undo, whoever runs it. Moving an element in the stack is not changing it.
- **Accepting takes them off** and changes nothing else: `accept_marks { slide?, ids? }` for the elements given,
  for a slide, or for the whole deck. It is one step of undo.
- A copy of a slide is as marked as the slide. A field that is not a list of batches is kept as it is and read
  as no marks.

It is a field like any the model does not list (it is kept in `extra`), so builds that do not know it keep it, and
the format's version does not change. `fixtures/decks/agent-marks.deck` is a small deck that has them, with two
batches on one slide.

### Elements

Every element has an `id` (unique on its slide) and a `type`. Two slides may
give the same id to an element on purpose: that is how a Morph pairs them.

| Common field | Meaning |
| --- | --- |
| `x`, `y`, `w`, `h` | The box in slide units. Left out when a placeholder supplies it. |
| `rotation`, `flipH`, `flipV` | Turn (degrees) and mirror. |
| `placeholder` | The layout slot this element fills. |
| `style` | `fill`, `stroke`, `radius`, `shadow`, `opacity`, `startArrow`, `endArrow`. |
| `stepStates` | The state (`hidden`, `dimmed`, `normal`, `highlighted`) from each step onward. |
| `name`, `alt`, `locked`, `link`, `morphId` | Layer name, alt text, lock, address, Morph link. |

The types:

- **`text`**: a text box; `text` holds the words.
- **`shape`**: a PowerPoint preset (`rect`, `roundRect`, `ellipse`, `triangle`,
  `rtTriangle`, `diamond`, `chevron`, `rightArrow`, ...), optionally with text.
- **`line`**: a free line or arrow, from the box's top left to its bottom right.
- **`connector`**: a line attached to two elements' sides (`from`, `to`); its
  box always follows them.
- **`image`**: `src` is a file in the host's image store, such as
  `assets/figure.png`; optional `crop` and `mask`. A picture is stretched to its
  box; `"fit": "cover"` makes it fill the box without being stretched instead,
  cut at the sides or at the top and bottom to the box's shape (a `crop` of its
  own comes first).
- **`group`**: `children`, in slide coordinates; it moves and scales them.
- **`table`**: `columns` (widths), `rows` of `cells`, and `headerRow`. Cells go left
  to right, skipping places a cell above covers; `colSpan` and `rowSpan` are 1 or
  more and stay inside the table. A table has at most 1000 columns, 10000 rows and
  50000 places (columns times rows): the operations that add or change one refuse a
  bigger table, or a span that reaches past the table, in words that say what to
  change, and everything that draws one (the editor, the export) holds itself to
  the same limits whatever a file claims.
- **`raw`**: what an import could not understand (a chart, a SmartArt diagram, a
  freeform shape, an embedded object, a video), kept as it was. `original` says
  what it was (`pptx:chart`), `xml` is the shape's own XML, `preview` is a picture
  of it if one could be drawn, and the parts that XML points at (a chart, its
  workbook, a diagram's data ...) are under `pptx` in base64, so a PowerPoint
  export writes the object back whole, moved to where the element is now. Where
  a file cannot be written back (the XML or a part is missing or unsafe), the
  export draws the `preview` instead. The editor shows the preview, or a grey
  box with a label, and never changes what is inside. Only an import makes a raw
  element: the tools an assistant works with refuse to add one or to change one
  that is there (it can still move, resize, copy and delete it). An export writes
  back only what shows something: charts with their styles and workbook, diagrams,
  pictures, sound and video, and hyperlinks to web pages and mail addresses. An
  embedded file or object of another program, a macro, and a link that is fetched
  when the file opens are left out, the object is drawn as its `preview` instead,
  and the export's warnings name what was left out.
- **composites**: `code`, `math`, `chat`, `token-probs`, `card-grid`,
  `citation`, `step-label`, `embed` and `video`. Each has a few fields of its
  own and is drawn as the elements above; see *Composite elements* below.

### Text

Text is stored as runs, not Markdown, so a colour or a size on one word
survives a trip through PowerPoint.

```json
{ "paragraphs": [
  { "list": "bullet", "runs": [{ "t": "Plain " }, { "t": "bold", "b": true }, { "t": " and a " }, { "t": "link", "link": "https://example.com" }] }
], "valign": "middle" }
```

A run has `t` and, when they apply, `b`, `i`, `u`, `s` (bold, italic,
underline, strike), `color`, `size`, `font`, `link`, `code` and `math`. A
paragraph has `align`, `list` (`bullet` or `number`), `level`, `style`, and
spacing. No list means a plain paragraph.

Operations accept Markdown and turn it into runs; the file always holds runs.

## Steps

A slide with `steps: 7` has seven clicks after it appears, so eight **states**:
state 0 is what shows when the slide appears and each click moves one step on.
A slide has at most 50 steps. An element says how it looks from a step onward,
until its next entry, in `stepStates`; with no entry it is normal, and at step 0
too.

```json
{ "id": "e-llm", "type": "shape", "shape": "roundRect", "x": 210, "y": 250, "w": 110, "h": 64,
  "stepStates": { "0": "hidden", "2": "highlighted", "3": "dimmed" } }
```

| State | On the slide |
| --- | --- |
| `hidden` | Not shown. The editor draws a dashed ghost where it is. |
| `dimmed` | Shown at the theme's `dimmedOpacity` (0.25 in the built-in themes). |
| `normal` | As styled. |
| `highlighted` | As styled, with the theme's `highlight` drawn round it: an outline of a colour and a width, standing 2 units off. |

A group's state is its children's too: what a group hides, it hides whole. A
paragraph of a list can carry `step`, the step it appears at, and is hidden
until then, so a list can build line by line. A `step-label` element says
"Step n / N" and a `code` element's `focus` entries take one step each; they use
these same steps.

Three operations set them, each one step of undo:

- `set_slide_steps { slide, steps }` sets the number of steps. Raising it adds
  empty steps. Lowering it moves what the removed steps did onto the last step
  that stays, so the slide ends up looking as it did at the end.
- `set_step_states { slide, id, states }` merges entries into one element's:
  `{"0": "hidden", "2": "normal"}`, and `null` takes an entry away. The slide
  gets as many steps as the highest one named.
- `build_steps { slide, ids, recipe }` builds the steps of several elements at
  once. The elements are taken in reading order, top to bottom and then left to
  right (boxes a little out of line still read across, and a connector lies in the
  row of the boxes it joins). The recipes:
  - `reveal`: the elements appear one by one, from step 1. A single text box with
    a list appears item by item instead, one paragraph to a step.
  - `walkthrough`: each element in turn is `highlighted` while the others are
    `dimmed`; the slide arrives as it is, and the first click highlights the first.
  - `spotlight`: the same, but the element in turn is left as it is (`normal`),
    with no outline. It needs two elements or more.
  - `clear`: takes every state and paragraph step from the elements.

  A recipe replaces the states of the elements it is given, leaves every other
  element alone, and sets the slide's steps to what it needs.

### In a PowerPoint file

PowerPoint's own animations do not survive Google Slides or Keynote, so a slide
with N steps becomes **N + 1 slides**, in order, each drawn as the editor draws
that state: hidden elements are left out; a dimmed element is drawn at the theme's
dimmed opacity (a file has no opacity for an element, so its fill and line are
see-through by that much and its text is mixed toward the colour behind it, which
every program shows alike: the slide's, or that of the shape it lies on, such as the
panel of a code block; over a picture the text is made see-through instead); a
highlighted one is followed by an outline shape of the
theme's colour and width; list items that have not come yet keep their room and show
nothing; the step label says the step.

- The title placeholder gets ` (k/N+1)` after it **in the file only**: `ReAct (3/8)`.
- Each of the slides carries the original notes and then a last line naming the
  slide and the page, `[kasten s-91c2ab3d step 3/8]`.
- A hidden or backup slide is hidden, or left out, on all its pages. A section
  starts at the first page of its slide and holds all of them. A link to a slide
  goes to its first page.
- `slides export deck.deck --steps final`, and `steps: "final"` in the editor's
  export options, write one slide for each slide instead, in the state after the last
  click.

## Composite elements

Some things are worth storing as what they mean, not as the shapes they are
drawn with: a block of code, a formula, a chat, a set of cards. A **composite**
has a few fields of its own, and `slides-core` works out the text boxes, shapes,
lines and pictures it is drawn with, its **expansion**. The editor, present mode,
the `slides` command and the PowerPoint export all draw that expansion, so a
composite looks the same in each.

| `type` | Fields, besides the common ones | Drawn as |
| --- | --- | --- |
| `code` | `code`, `language`, `theme` (`dark` or `light`), `lineNumbers`, `firstLine`, `focus`, `fontSize` | A rounded panel of monospace text coloured by syntax. |
| `math` | `latex`, `inline`, `color`, `fontSize` | One picture of the formula. |
| `chat` | `messages`: `role` (`system`, `user`, `assistant`, `toolCall`, `toolResult`) and `text` | A bubble for each message. |
| `token-probs` | `tokens`, `next` (`token` and `p`), `chosen` | Chips for the words so far and a bar for each likely next token. |
| `card-grid` | `cards` (`title`, `body`), `columns` | Rounded cards in a grid. |
| `citation` | `keys` (BibTeX keys), `format` (`short`, `numbered`, `full`, `list`) | One small text box. |
| `step-label` | `format` | One text box that says "Step n / N". |
| `embed` | `url`, `poster`, `title` | The poster, or a dashed panel that names the page. |
| `video` | `src`, `poster`, `autoplay`, `looped` | The poster, or a dark panel, with a play button. |

A composite has a box (`x`, `y`, `w`, `h`, or its placeholder's) and the common
fields. `rotation` turns the parts about the middle of the box and `stepStates`
apply to the whole. `style` is not used: the looks come from the theme and the
kind. What every expansion promises:

- The parts have ids `<id>.<n>`, such as `e-code.2`, the same every time. A part
  that is left out (the line numbers, when there are none) still uses its number.
- Colours are theme tokens or hex values. Code and the video panel have palettes
  of their own, chosen for contrast on their own background.
- Text fits by construction. Each kind sets its words at the largest size, up to
  a cap, at which they fit the box, and shrinks them to a floor: 10 pt for code and
  token probabilities, 12 for chats and cards, 8 for references and the step
  label. Below the floor every word is still drawn, even past the edge of the box.
  Words are never cut.
- Whatever the box holds (zero, negative, not a number), every size and position
  that comes out is finite and rounded to two decimals.

### Code

`language` is a name or an extension: `python`, `rs`, `ts`, `text` for none.
Python, JavaScript, Rust, Go, Java, C, C++, C#, Ruby, PHP, SQL, HTML, CSS, XML,
JSON, YAML, Markdown, shell scripts, diffs and a few more are coloured with syntax
definitions built in; TypeScript, Kotlin, Swift and TOML, which they lack, with a
small lexer; any other is left plain. Only the first 240 lines are coloured and a
line longer than 2,000 bytes is left plain. A tab counts as four columns. Line
numbers start at `firstLine` (1 when absent) and stay bright while the code dims.

Without `focus` the code is one text box with a paragraph for each line, so it
stays editable in PowerPoint. `focus` makes a walkthrough: one entry for each
step, naming the lines in focus at that step; the others are dimmed. An entry is
a line (`3`), a range (`2-4`), a list (`4,6-10`), a range open at the end (`3-`)
or `all`. Lines are counted from 1 at the top of the code, whatever `firstLine`
is. Step 0 shows every line, and so does a step whose entry names no line of the
code. Each line is then a text box of its own with its states in `stepStates`;
past 200 lines the code stays one text box and does not dim.

### Math

PowerPoint cannot typeset LaTeX, so a formula leaves the deck as a picture. The
expansion is one picture of the whole box, with the LaTeX as its alt text,
named after what is in it: `math/`, 16 lower-case hex digits and `.png`. The
digits are the FNV-1a hash (64 bits) of these, each followed by a zero byte: the
LaTeX; the colour as written, nothing when absent; the size in points as `{}`
prints it, 32 when absent; and `i` for an inline formula or `d` for a display
one. `E=mc^2` is `math/5236592fa920b5e6.png`. `math_image_path` in `slides-core`
works the name out; a host in another language can compute it the same way.

The editor draws formulas itself, with KaTeX. To export PowerPoint it makes a
picture of each formula and hands it over under its name. The picture is in the
element's colour, or the theme's text colour when there is none, and the name
does not say which; a host that keeps pictures from one export to the next should
keep them for each theme. When the picture for a name is not there, the export
writes the LaTeX as italic text, centred in the box, and adds a warning.

### The others

- **`chat`**: the user's messages sit on the right in the accent colour, the
  model's on the left, and a system prompt takes the whole width. A tool call is
  outlined and set in the code font after an arrow; a tool result is tinted and
  in the code font. All bubbles are set at one size.
- **`token-probs`**: `tokens` flow as chips that wrap like words; a space in a
  token shows as a dot and a line break as `\n`. Each of the first eight `next`
  tokens has a row with a bar as long as its probability `p` (0 to 1) on a track
  as long as 100%; the rest are counted, "+3 more". The token `chosen` (an index
  into `next`) is drawn in the accent colour and in bold. If the chips do not fit,
  the earliest are left out behind a chip of dots.
- **`card-grid`**: the columns come from the number of cards unless `columns`
  names them; all cells are the same size and all cards are set at one size.
- **`citation`**: a key names a work in a bibliography, which the host gives as
  BibTeX (Kasten reads the `.bib` files of the vault; `slides dev` and the `slides`
  command read the `.bib` files beside the decks, `refs.bib` for one). `short`, the
  default, is who, when and where: `Vaswani et al., 2017 (NeurIPS)`, works joined by
  `;`; `numbered` is `[1][2]`, the number the deck gives each work (a work is numbered
  when it is first cited, counting through the slides in their order and, on a slide,
  through the citations from the top left to the bottom right, so `[3]` is the same
  work on every slide); `full` is a whole reference on a line for each key; `list`
  prints every work the deck cites, each with its number, for a references slide (its
  own `keys`, if any, are listed as well). A key the bibliography does not have is
  written as itself with a `?` after it, and lint reports it as an error; with no
  bibliography at all keys are written as they are (`(key1; key2)`) and are not
  checked. The `add_citation` operation puts keys in a slide's footer citation, the
  element named `citations`, and makes one along the bottom margin if there is none.
- **`step-label`**: one run that stands for the field `stepLabel`, which
  whoever draws the slide fills in with the current step, in the wording of
  `present.stepLabel`. `format` changes only the sample shown while editing.
- **`embed`**: present mode shows the live page; everywhere else it is the
  `poster`, or a dashed panel with the `title` (or the site's name) and the
  address. Every part links to `url`. Only `http` and `https` addresses are links.
- **`video`**: present mode plays `src`; everywhere else it is the `poster`, or a
  dark panel with the file's name, and a play button. A `src` that is a web
  address is also the link of every part.

The `poster` of an `embed` or a `video` is a picture with `"fit": "cover"`, so a
still that is not the shape of the box fills it without being stretched, on the
slide and in PowerPoint alike. The words on a panel without a poster are set at
14 points or more wherever the box has room for them.

### Steps follow content

A code block with three `focus` entries needs three steps. The operations that
change what is on a slide (`add_elements`, `patch_elements`, `paste_elements`
and `duplicate_elements`) raise the slide's `steps` to what its composites need,
up to the 50 a slide can have, and never lower them.

### Ungroup to shapes

`expand_composite { slide, id }` replaces a composite by a group of its parts,
in the same place in the stack. The group keeps the composite's id, name, alt
text, steps and link, and the parts are `<id>.<n>` unless something on the slide
already has that id. What made it a composite (the code, the messages, the cards)
is gone from the deck, so use it when the shapes need editing one by one. It is
one step of undo, and it is refused for anything that is not a composite and for
`math`: a formula is drawn as a picture made from its LaTeX, so there are no
shapes to make (change its `latex`, or replace it with a text box).

### Sections

A section is a named stretch of the deck. `sections` lists them, each with a
`title` and the slide it `startsAt`; it lasts up to the slide before the next
section, and slides before the first one are in none. `add_section { at, title }`
starts one at a slide (refused if one already starts there), `rename_section
{ at, title }` renames it and `remove_section { at }` takes its header away; the
slides are never touched, and each is one step of undo. When the slide a section
starts at is deleted, the section starts at the next slide that stays. `move_slides`
does the same when that slide is moved without the rest of the section, and
takes the section along when all of its slides move.

## Importing a PowerPoint file

`slides import deck.pptx -o deck.deck` (and the editor's *Import slides from
PowerPoint…*) reads a file from PowerPoint, LibreOffice, Keynote, Google Slides
or python-pptx into a deck: text with its runs and lists, shapes and lines,
connectors that name what they join, pictures with their crop and mask, groups,
tables (with the fills their style gives), notes, hidden slides, sections, and
the theme, layouts and master. What a deck cannot hold becomes a `raw` element,
and everything else that was changed or left out is listed in the report, which
names the slide. A file this crate exports imports as the deck it was made from,
to within half a unit. The slides can be added to a deck (in its own look),
replace it, or come in as a new version of it: an export puts `[kasten <slide id>]`
last in each slide's notes (`markers` in the export options), and a new version is
matched to the deck by those, so slides, boxes and words that are still in the file
keep their ids. Slides that only differ by a box or two (a build made by copying)
can be collapsed into one slide with steps, when asked (`collapse_slides`); nothing
is collapsed on its own.

## Changing a deck

Every change is an operation, defined once with a typed input: `add_slide`,
`transform_elements`, `set_text`, and the rest (`slides ops` lists them). The
editor, the `slides` command and agents all use the same ones, and every
operation can be undone exactly.

## Format changes

- **1**: the first version.
