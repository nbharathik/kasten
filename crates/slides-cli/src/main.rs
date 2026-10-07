//! The `slides` command: decks from the command line.

mod args;
mod commands;
mod deckfile;
mod dev;
mod drawn;
mod export;
mod import;
mod lint;
mod mcp;
mod refs;

use args::Args;

const HELP: &str = "slides: decks from the command line

Usage: slides <command> [arguments]

Commands:
  new <deck> [--title T] [--theme NAME]   make a deck with a title slide
  info <deck>                             the deck and its slides, in brief
  outline <deck>                          the deck as a Markdown outline
  ops [NAME] [--json]                     list the operations, or describe one
  op <deck> <NAME> [JSON]                 apply an operation (JSON, or - for stdin) and save
  validate <deck>                         check a deck against the format
  fmt <deck>                              rewrite a deck in the canonical form
  export <deck> -o <out.pptx> [--assets DIR] [--steps expand|final]
                                          write the deck as an editable PowerPoint file; a
                                          slide with steps is a slide for each state, or
                                          with --steps final only the last one
  export <deck> -o <out.pdf|out.png|out.html> [--format F] [--assets DIR] [--steps final|each]
         [--notes] [--slide N] [--scale S]
                                          draw the deck with Chrome or Chromium: a PDF (a page
                                          to a slide, text kept as text; --notes for handouts),
                                          PNG pictures (--scale 1, 2 or 4; --slide N for one; a
                                          file for every slide otherwise) or one offline web
                                          page. --steps each adds a page or picture per step
  render <deck> [--slide N] [--step K] [--scale S] [--assets DIR] [-o out.png]
  render <deck> --grid [--columns C] [--assets DIR] [-o out.png]
                                          draw one slide (from 1) at a step, or every slide as a
                                          labelled thumbnail, as a PNG, with Chrome or Chromium
  import <file.pptx> -o <deck> [--assets DIR] [--previews]
                                          make a deck from a PowerPoint file; its pictures go
                                          to assets/ under DIR, and what could not be kept
                                          exactly is listed. --previews has LibreOffice draw
                                          a picture of each object kept as it was (a chart,
                                          a diagram), so the deck can show it
  lint <deck> [--json] [--estimate]       the problems in a deck (overlaps, text that does not
                                          fit, contrast ...); exits 1 if there are errors. Text
                                          is measured in Chrome or Chromium when there is one
                                          (--estimate never uses it)
  schema                                  the deck format as JSON Schema
  dev [FOLDER] [--port N] [--ui DIR]      edit the decks in a folder in your browser
  mcp [--folder DIR]                      serve the deck tools to an AI agent over stdio (MCP)

Options:
  -h, --help       this text
  -V, --version    the version
";

fn main() {
    let args = match Args::parse(std::env::args().skip(1)) {
        Ok(args) => args,
        Err(message) => fail(2, &message),
    };
    if args.has("version") {
        println!("slides {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    if args.has("help") || args.positional.is_empty() {
        print!("{HELP}");
        return;
    }
    match commands::run(&args) {
        Ok(()) => {}
        Err(commands::Failure::Usage(message)) => {
            fail(2, &format!("{message}; try `slides --help`"))
        }
        Err(commands::Failure::Error(message)) => fail(1, &message),
    }
}

fn fail(code: i32, message: &str) -> ! {
    eprintln!("slides: {message}");
    std::process::exit(code);
}
