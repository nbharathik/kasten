//! Sources and highlights through the engine: a
//! PDF imported into `sources/` with its sidecar in one commit, and each
//! highlight added, changed or removed as a commit. Highlight cards are in
//! highlight_cards.rs.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::time::UNIX_EPOCH;

use super::{Change, Kasten};
use crate::atomic::write_atomic;
use crate::error::{Error, Result};
use crate::history::Actor;
use crate::id::ulid_at;
use crate::slug::slugify;
use crate::sources::{
    Highlight, HighlightEdit, MAX_SOURCE_BYTES, NewHighlight, Sidecar, SourceHighlights,
    SourceInfo, shortened, sidecar_of,
};
use crate::time::Instant;
use crate::vault::Vault;

const SIDECAR: [&str; 1] = [".highlights.json"];

/// The name a PDF is kept under (its stem as a slug) and the title it
/// keeps (its stem as given).
fn source_name(name: &str) -> Result<(String, String)> {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name).trim();
    let refuse = |why: &str| Error::Invalid(format!("Cannot import “{base}”: {why}"));
    let (stem, ext) = base
        .rsplit_once('.')
        .filter(|(stem, _)| !slugify(stem).is_empty())
        .ok_or_else(|| refuse("a source is a PDF with a name, such as paper.pdf"))?;
    if !ext.eq_ignore_ascii_case("pdf") {
        return Err(refuse("only PDFs can be sources"));
    }
    Ok((slugify(stem), stem.trim().to_owned()))
}

/// Whether `bytes` start as a PDF does: readers accept the header anywhere
/// in the first kilobyte.
fn is_pdf(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(1024)]
        .windows(5)
        .any(|w| w == b"%PDF-")
}

fn millis(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

/// The file name's stem, as a source's title when its sidecar has none.
pub(super) fn stem(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

/// The sidecar of `source`, if it has one.
pub(super) fn read_sidecar(vault: &Vault, source: &str) -> Result<Option<Sidecar>> {
    let path = vault.file_of(&sidecar_of(source)?, &SIDECAR)?;
    match fs::read_to_string(path) {
        Ok(text) => Sidecar::parse(&text).map(Some),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.into()),
    }
}

pub(super) fn write_sidecar(vault: &Vault, source: &str, sidecar: &Sidecar) -> Result<String> {
    let rel = sidecar_of(source)?;
    write_atomic(
        &vault.file_of(&rel, &SIDECAR)?,
        sidecar.to_text().as_bytes(),
    )?;
    Ok(rel)
}

/// The file of `source`, a PDF in `sources/` that exists; its extension in
/// any case, as the list of sources finds them.
fn source_file(vault: &Vault, source: &str) -> Result<std::path::PathBuf> {
    sidecar_of(source)?;
    let ext = &source[source.len() - ".pdf".len()..];
    let path = vault.file_of(source, &[ext])?;
    if !path.is_file() {
        return Err(Error::NotFound(source.to_owned()));
    }
    Ok(path)
}

/// Checks `source` is a PDF in `sources/` that exists.
pub(super) fn check_source(vault: &Vault, source: &str) -> Result<()> {
    source_file(vault, source).map(|_| ())
}

/// Every PDF under `dir`, as vault paths.
fn walk_pdfs(dir: &Path, prefix: &str, out: &mut Vec<(String, fs::Metadata)>) -> Result<()> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err.into()),
    };
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let rel = format!("{prefix}/{name}");
        let kind = entry.file_type()?;
        if kind.is_dir() {
            walk_pdfs(&entry.path(), &rel, out)?;
        } else if kind.is_file() && name.to_ascii_lowercase().ends_with(".pdf") {
            out.push((rel, entry.metadata()?));
        }
    }
    Ok(())
}

impl Kasten {
    /// Keeps the PDF `bytes` as `sources/<name>.pdf`, with an empty sidecar
    /// that remembers the name it came with, and returns its path. A PDF
    /// already there with the same bytes is reused without a commit.
    pub fn import_source(
        &self,
        actor: &Actor,
        name: &str,
        bytes: &[u8],
        now: Instant,
    ) -> Result<String> {
        let (slug, title) = source_name(name)?;
        let shown = name.rsplit(['/', '\\']).next().unwrap_or(name).trim();
        if bytes.is_empty() {
            return Err(Error::Invalid(format!("“{shown}” is empty")));
        }
        if bytes.len() > MAX_SOURCE_BYTES {
            return Err(Error::Invalid(format!(
                "“{shown}” is over {} MB; keep big files outside the vault",
                MAX_SOURCE_BYTES / 1024 / 1024
            )));
        }
        if !is_pdf(bytes) {
            return Err(Error::Invalid(format!("“{shown}” is not a PDF")));
        }
        self.apply(actor, "import_source", false, now.millis, |vault| {
            fs::create_dir_all(vault.root().join("sources"))?;
            for n in 1.. {
                let file = if n == 1 {
                    format!("{slug}.pdf")
                } else {
                    format!("{slug}-{n}.pdf")
                };
                let rel = format!("sources/{file}");
                let path = vault.file_of(&rel, &[".pdf"])?;
                match fs::read(&path) {
                    Ok(existing) if existing == bytes => {
                        return Ok(Change {
                            message: String::new(),
                            paths: vec![],
                            value: rel,
                        });
                    }
                    Ok(_) => continue,
                    Err(err) if err.kind() == ErrorKind::NotFound => {
                        // A sidecar left without its PDF keeps its name.
                        if vault.file_of(&sidecar_of(&rel)?, &SIDECAR)?.exists() {
                            continue;
                        }
                        write_atomic(&path, bytes)?;
                        let car = write_sidecar(vault, &rel, &Sidecar::new(&title))?;
                        return Ok(Change {
                            message: format!("source: {file}"),
                            paths: vec![rel.clone(), car],
                            value: rel,
                        });
                    }
                    Err(err) => return Err(err.into()),
                }
            }
            unreachable!("names run out only after usize::MAX files")
        })
    }

    /// Every PDF in `sources/`, by title.
    pub fn sources(&self) -> Result<Vec<SourceInfo>> {
        let mut found = Vec::new();
        walk_pdfs(&self.vault.root().join("sources"), "sources", &mut found)?;
        let mut out = Vec::with_capacity(found.len());
        for (path, meta) in found {
            // A sidecar that cannot be read still leaves its PDF listed.
            let sidecar = read_sidecar(&self.vault, &path).ok().flatten();
            out.push(SourceInfo {
                title: sidecar
                    .as_ref()
                    .and_then(Sidecar::title)
                    .unwrap_or_else(|| stem(&path))
                    .to_owned(),
                highlights: sidecar.map_or(0, |car| car.highlights().len()),
                bytes: meta.len(),
                modified: millis(&meta),
                path,
            });
        }
        // By title, then by name without `.pdf`, so `x` comes before `x-2`.
        let key = |s: &SourceInfo| {
            (
                s.title.to_lowercase(),
                s.path[..s.path.len() - 4].to_owned(),
            )
        };
        out.sort_by_key(key);
        Ok(out)
    }

    /// A source's bytes, for the reader.
    pub fn read_source(&self, source: &str) -> Result<Vec<u8>> {
        Ok(fs::read(source_file(&self.vault, source)?)?)
    }

    /// Each highlight's card path, where its card exists.
    fn with_cards(&self, mut highlights: Vec<Highlight>) -> Result<Vec<Highlight>> {
        for h in &mut highlights {
            h.card = match &h.card_id {
                Some(id) => self.path_of_id(id)?,
                None => None,
            };
        }
        Ok(highlights)
    }

    /// A source's highlights, in the order they were made.
    pub fn highlights(&self, source: &str) -> Result<Vec<Highlight>> {
        check_source(&self.vault, source)?;
        let highlights =
            read_sidecar(&self.vault, source)?.map_or_else(Vec::new, |car| car.highlights());
        self.with_cards(highlights)
    }

    /// Every source with its highlights, for the Highlights view.
    pub fn all_highlights(&self) -> Result<Vec<SourceHighlights>> {
        let mut out = Vec::new();
        for source in self.sources()? {
            let highlights = read_sidecar(&self.vault, &source.path)
                .ok()
                .flatten()
                .map_or_else(Vec::new, |car| car.highlights());
            out.push(SourceHighlights {
                highlights: self.with_cards(highlights)?,
                source,
            });
        }
        Ok(out)
    }

    /// Changes `source`'s sidecar in one commit: `change` edits it and says
    /// what it did, in words for the commit message.
    fn edit_sidecar<T>(
        &self,
        actor: &Actor,
        op: &str,
        source: &str,
        now: Instant,
        change: impl FnOnce(&mut Sidecar, &str) -> Result<(T, String)>,
    ) -> Result<T> {
        self.apply(actor, op, false, now.millis, |vault| {
            check_source(vault, source)?;
            let mut sidecar =
                read_sidecar(vault, source)?.unwrap_or_else(|| Sidecar::new(stem(source)));
            let title = sidecar.title().unwrap_or_else(|| stem(source)).to_owned();
            let (value, what) = change(&mut sidecar, &title)?;
            let path = write_sidecar(vault, source, &sidecar)?;
            Ok(Change {
                message: format!("highlight: {what}"),
                paths: vec![path],
                value,
            })
        })
    }

    pub fn add_highlight(
        &self,
        actor: &Actor,
        source: &str,
        new: &NewHighlight,
        now: Instant,
    ) -> Result<Highlight> {
        new.check()?;
        self.edit_sidecar(actor, "add_highlight", source, now, |car, title| {
            let added = car.add(&ulid_at(now.millis), new, &now.rfc3339())?;
            let what = format!("“{}” in {title}", shortened(&new.text, 60, 50));
            Ok((added, what))
        })
    }

    pub fn edit_highlight(
        &self,
        actor: &Actor,
        source: &str,
        id: &str,
        edit: &HighlightEdit,
        now: Instant,
    ) -> Result<Highlight> {
        let edited = self.edit_sidecar(actor, "edit_highlight", source, now, |car, title| {
            Ok((car.edit(id, edit)?, format!("edit in {title}")))
        })?;
        Ok(self.with_cards(vec![edited])?.remove(0))
    }

    /// Takes a highlight out of its source; a card made from it stays.
    pub fn remove_highlight(
        &self,
        actor: &Actor,
        source: &str,
        id: &str,
        now: Instant,
    ) -> Result<()> {
        self.edit_sidecar(actor, "remove_highlight", source, now, |car, title| {
            car.remove(id)?;
            Ok(((), format!("remove from {title}")))
        })
    }
}
