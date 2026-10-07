//! `slides import <file.pptx> -o <deck> [--assets DIR] [--previews]`: a PowerPoint file
//! as a deck. The pictures go into `assets/` under the assets folder, which is the
//! deck's own folder unless `--assets` names another. What the import could not
//! do exactly is listed on the standard error stream.

use std::fs;
use std::path::{Path, PathBuf};

use slides_pptx::import::{ImportOptions, import};

mod previews;

use crate::args::Args;
use crate::commands::Failure;
use crate::deckfile;

/// The file to read and the deck to write.
fn paths(args: &Args) -> Result<(PathBuf, PathBuf), Failure> {
    let words = &args.positional[1..];
    let mut file = None;
    let mut out = args.value("output").map(PathBuf::from);
    let mut i = 0;
    while i < words.len() {
        if words[i] == "-o" {
            out = Some(PathBuf::from(words.get(i + 1).ok_or_else(|| {
                Failure::Usage("-o needs a file name".to_owned())
            })?));
            i += 2;
        } else {
            if file.replace(PathBuf::from(&words[i])).is_some() {
                return Err(Failure::Usage("import takes one file".to_owned()));
            }
            i += 1;
        }
    }
    let file =
        file.ok_or_else(|| Failure::Usage("missing the PowerPoint file to import".to_owned()))?;
    let out = out.unwrap_or_else(|| file.with_extension("deck"));
    Ok((file, out))
}

/// Writes a file whole or not at all, never over one that holds something else.
fn write_picture(root: &Path, relative: &str, bytes: &[u8]) -> Result<(), String> {
    let path = root.join(relative);
    if let Ok(existing) = fs::read(&path) {
        return if existing == bytes {
            Ok(())
        } else {
            Err(format!(
                "{} already holds a different picture",
                path.display()
            ))
        };
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("cannot make {}: {e}", dir.display()))?;
    }
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
    fs::write(&temporary, bytes)
        .map_err(|e| format!("cannot write {}: {e}", temporary.display()))?;
    fs::rename(&temporary, &path).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

pub fn run(args: &Args) -> Result<(), Failure> {
    let (file, out) = paths(args)?;
    let bytes = fs::read(&file)
        .map_err(|e| Failure::Error(format!("cannot read {}: {e}", file.display())))?;
    let title = file
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty());
    let mut imported = import(
        &bytes,
        &ImportOptions {
            seed: deckfile::seed(),
            name: title,
            ..ImportOptions::default()
        },
    )
    .map_err(|e| Failure::Error(format!("{}: {e}", file.display())))?;

    if args.has("previews") {
        match previews::add(&mut imported.deck, &bytes) {
            Ok((pictures, missed)) => {
                imported.media.extend(pictures);
                if missed > 0 {
                    eprintln!("warning: {missed} kept objects got no picture and show as boxes");
                }
            }
            Err(why) => eprintln!("warning: no pictures of the kept objects were made: {why}"),
        }
    }

    let root = match args.value("assets") {
        Some(dir) => PathBuf::from(dir),
        None => out
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .map_or_else(|| PathBuf::from("."), Path::to_path_buf),
    };
    for picture in &imported.media {
        write_picture(&root, &picture.path, &picture.bytes).map_err(Failure::Error)?;
    }
    deckfile::write(&out, &imported.deck)?;

    let report = &imported.report;
    let place = |id: &str| imported.deck.index_of(id).map(|i| i + 1);
    for warning in &report.warnings {
        eprintln!(
            "warning: {}{}{}",
            warning
                .slide
                .as_deref()
                .and_then(place)
                .map(|n| format!("slide {n}: "))
                .unwrap_or_default(),
            warning
                .element
                .as_deref()
                .map(|e| format!("element {e}: "))
                .unwrap_or_default(),
            warning.message
        );
    }
    println!(
        "Wrote {} ({} slides{}, {} pictures, {} kept as they were, {} warnings)",
        out.display(),
        report.slides,
        if report.hidden > 0 {
            format!(", {} hidden", report.hidden)
        } else {
            String::new()
        },
        report.pictures,
        report.raw.len(),
        report.warnings.len()
    );
    Ok(())
}
