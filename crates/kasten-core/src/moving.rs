//! Moving notes: into a project's `pages/` or `cards/`, or out to the
//! library. Sub-pages move with their parent; a sub-page moved on its own
//! leaves its parent and is a page of its own where it goes. Links keep
//! going where they went (links::keep). Also duplicating a note beside
//! itself.

use std::collections::HashSet;
use std::fs;

use crate::atomic::{create_atomic, write_atomic};
use crate::error::{Error, Result};
use crate::frontmatter::{join, set_key, split, still_readable};
use crate::id::ulid_at;
use crate::note::{NoteFile, NoteMeta};
use crate::ops::{folder_of, free_path, free_path_besides};
use crate::slug::slugify;
use crate::time::Instant;
use crate::vault::Vault;

/// The folder a note of `kind` goes to in `project`, or the library.
fn destination(vault: &Vault, kind: &str, project: Option<&str>) -> Result<String> {
    let Some(project) = project else {
        return Ok("library".to_owned());
    };
    if project.is_empty() || slugify(project) != project {
        return Err(Error::Invalid(format!("Not a project folder: {project}")));
    }
    if !vault.root().join("projects").join(project).is_dir() {
        return Err(Error::Invalid(format!("No project called {project}")));
    }
    let sub = if matches!(kind, "card" | "highlight") {
        "cards"
    } else {
        "pages"
    };
    Ok(format!("projects/{project}/{sub}"))
}

/// The note and every sub-page below it, parents first.
pub(crate) fn subtree(notes: &[NoteMeta], root: &NoteMeta) -> Vec<NoteMeta> {
    let mut out = vec![root.clone()];
    let mut i = 0;
    while i < out.len() {
        if let Some(id) = out[i].id.clone() {
            for note in notes {
                if note.parent.as_deref() == Some(id.as_str())
                    && !out.iter().any(|n| n.path == note.path)
                {
                    out.push(note.clone());
                }
            }
        }
        i += 1;
    }
    out
}

/// Moves the note at `rel`, and its sub-pages, into `project` (a folder
/// under `projects/`) or, with None, into the library. Returns the note.
pub fn move_note(vault: &Vault, rel: &str, project: Option<&str>) -> Result<NoteFile> {
    move_note_tracked(vault, rel, project).map(|(note, _)| note)
}

/// `move_note`, also returning every (from, to) move it made. Links keep
/// going where they went.
pub fn move_note_tracked(
    vault: &Vault,
    rel: &str,
    project: Option<&str>,
) -> Result<(NoteFile, Vec<(String, String)>)> {
    let notes = vault.notes()?;
    let (note, moves) = move_note_among(vault, rel, project, &notes)?;
    let everyone: Vec<String> = notes.iter().map(|n| n.path.clone()).collect();
    crate::links::keep::keep_after_moves(vault, &notes, &moves, &everyone)?;
    Ok((vault.read(&note.meta.path)?, moves))
}

/// `move_note_tracked` with every note's metadata given (say from the
/// index), so finding sub-pages does not read the whole vault.
pub fn move_note_among(
    vault: &Vault,
    rel: &str,
    project: Option<&str>,
    notes: &[NoteMeta],
) -> Result<(NoteFile, Vec<(String, String)>)> {
    let before = vault.read(rel)?.meta;
    let (note, moves) = file_note_among(vault, rel, project, notes)?;
    if note.meta.path != rel && parted(notes, &before, &note.meta.path) {
        leave_parent(vault, &note.meta.path)?;
        return Ok((vault.read(&note.meta.path)?, moves));
    }
    Ok((note, moves))
}

/// Moves the note at `rel`, and its sub-pages, into the inbox: what Undo
/// asks for after a card was filed out of it. A sub-page that goes on its
/// own leaves its parent, as with any move.
pub fn move_to_inbox_among(
    vault: &Vault,
    rel: &str,
    notes: &[NoteMeta],
) -> Result<(NoteFile, Vec<(String, String)>)> {
    let before = vault.read(rel)?.meta;
    let (note, moves) = file_into(vault, rel, notes, &|_| Ok("inbox".to_owned()))?;
    if note.meta.path != rel && parted(notes, &before, &note.meta.path) {
        leave_parent(vault, &note.meta.path)?;
        return Ok((vault.read(&note.meta.path)?, moves));
    }
    Ok((note, moves))
}

/// Files the note at `rel`, and its sub-pages, where their kind lives in
/// `project` (or the library), parents and all: a converted note goes to
/// its new kind's folder and stays under its parent.
pub fn file_note_among(
    vault: &Vault,
    rel: &str,
    project: Option<&str>,
    notes: &[NoteMeta],
) -> Result<(NoteFile, Vec<(String, String)>)> {
    file_into(vault, rel, notes, &|kind| destination(vault, kind, project))
}

/// Files the note at `rel`, and its sub-pages, in the folder `dir` gives
/// for each one's kind.
fn file_into(
    vault: &Vault,
    rel: &str,
    notes: &[NoteMeta],
    dir: &dyn Fn(&str) -> Result<String>,
) -> Result<(NoteFile, Vec<(String, String)>)> {
    let note = vault.read(rel)?;
    let kind = note.meta.kind.as_str();
    // Journal days, projects and saved chats live where their folder says.
    if matches!(kind, "journal" | "project" | "template" | "chat")
        || crate::vault::in_templates(rel)
    {
        return Err(Error::Invalid(format!("A {kind} note cannot move")));
    }
    // Every check first, so a refusal moves nothing.
    let mut plan = Vec::new();
    let mut planned = HashSet::new();
    for item in subtree(notes, &note.meta) {
        if matches!(
            item.kind.as_str(),
            "journal" | "project" | "template" | "chat"
        ) {
            continue;
        }
        let dir = dir(&item.kind)?;
        if folder_of(&item.path) == dir {
            continue;
        }
        let name = item.path.rsplit('/').next().unwrap_or(&item.path);
        let target = free_path_besides(vault, &dir, name.trim_end_matches(".md"), &planned);
        let files = (vault.path_of(&item.path)?, vault.path_of(&target)?);
        planned.insert(target.clone());
        plan.push((item.path.clone(), target, files));
    }
    // Then the moves: one that fails puts back those made before it.
    for (done, (_, _, (from, to))) in plan.iter().enumerate() {
        let moved = to
            .parent()
            .map_or(Ok(()), fs::create_dir_all)
            .and_then(|()| fs::rename(from, to));
        if let Err(err) = moved {
            for (_, _, (from, to)) in plan[..done].iter().rev() {
                let _ = fs::rename(to, from);
            }
            return Err(err.into());
        }
    }
    let root_path = plan
        .iter()
        .find(|(from, _, _)| from == rel)
        .map_or(rel, |(_, to, _)| to.as_str());
    let note = vault.read(root_path)?;
    Ok((
        note,
        plan.into_iter().map(|(from, to, _)| (from, to)).collect(),
    ))
}

/// Whether a moved sub-page, now at `to`, has left its parent behind: the
/// parent is in the vault and in another folder.
fn parted(notes: &[NoteMeta], moved: &NoteMeta, to: &str) -> bool {
    let Some(id) = moved.parent.as_deref() else {
        return false;
    };
    notes
        .iter()
        .find(|n| n.id.as_deref() == Some(id) && n.path != moved.path)
        .is_some_and(|parent| folder_of(&parent.path) != folder_of(to))
}

/// Takes the `parent` key out of the note at `rel`; every other byte stays.
fn leave_parent(vault: &Vault, rel: &str) -> Result<()> {
    set_parent(vault, rel, None)
}

/// Sets the note's `parent` key to `id`, or takes it out; every other byte
/// stays.
fn set_parent(vault: &Vault, rel: &str, id: Option<&str>) -> Result<()> {
    let path = vault.path_of(rel)?;
    let text = fs::read_to_string(&path)?;
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let parts = split(&text);
    let prefix = set_key(parts.prefix, "parent", id, eol);
    still_readable(parts.prefix, &prefix)?;
    write_atomic(&path, join(&prefix, parts.body, eol).as_bytes())?;
    Ok(())
}

/// Copies a page or card beside itself as "<title> (copy)" with a new id
/// and times; every other key and the body stay byte for byte.
pub fn duplicate_note(vault: &Vault, rel: &str, now: Instant) -> Result<NoteFile> {
    let note = vault.read(rel)?;
    let kind = note.meta.kind.as_str();
    if matches!(kind, "journal" | "project" | "template") || crate::vault::in_templates(rel) {
        return Err(Error::Invalid(format!(
            "A {kind} note cannot be duplicated"
        )));
    }
    let title = format!("{} (copy)", note.meta.title);
    let eol = if note.text.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let parts = split(&note.text);
    let stamp = now.rfc3339();
    let mut prefix = parts.prefix.to_owned();
    for (key, value) in [
        ("id", ulid_at(now.millis)),
        ("title", title.clone()),
        ("created", stamp.clone()),
        ("updated", stamp),
    ] {
        prefix = set_key(&prefix, key, Some(&value), eol);
    }
    let path = free_path(vault, folder_of(rel), &slugify(&title));
    create_atomic(
        &vault.path_of(&path)?,
        join(&prefix, parts.body, eol).as_bytes(),
    )?;
    vault.read(&path)
}

/// Puts the page at `rel` inside the page at `parent`, moving it (and its
/// sub-pages) to that page's project or the library; with None, makes it a
/// page of its own where it is. Links keep going where they went.
pub fn nest_note(vault: &Vault, rel: &str, parent: Option<&str>, now: Instant) -> Result<NoteFile> {
    let notes = vault.notes()?;
    let Nested { note, moves, .. } = nest_note_among(vault, rel, parent, &notes, now)?;
    let everyone: Vec<String> = notes.iter().map(|n| n.path.clone()).collect();
    crate::links::keep::keep_after_moves(vault, &notes, &moves, &everyone)?;
    vault.read(&note.meta.path)
}

/// What `nest_note_among` did: the note, the moves it made, and the
/// parent's path when the parent was given an id to be pointed at.
pub struct Nested {
    pub note: NoteFile,
    pub moves: Vec<(String, String)>,
    pub gave_id: Option<String>,
}

/// `nest_note` with every note's metadata given, before links are kept.
pub fn nest_note_among(
    vault: &Vault,
    rel: &str,
    parent: Option<&str>,
    notes: &[NoteMeta],
    now: Instant,
) -> Result<Nested> {
    let note = vault.read(rel)?;
    let kind = note.meta.kind.as_str();
    if !matches!(kind, "page" | "card") || crate::vault::in_templates(rel) {
        return Err(Error::Invalid(format!(
            "A {kind} note cannot go inside a page"
        )));
    }
    let Some(parent) = parent else {
        // Out of its page, where it is.
        if note.meta.parent.is_some() {
            set_parent(vault, rel, None)?;
        }
        return Ok(Nested {
            note: vault.read(rel)?,
            moves: Vec::new(),
            gave_id: None,
        });
    };
    let holder = vault.read(parent)?;
    if holder.meta.kind != "page" || crate::vault::in_templates(parent) {
        return Err(Error::Invalid("Only a page holds pages".to_owned()));
    }
    if subtree(notes, &note.meta).iter().any(|n| n.path == parent) || parent == rel {
        return Err(Error::Invalid(
            "A page cannot go inside itself or its own sub-page".to_owned(),
        ));
    }
    let gave_id = holder.meta.id.is_none().then(|| parent.to_owned());
    let id = crate::ops::ensure_id(vault, parent, now)?;
    let (moved, moves) = file_note_among(vault, rel, holder.meta.project.as_deref(), notes)?;
    set_parent(vault, &moved.meta.path, Some(&id))?;
    Ok(Nested {
        note: vault.read(&moved.meta.path)?,
        moves,
        gave_id,
    })
}
