//! `slides lint <deck> [--json]`: the problems in a deck, each with where it
//! is and how to fix it. The exit status is 1 when there are errors.
//!
//! Whether text fits its box is judged from its measured size: the words are
//! laid out by Chrome or Chromium when the machine has one (`drawn::measured`),
//! and estimated from the words when it has not, or with `--estimate`.

use std::path::Path;

use serde_json::json;
use slides_core::lint::{Options, Severity, View, lint_deck_with, to_text};

use crate::args::Args;
use crate::commands::Failure;
use crate::{deckfile, refs};

pub fn run(args: &Args) -> Result<(), Failure> {
    let path = Path::new(
        args.positional
            .get(1)
            .ok_or_else(|| Failure::Usage("missing a deck file".to_owned()))?,
    );
    let deck = deckfile::read(path)?;
    let measured = crate::drawn::measured(args, path, &deck);
    let measures = &measured.measures;
    let refs = refs::beside(path);
    let report = lint_deck_with(
        &deck,
        &Options {
            measures: Some(measures),
            refs: refs.as_ref(),
        },
    );
    let name = path.file_name().map_or_else(
        || path.display().to_string(),
        |n| n.to_string_lossy().into_owned(),
    );
    if args.has("json") {
        let out = json!({
            "deck": name,
            "errors": report.count(Severity::Error),
            "warnings": report.count(Severity::Warning),
            "info": report.count(Severity::Info),
            "issues": report.issues,
            "skipped": report.skipped,
            "measuredWith": measured.with,
            "note": measured.note,
        });
        println!(
            "{}",
            serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?
        );
    } else {
        let view = View {
            name: &name,
            least: Severity::Info,
            slide: None,
            most: usize::MAX,
        };
        println!("{}", to_text(&report, &view));
        if let Some(note) = &measured.note {
            eprintln!("note: {note}");
        }
    }
    let errors = report.count(Severity::Error);
    if errors > 0 {
        return Err(Failure::Error(format!(
            "{name} has {errors} error{}",
            if errors == 1 { "" } else { "s" }
        )));
    }
    Ok(())
}
