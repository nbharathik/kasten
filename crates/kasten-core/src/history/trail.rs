//! Walking history back from HEAD for agent marks: for each file asked
//! about, the commits that changed it, following renames, until the commit
//! that made it, one that accepted its agent lines, one the caller already
//! knows it at, or a limit. First parents only, so a merge's changes count
//! as the merge's.

use std::collections::HashMap;
use std::path::Path;

use git2::{Commit, Delta, DiffFindOptions, DiffOptions, ObjectType, Oid, Repository, Tree};

use super::log::{CommitInfo, info};
use super::{Actor, History};
use crate::error::Result;

/// The trailer that accepts a note's agent lines as they stand, naming it.
pub(crate) const ACCEPT: &str = "Kasten-Accept";

/// Up to this many files, each is looked up in every parent, stopping at
/// the first folder the two commits share; up to `PATHSPEC_MAX`, each
/// commit's diff is limited to their paths; past that one whole diff per
/// commit is cheaper than sorting the list for every diff.
const LOCKSTEP_MAX: usize = 16;
const PATHSPEC_MAX: usize = 64;

/// A file to walk back, and the commit whose state of it the caller already
/// knows: the walk stops there.
pub(crate) struct Want<'a> {
    pub path: &'a str,
    pub known: Option<&'a str>,
}

/// One commit that changed a file.
pub(crate) struct Step {
    pub commit: CommitInfo,
    /// The file's blob before it; None when the commit made the file.
    pub before: Option<Oid>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum End {
    /// The last step made the file, or HEAD does not have it.
    Created,
    /// A commit accepted the file's agent lines as they stood.
    Accepted,
    /// The walk reached the commit the caller knows the file at.
    Known,
    /// Too many commits or changes back.
    Cut,
}

pub(crate) struct Trail {
    /// The file's blob at HEAD.
    pub head: Option<Oid>,
    /// The commits that changed it, newest first.
    pub steps: Vec<Step>,
    pub end: End,
}

pub(crate) struct Walk {
    /// The commit the walk started from.
    pub head: String,
    /// One per want, in order.
    pub trails: Vec<Trail>,
}

fn blob_in(tree: &Tree, path: &str) -> Option<Oid> {
    tree.get_path(Path::new(path))
        .ok()
        .filter(|e| e.kind() == Some(ObjectType::Blob))
        .map(|e| e.id())
}

/// The blob at `path` in `parent`, and the folders on the way to it there.
/// `folders` are the ones on the way to it in the child, where its blob is
/// `blob`: a folder the two share means nothing under it changed.
fn blob_before(
    repo: &Repository,
    parent: &Tree,
    path: &str,
    folders: &[Oid],
    blob: Option<Oid>,
) -> (Option<Oid>, Vec<Oid>) {
    let parts: Vec<&str> = path.split('/').collect();
    let mut trees = Vec::with_capacity(parts.len());
    let mut tree = parent.clone();
    for (k, part) in parts.iter().enumerate() {
        let Some((id, kind)) = tree.get_name(part).map(|e| (e.id(), e.kind())) else {
            return (None, trees);
        };
        if k + 1 == parts.len() {
            return ((kind == Some(ObjectType::Blob)).then_some(id), trees);
        }
        if folders.get(k) == Some(&id) {
            trees.extend_from_slice(&folders[k..]);
            return (blob, trees);
        }
        trees.push(id);
        match repo.find_tree(id) {
            Ok(next) => tree = next,
            Err(_) => return (None, trees),
        }
    }
    (None, trees)
}

fn accepted(message: &str) -> impl Iterator<Item = &str> {
    super::log::trailer_lines(message).filter_map(|line| {
        line.strip_prefix(ACCEPT)
            .and_then(|rest| rest.strip_prefix(':'))
            .map(str::trim)
    })
}

fn limited<'a>(paths: impl Iterator<Item = &'a String>) -> DiffOptions {
    let mut options = DiffOptions::new();
    options.disable_pathspec_match(true);
    for path in paths {
        options.pathspec(path.as_str());
    }
    options
}

/// Where the files `tree`'s commit added came from, when it renamed them.
fn renamed_from(
    repo: &Repository,
    parent: Option<&Tree>,
    tree: &Tree,
) -> Result<HashMap<String, (String, Oid)>> {
    let mut diff = repo.diff_tree_to_tree(parent, Some(tree), None)?;
    diff.find_similar(Some(DiffFindOptions::new().renames(true)))?;
    Ok(diff
        .deltas()
        .filter(|d| d.status() == Delta::Renamed)
        .filter_map(|d| {
            let to = d.new_file().path()?.to_str()?.to_owned();
            let from = d.old_file().path()?.to_str()?.to_owned();
            Some((to, (from, d.old_file().id())))
        })
        .collect())
}

/// The files still followed, as they are in the commit looked at.
struct Live {
    by_path: HashMap<String, usize>,
    path: Vec<Option<String>>,
    blob: Vec<Option<Oid>>,
    /// The folders on the way to each file, and the commit they are in.
    folders: Vec<(Oid, Vec<Oid>)>,
    /// The paths a limited diff looks at, and how many there were.
    spec: Option<(DiffOptions, usize)>,
}

impl Live {
    fn stop(&mut self, i: usize) {
        if let Some(path) = self.path[i].take() {
            self.by_path.remove(&path);
        }
    }

    fn follow(&mut self, i: usize, path: String, blob: Option<Oid>) {
        self.stop(i);
        self.by_path.insert(path.clone(), i);
        self.path[i] = Some(path);
        self.blob[i] = blob;
        self.folders[i] = (Oid::ZERO_SHA1, Vec::new());
        self.spec = None;
    }

    /// The followed files the step from `parent` to `tree` (commit `id`)
    /// changed, each with its blob in `parent`, or None where the parent
    /// does not have it.
    fn changes(
        &mut self,
        repo: &Repository,
        id: Oid,
        parent: Option<(Oid, &Tree)>,
        tree: &Tree,
    ) -> Result<Vec<(usize, Option<Oid>)>> {
        let mut out = Vec::new();
        if self.by_path.len() <= LOCKSTEP_MAX {
            let files: Vec<(String, usize)> =
                self.by_path.iter().map(|(p, i)| (p.clone(), *i)).collect();
            for (path, i) in files {
                let Some((parent_id, parent)) = parent else {
                    out.push((i, None));
                    continue;
                };
                let known = &self.folders[i];
                let folders = if known.0 == id { &known.1[..] } else { &[] };
                let (before, trees) = blob_before(repo, parent, &path, folders, self.blob[i]);
                self.folders[i] = (parent_id, trees);
                if before != self.blob[i] {
                    out.push((i, before));
                }
            }
            return Ok(out);
        }
        let options = if self.by_path.len() > PATHSPEC_MAX {
            None
        } else {
            // Paths no longer followed only cost a little, until they are
            // most of the list.
            let n = self.by_path.len();
            if self.spec.as_ref().is_none_or(|(_, was)| n * 2 < *was) {
                self.spec = Some((limited(self.by_path.keys()), n));
            }
            self.spec.as_mut().map(|(o, _)| o)
        };
        let diff = repo.diff_tree_to_tree(parent.map(|p| p.1), Some(tree), options)?;
        for delta in diff.deltas() {
            let path = delta.new_file().path().and_then(|p| p.to_str());
            if let Some(&i) = path.and_then(|p| self.by_path.get(p)) {
                let before = delta.old_file().id();
                out.push((i, (delta.status() != Delta::Added).then_some(before)));
            }
        }
        Ok(out)
    }
}

impl History {
    /// Walks back from HEAD through at most `max_commits` commits, keeping at
    /// most `max_steps` changes per file. Paths must not repeat. None when
    /// there are no commits.
    pub(crate) fn trails(
        &self,
        wants: &[Want],
        max_commits: usize,
        max_steps: usize,
    ) -> Result<Option<Walk>> {
        let repo = self.repo();
        let Some(mut commit) = repo.head().ok().and_then(|h| h.peel_to_commit().ok()) else {
            return Ok(None);
        };
        let head = commit.id().to_string();
        let mut tree = commit.tree()?;
        let n = wants.len();
        let mut trails: Vec<Trail> = Vec::with_capacity(n);
        let mut live = Live {
            by_path: HashMap::new(),
            path: vec![None; n],
            blob: vec![None; n],
            folders: vec![(Oid::ZERO_SHA1, Vec::new()); n],
            spec: None,
        };
        let mut known: HashMap<Oid, Vec<usize>> = HashMap::new();
        for (i, want) in wants.iter().enumerate() {
            let blob = blob_in(&tree, want.path);
            trails.push(Trail {
                head: blob,
                steps: Vec::new(),
                end: End::Created,
            });
            if blob.is_some() {
                live.follow(i, want.path.to_owned(), blob);
                if let Some(id) = want.known.and_then(|k| Oid::from_str(k).ok()) {
                    known.entry(id).or_default().push(i);
                }
            }
        }
        let mut walked = 0;
        while !live.by_path.is_empty() {
            for i in known.remove(&commit.id()).unwrap_or_default() {
                if live.path[i].is_some() {
                    trails[i].end = End::Known;
                    live.stop(i);
                }
            }
            if let Some(message) = commit.message().ok().filter(|m| m.contains(ACCEPT)) {
                for path in accepted(message) {
                    if let Some(i) = live.by_path.get(path).copied() {
                        trails[i].end = End::Accepted;
                        live.stop(i);
                    }
                }
            }
            let parent: Option<Commit> = commit.parent(0).ok();
            let parent_tree = parent.as_ref().map(Commit::tree).transpose()?;
            let same_tree = parent_tree.as_ref().is_some_and(|p| p.id() == tree.id());
            if !live.by_path.is_empty() && !same_tree {
                let from = parent.as_ref().map(Commit::id).zip(parent_tree.as_ref());
                let mut changed = live.changes(&repo, commit.id(), from, &tree)?;
                let mut moved: Vec<(usize, String)> = Vec::new();
                if changed.iter().any(|(_, before)| before.is_none()) {
                    let renames = renamed_from(&repo, parent_tree.as_ref(), &tree)?;
                    for (i, before) in changed.iter_mut().filter(|(_, b)| b.is_none()) {
                        let found = live.path[*i].as_ref().and_then(|p| renames.get(p));
                        if let Some((from, id)) = found {
                            *before = Some(*id);
                            moved.push((*i, from.clone()));
                        }
                    }
                }
                if !changed.is_empty() {
                    let about = info(&commit);
                    for (i, before) in changed {
                        trails[i].steps.push(Step {
                            commit: about.clone(),
                            before,
                        });
                        live.blob[i] = before;
                        if before.is_none() {
                            trails[i].end = End::Created;
                            live.stop(i);
                        } else if trails[i].steps.len() >= max_steps {
                            trails[i].end = End::Cut;
                            live.stop(i);
                        }
                    }
                }
                for (i, from) in moved {
                    if live.path[i].is_some() {
                        live.follow(i, from, live.blob[i]);
                        // What the caller knows is about the path it asked for.
                        for waiting in known.values_mut() {
                            waiting.retain(|&w| w != i);
                        }
                    }
                }
            }
            walked += 1;
            let Some(parent) = parent else { break };
            if walked >= max_commits {
                for &i in live.by_path.values() {
                    trails[i].end = End::Cut;
                }
                break;
            }
            commit = parent;
            tree = parent_tree.expect("a parent commit has a tree");
        }
        Ok(Some(Walk { head, trails }))
    }

    /// A blob's text, invalid UTF-8 replaced.
    pub(crate) fn blob_text(&self, id: Oid) -> Result<String> {
        let repo = self.repo();
        let blob = repo.find_blob(id)?;
        Ok(String::from_utf8_lossy(blob.content()).into_owned())
    }

    /// Records that `actor` accepted the agent lines of `path` as they
    /// stand: an empty commit with the `Kasten-Accept` trailer.
    pub(crate) fn accept_marker(
        &self,
        message: &str,
        actor: &Actor,
        path: &str,
    ) -> Result<Option<String>> {
        self.commit_marker(message, actor, "accept", &[(ACCEPT, path.to_owned())])
    }
}
