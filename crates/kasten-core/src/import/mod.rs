//! Moving notes in from other tools. An import reads a folder, works out
//! everything it will
//! write (`plan_import` shows that without writing), then writes it all as
//! one commit into a project of its own, so `undo_commit` takes it back.
//!
//! - An Obsidian vault, or any folder of Markdown: folders become a page
//!   tree, daily notes journal days, canvases boards; attachments go to
//!   `assets/`, PDFs to `sources/`.
//! - A Notion export (Markdown & CSV, unzipped): pages and sub-pages, with
//!   databases as tags whose schemas hold their columns.
//! - A Heptabase backup (`All-Data.json`): cards, whiteboards with their
//!   cards where they were, and journal days.

mod apply;
mod canvas;
mod csv;
mod days;
mod files;
mod front;
mod heptabase;
mod markdown;
mod notion;
mod notion_body;
mod notion_db;
mod obsidian;
mod plan;
mod prosemirror;
mod resolve;
mod walk;

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::engine::{Change, Kasten};
use crate::error::{Error, Result};
use crate::history::Actor;
use crate::slug::slugify;
use crate::time::Instant;

pub(crate) use markdown::{link_path, without_title};
pub(crate) use plan::clean_title;

/// Where the notes come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportKind {
    Obsidian,
    Markdown,
    Notion,
    Heptabase,
}

impl ImportKind {
    /// "Obsidian vault", for messages.
    pub fn label(self) -> &'static str {
        match self {
            ImportKind::Obsidian => "Obsidian vault",
            ImportKind::Markdown => "Markdown folder",
            ImportKind::Notion => "Notion export",
            ImportKind::Heptabase => "Heptabase backup",
        }
    }

    /// The project's title when the folder's name will not do.
    fn default_project(self) -> &'static str {
        match self {
            ImportKind::Obsidian => "Obsidian",
            ImportKind::Markdown => "Imported notes",
            ImportKind::Notion => "Notion",
            ImportKind::Heptabase => "Heptabase",
        }
    }

    /// "an Obsidian vault", in a sentence.
    fn with_article(self) -> String {
        let label = self.label();
        let article = if label.starts_with(['A', 'E', 'I', 'O', 'U']) {
            "an"
        } else {
            "a"
        };
        format!("{article} {label}")
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOptions {
    /// What the folder is; found from its files when not given.
    #[serde(default)]
    pub kind: Option<ImportKind>,
    /// The new project's title; the folder's name when not given.
    #[serde(default)]
    pub project: Option<String>,
}

/// What an import writes, as counts, before or after.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub kind: ImportKind,
    /// The new project's title and page.
    pub project: String,
    pub project_path: String,
    /// Pages and cards.
    pub notes: usize,
    /// Journal days made, and days already here that get the imported ones added.
    pub days: usize,
    pub days_appended: usize,
    pub boards: usize,
    /// Attachments and PDFs.
    pub files: usize,
    /// Tag schemas, from Notion databases.
    pub tags: usize,
    /// What did not come across as it was, in sentences.
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub summary: ImportSummary,
    /// The import's commit, for undoing it; none in a vault without history.
    pub commit: Option<String>,
}

/// A folder name a program made, not a person: Notion's `Export-…`, or
/// one with a long run of hex digits (an id).
fn machine_made(name: &str) -> bool {
    let longest = name
        .split(|c: char| !c.is_ascii_hexdigit())
        .map(str::len)
        .max()
        .unwrap_or(0);
    name.starts_with("Export-") || longest >= 12
}

impl Kasten {
    /// What importing `source` would write, without writing anything.
    pub fn plan_import(
        &self,
        source: &Path,
        options: &ImportOptions,
        now: Instant,
    ) -> Result<ImportSummary> {
        Ok(self.make_plan(source, options, now)?.summary())
    }

    /// Imports `source` into a new project, as one commit.
    pub fn import(
        &self,
        actor: &Actor,
        source: &Path,
        options: &ImportOptions,
        now: Instant,
    ) -> Result<Imported> {
        let plan = self.make_plan(source, options, now)?;
        let summary = plan.summary();
        let message = plan.message();
        let ((), commit) =
            self.apply_committing(actor, "import", false, now.millis, &[], |vault| {
                let paths = apply::write(vault, &plan, now)?;
                Ok(Change {
                    value: (),
                    paths,
                    message,
                })
            })?;
        Ok(Imported { summary, commit })
    }

    fn make_plan(
        &self,
        source: &Path,
        options: &ImportOptions,
        now: Instant,
    ) -> Result<plan::Plan> {
        let root = walk::check_source(self.root(), source)?;
        let files = walk::walk(&root)?;
        if files.is_empty() {
            return Err(Error::Invalid(format!(
                "Nothing to import in {}: it has no notes or files",
                root.display()
            )));
        }
        let kind = options.kind.unwrap_or_else(|| walk::detect(&root, &files));
        let folder_name = root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .filter(|n| !machine_made(n))
            .unwrap_or_else(|| kind.default_project().to_owned());
        let project = options
            .project
            .as_deref()
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map_or(folder_name, str::to_owned);
        let slug = self.free_project_slug(&slugify(&project));
        let index = self.index();
        let id_taken = |id: &str| index.by_id(id).ok().flatten().is_some();
        let ctx = plan::Context {
            vault: self.vault(),
            root: &root,
            kind,
            project,
            slug,
            now,
            id_taken: &id_taken,
        };
        match kind {
            ImportKind::Obsidian | ImportKind::Markdown => obsidian::plan(&ctx, &files),
            ImportKind::Notion => notion::plan(&ctx, &files),
            ImportKind::Heptabase => heptabase::plan(&ctx),
        }
    }

    /// A project folder name free both in `projects/` and in `assets/`.
    fn free_project_slug(&self, base: &str) -> String {
        let root = self.root();
        let free = |slug: &str| {
            !root.join("projects").join(slug).exists() && !root.join("assets").join(slug).exists()
        };
        (1..)
            .map(|n| {
                if n == 1 {
                    base.to_owned()
                } else {
                    format!("{base}-{n}")
                }
            })
            .find(|slug| free(slug))
            .expect("some name is free")
    }
}
