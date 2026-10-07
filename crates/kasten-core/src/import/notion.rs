//! A Notion export (Markdown & CSV, unzipped) as a Kasten project. Notion
//! names every page and database `Title <32 hex digits>` and keeps a
//! page's sub-pages in a folder of the same name beside it:
//!
//! - pages keep their nesting as sub-pages (`parent`), titled by their
//!   first heading, without the ids;
//! - a database (`Title <id>.csv`, or `_all.csv`) becomes a tag with a
//!   schema of its columns, a page listing its rows, and a page per row
//!   tagged with it and holding the row's values as `props`;
//! - links, by relative path or `notion.so` address, become `[[links]]`;
//!   callouts (`<aside>`) become Kasten callouts.

use std::collections::HashMap;
use std::fs;

use super::csv;
use super::files::{pdf_plan, project_page};
use super::front::{Keys, with_keys};
use super::notion_body::page_body;
use super::notion_db::{self, Column};
use super::plan::{
    Context, Copied, MAX_FILE_BYTES, Names, Plan, Warn, Warnings, Written, clean_title, stamp,
    unique_titles,
};
use super::resolve::Resolver;
use super::walk::{SourceFile, notion_id};
use crate::error::Result;
use crate::frontmatter::split;
use crate::id::ulid_at;
use crate::slug::slugify;
use crate::tags::schema_yaml;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Role {
    Page,
    Database(usize),
    /// A database's row: the database, and the row in its CSV.
    Row(usize, usize),
}

struct Page<'a> {
    file: Option<&'a SourceFile>,
    text: String,
    notion: Option<String>,
    /// The folder the page is in, and the one its sub-pages are in.
    folder: String,
    children: String,
    wanted: String,
    role: Role,
    parent: Option<usize>,
    title: String,
    path: String,
    id: String,
}

struct Database {
    title: String,
    tag: String,
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
    columns: Vec<Column>,
    /// Where its row pages are.
    dir: String,
}

/// A file's name without Notion's id: `Trip abroad <id>` → `Trip abroad`.
fn bare(stem: &str) -> &str {
    let stem = stem.strip_suffix("_all").unwrap_or(stem);
    match notion_id(stem) {
        Some(_) => stem.rsplit_once(' ').map_or(stem, |(name, _)| name),
        None => stem,
    }
}

/// The first `# heading`, which Notion writes as the page's title.
fn heading(text: &str) -> Option<String> {
    let first = split(text).body.lines().find(|l| !l.trim().is_empty())?;
    first.strip_prefix("# ").map(|t| t.trim().to_owned())
}

pub(crate) fn plan(ctx: &Context, files: &[SourceFile]) -> Result<Plan> {
    let mut warnings = Warnings::default();
    let mut names = Names::default();
    let mut resolver = Resolver::default();
    let (mut pages, mut dbs, mut copies, mut pdfs) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let alls: Vec<&str> = files
        .iter()
        .filter(|f| f.stem().ends_with("_all"))
        .map(|f| f.rel.as_str())
        .collect();
    for f in files {
        if f.size > MAX_FILE_BYTES {
            warnings.add(Warn::TooBig, &f.rel);
            continue;
        }
        match f.ext().as_str() {
            "md" | "markdown" => match fs::read_to_string(&f.abs) {
                Ok(text) => pages.push(Page {
                    notion: notion_id(f.stem()).map(str::to_lowercase),
                    folder: f.folder().to_owned(),
                    children: join(f.folder(), f.stem()),
                    wanted: clean_title(
                        &heading(&text).unwrap_or_else(|| bare(f.stem()).to_owned()),
                    ),
                    file: Some(f),
                    text,
                    role: Role::Page,
                    parent: None,
                    title: String::new(),
                    path: String::new(),
                    id: String::new(),
                }),
                Err(_) => warnings.add(Warn::NotText, &f.rel),
            },
            "csv" => {
                // `X_all.csv` holds every row; `X.csv` only the view's.
                let all = format!("{}_all.csv", f.rel.trim_end_matches(".csv"));
                if !f.stem().ends_with("_all") && alls.contains(&all.as_str()) {
                    resolver.add_note(&f.rel, bare(f.stem()));
                    continue;
                }
                let Ok(text) = fs::read_to_string(&f.abs) else {
                    warnings.add(Warn::NotText, &f.rel);
                    continue;
                };
                let mut rows = csv::rows(&text);
                if rows.is_empty() {
                    continue;
                }
                let headers = rows.remove(0);
                let stem = f.stem().strip_suffix("_all").unwrap_or(f.stem());
                let title = clean_title(bare(stem));
                pages.push(Page {
                    file: None,
                    text: String::new(),
                    notion: notion_id(stem).map(str::to_lowercase),
                    folder: f.folder().to_owned(),
                    children: join(f.folder(), stem),
                    wanted: title.clone(),
                    role: Role::Database(dbs.len()),
                    parent: None,
                    title: String::new(),
                    path: String::new(),
                    id: String::new(),
                });
                dbs.push(Database {
                    tag: slugify(&title),
                    columns: notion_db::columns(&headers, &rows),
                    title,
                    headers,
                    rows,
                    dir: join(f.folder(), stem),
                });
            }
            "pdf" => {
                let pdf = pdf_plan(ctx, &mut names, f)?;
                resolver.add_file(&f.rel, &pdf.path);
                pdfs.push(pdf);
            }
            ext => {
                let dot = if ext.is_empty() {
                    String::new()
                } else {
                    format!(".{ext}")
                };
                let path = names.free(ctx.vault, &format!("assets/{}", ctx.slug), f.stem(), &dot);
                resolver.add_file(&f.rel, &path);
                copies.push(Copied {
                    path,
                    from: f.abs.clone(),
                });
            }
        }
    }
    rows_as_pages(&mut pages, &dbs);

    // Parents: the page whose sub-page folder a page is in.
    let by_children: HashMap<String, usize> = pages
        .iter()
        .enumerate()
        .map(|(i, p)| (p.children.to_lowercase(), i))
        .collect();
    let parents: Vec<Option<usize>> = pages
        .iter()
        .enumerate()
        .map(|(i, p)| {
            by_children
                .get(&p.folder.to_lowercase())
                .copied()
                .filter(|&x| x != i)
        })
        .collect();
    for (page, parent) in pages.iter_mut().zip(parents) {
        page.parent = parent;
    }
    let wanted: Vec<(String, String)> = pages
        .iter()
        .map(|p| {
            (
                p.wanted.clone(),
                p.parent
                    .map(|i| pages[i].wanted.clone())
                    .unwrap_or_default(),
            )
        })
        .collect();
    let titles = unique_titles(&wanted);
    let order = depth_order(&pages);
    for i in order {
        let dir = match pages[i].parent {
            Some(p) => pages[p].path.trim_end_matches(".md").to_owned(),
            None => format!("{}/pages", ctx.folder()),
        };
        pages[i].path = names.free(ctx.vault, &dir, &titles[i], ".md");
        pages[i].title = titles[i].clone();
        pages[i].id = ulid_at(ctx.now.millis);
    }
    let mut kasten_id: HashMap<String, String> = HashMap::new();
    for page in &pages {
        if let Some(f) = page.file {
            resolver.add_note(&f.rel, &page.title);
        }
        if let Some(id) = &page.notion {
            resolver.add_id(id, &page.title);
            kasten_id.insert(id.clone(), page.id.clone());
        }
        if let Role::Database(d) = page.role {
            let dir = &dbs[d].dir;
            resolver.add_note(&format!("{dir}.csv"), &page.title);
            resolver.add_note(&format!("{dir}_all.csv"), &page.title);
        }
    }

    let mut tags = Vec::new();
    for db in &dbs {
        let path = format!("tags/{}.yaml", db.tag);
        if ctx.vault.root().join(&path).exists() {
            warnings.add(Warn::TagKept, &db.tag);
        } else if let Ok(text) = schema_yaml(&db.tag, &notion_db::schema(&db.columns)) {
            tags.push(Written { path, text });
        }
    }
    let now = ctx.now.rfc3339();
    let mut written = vec![Written {
        path: String::new(),
        text: String::new(),
    }];
    for page in &pages {
        let parent = page.parent.map(|p| pages[p].id.as_str());
        let (body, row_tags, props) = match page.role {
            Role::Database(d) => {
                let db = &dbs[d];
                let rows: String = pages
                    .iter()
                    .filter(|p| matches!(p.role, Role::Row(r, _) if r == d))
                    .map(|p| format!("- [[{}]]\n", p.title))
                    .collect();
                let intro = format!(
                    "The {} database: each row is a page tagged {}.\n\n",
                    db.title, db.tag
                );
                (format!("{intro}{rows}"), Vec::new(), None)
            }
            Role::Row(d, r) => {
                let db = &dbs[d];
                let values =
                    notion_db::props(&db.columns, &db.rows[r], |id| kasten_id.get(id).cloned());
                let body = page_body(
                    page.file,
                    &page.text,
                    &page.wanted,
                    &page.path,
                    &db.headers,
                    &resolver,
                );
                (body, vec![db.tag.clone()], Some(values))
            }
            Role::Page => (
                page_body(
                    page.file,
                    &page.text,
                    &page.wanted,
                    &page.path,
                    &[],
                    &resolver,
                ),
                Vec::new(),
                None,
            ),
        };
        let time = page
            .file
            .map_or(now.clone(), |f| stamp(f.modified, ctx.now));
        let keys = Keys {
            id: &page.id,
            title: &page.title,
            kind: "page",
            created: &time,
            updated: &time,
            tags: &row_tags,
            parent,
            props: props.as_ref(),
        };
        let source = page.file.map_or(page.wanted.as_str(), |f| f.rel.as_str());
        let text = with_keys(&page.text, &body, &keys, source, &mut warnings);
        written.push(Written {
            path: page.path.clone(),
            text,
        });
    }
    let mut plan = Plan {
        kind: ctx.kind,
        project: ctx.project.clone(),
        folder: ctx.folder(),
        notes: written,
        days: Vec::new(),
        boards: Vec::new(),
        tags,
        copies,
        pdfs,
        warnings,
    };
    plan.notes[0] = project_page(ctx, &plan.counts());
    Ok(plan)
}

fn join(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        name.to_owned()
    } else {
        format!("{folder}/{name}")
    }
}

/// Each database row a page: its Markdown if the export has one (matched
/// by title, in order), else a page of its own.
fn rows_as_pages(pages: &mut Vec<Page>, dbs: &[Database]) {
    for (d, db) in dbs.iter().enumerate() {
        for (r, row) in db.rows.iter().enumerate() {
            let name = clean_title(row.first().map_or("", |n| n.trim()));
            let found = pages.iter().position(|p| {
                p.role == Role::Page
                    && p.file.is_some()
                    && p.folder == db.dir
                    && p.wanted.to_lowercase() == name.to_lowercase()
            });
            match found {
                Some(i) => pages[i].role = Role::Row(d, r),
                None => pages.push(Page {
                    file: None,
                    text: String::new(),
                    notion: None,
                    folder: db.dir.clone(),
                    children: String::new(),
                    wanted: name,
                    role: Role::Row(d, r),
                    parent: None,
                    title: String::new(),
                    path: String::new(),
                    id: String::new(),
                }),
            }
        }
    }
}

/// Pages in an order where each comes after its parent.
fn depth_order(pages: &[Page]) -> Vec<usize> {
    let depth = |mut i: usize| {
        let mut n = 0;
        while let Some(p) = pages[i].parent {
            n += 1;
            i = p;
            if n > pages.len() {
                break;
            }
        }
        n
    };
    let mut order: Vec<usize> = (0..pages.len()).collect();
    order.sort_by_key(|&i| (depth(i), i));
    order
}
