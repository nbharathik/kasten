//! Where an import's files go: attachments to `assets/<project>/`, PDFs to
//! `sources/` (the same bytes already there are used again), and the
//! project's own page, which says where its notes came from.

use std::fs;

use super::plan::{Context, Names, Pdf, Written, project_body};
use super::walk::SourceFile;
use crate::error::Result;
use crate::frontmatter::set_key;
use crate::id::ulid_at;
use crate::slug::slugify;
use crate::sources::sidecar_of;

/// A PDF's place in `sources/`: the one with the same bytes, or a free name.
pub(crate) fn pdf_plan(ctx: &Context, names: &mut Names, f: &SourceFile) -> Result<Pdf> {
    let slug = slugify(f.stem());
    let mut bytes: Option<Vec<u8>> = None;
    for n in 1.. {
        let path = if n == 1 {
            format!("sources/{slug}.pdf")
        } else {
            format!("sources/{slug}-{n}.pdf")
        };
        let full = ctx.vault.root().join(&path);
        if full.exists() {
            let ours = match &bytes {
                Some(b) => b,
                None => bytes.insert(fs::read(&f.abs)?),
            };
            if fs::read(&full)? == *ours {
                return Ok(Pdf {
                    path,
                    from: f.abs.clone(),
                    title: f.stem().to_owned(),
                    reuse: true,
                });
            }
            continue;
        }
        let sidecar = ctx.vault.root().join(sidecar_of(&path)?);
        if sidecar.exists() || !names.claim(&path) {
            continue;
        }
        return Ok(Pdf {
            path,
            from: f.abs.clone(),
            title: f.stem().to_owned(),
            reuse: false,
        });
    }
    unreachable!("names run out only after usize::MAX files")
}

/// The project's page, saying where its notes came from.
pub(crate) fn project_page(ctx: &Context, counts: &[String]) -> Written {
    let now = ctx.now.rfc3339();
    let mut prefix = String::new();
    for (key, value) in [
        ("id", ulid_at(ctx.now.millis)),
        ("title", ctx.project.clone()),
        ("type", "project".to_owned()),
        ("created", now.clone()),
        ("updated", now.clone()),
    ] {
        prefix = set_key(&prefix, key, Some(&value), "\n");
    }
    Written {
        path: format!("{}/_project.md", ctx.folder()),
        text: format!("{prefix}{}", project_body(ctx.kind, &now[..10], counts)),
    }
}
