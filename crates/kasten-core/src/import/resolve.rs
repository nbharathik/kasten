//! What a link in an imported note points at, found as Obsidian finds it:
//! by path, or by name anywhere (the nearest when several share it). Links
//! to notes become `[[Title]]` links, links to files point at where the
//! files went; links to nothing imported stay as they were.

use std::collections::HashMap;

use super::markdown::{Link, percent_decode, relative, rewrite_links, wiki_link};

/// Where something linked is now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Target {
    /// A note, by its title.
    Note(String),
    /// A file, by its vault path.
    File(String),
}

#[derive(Debug, Default)]
pub(crate) struct Resolver {
    /// By path in the source, lowercase: notes without `.md`, files with
    /// their extension.
    by_path: HashMap<String, Target>,
    /// By name, lowercase, the same way; each with its path in the source.
    by_name: HashMap<String, Vec<(String, Target)>>,
    /// By Notion's page id, for links to `notion.so` addresses.
    by_id: HashMap<String, Target>,
}

fn without_md(path: &str) -> &str {
    let lower = path.to_lowercase();
    if lower.ends_with(".md") {
        &path[..path.len() - 3]
    } else {
        path
    }
}

fn name_of(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn folder_of(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(dir, _)| dir)
}

/// `folder/rel` with `.` and `..` worked out; None above the top.
fn join(folder: &str, rel: &str) -> Option<String> {
    let mut parts: Vec<&str> = folder.split('/').filter(|p| !p.is_empty()).collect();
    for part in rel.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            part => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

impl Resolver {
    fn add(&mut self, key: &str, target: Target) {
        let key = key.to_lowercase();
        self.by_name
            .entry(name_of(&key).to_owned())
            .or_default()
            .push((key.clone(), target.clone()));
        self.by_path.insert(key, target);
    }

    /// A note at `rel` in the source (with `.md`), linked by `title`.
    pub fn add_note(&mut self, rel: &str, title: &str) {
        self.add(without_md(rel), Target::Note(title.to_owned()));
    }

    /// A file at `rel` in the source, now at `path` in the vault.
    pub fn add_file(&mut self, rel: &str, path: &str) {
        self.add(rel, Target::File(path.to_owned()));
    }

    /// A Notion page, by its 32-digit id.
    pub fn add_id(&mut self, id: &str, title: &str) {
        self.by_id
            .insert(id.to_lowercase(), Target::Note(title.to_owned()));
    }

    /// A page linked by its `notion.so` address.
    fn address(&self, destination: &str) -> Option<&Target> {
        let path = destination.split(['?', '#']).next()?;
        if !path.contains("notion.so/") && !path.contains("notion.site/") {
            return None;
        }
        let last = path.trim_end_matches('/').rsplit(['/', '-']).next()?;
        self.by_id.get(&last.to_lowercase())
    }

    /// The nearest of several with one name: in `folder`, else the shortest path.
    fn nearest(&self, name: &str, folder: &str) -> Option<&Target> {
        let found = self.by_name.get(name)?;
        let folder = folder.to_lowercase();
        found
            .iter()
            .min_by_key(|(path, _)| (folder_of(path) != folder, path.len(), path.clone()))
            .map(|(_, target)| target)
    }

    /// `[[target]]` written in a note in `folder`.
    pub fn wiki(&self, target: &str, folder: &str) -> Option<&Target> {
        let target = target
            .trim()
            .trim_start_matches("./")
            .trim_start_matches('/');
        if target.is_empty() {
            return None;
        }
        let key = without_md(target).to_lowercase();
        if key.contains('/') {
            return self
                .by_path
                .get(&key)
                .or_else(|| join(&folder.to_lowercase(), &key).and_then(|k| self.by_path.get(&k)));
        }
        self.nearest(&key, folder)
    }

    /// `[text](destination)` written in a note in `folder`; the
    /// destination without its `#fragment`.
    pub fn markdown(&self, destination: &str, folder: &str) -> Option<&Target> {
        let decoded = percent_decode(destination.trim());
        let key = without_md(&decoded).to_lowercase();
        if let Some(absolute) = key.strip_prefix('/') {
            return self.by_path.get(absolute);
        }
        join(&folder.to_lowercase(), &key)
            .and_then(|k| self.by_path.get(&k))
            .or_else(|| self.by_path.get(&key))
            .or_else(|| self.nearest(name_of(&key), folder))
    }
}

/// Whether a destination leaves the vault: `https:`, `mailto:`, `obsidian:`…
fn external(destination: &str) -> bool {
    let scheme = destination.split(':').next().unwrap_or("");
    destination.contains(':')
        && !scheme.is_empty()
        && scheme.len() > 1
        && scheme
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))
}

fn is_image(path: &str) -> bool {
    let ext = path.rsplit_once('.').map(|(_, e)| e.to_lowercase());
    matches!(
        ext.as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif")
    )
}

/// Obsidian's `|300` or `|300x200` after an image: a size, not a caption.
fn is_size(alias: &str) -> bool {
    let alias = alias.trim();
    !alias.is_empty()
        && alias
            .split('x')
            .all(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
}

fn stem(path: &str) -> &str {
    let name = name_of(path);
    name.rsplit_once('.').map_or(name, |(s, _)| s)
}

/// A link to a note, keeping what it showed: the alias, or the words it
/// was written with when they are not the title.
fn to_note(
    embed: bool,
    title: &str,
    heading: Option<&str>,
    written: &str,
    alias: Option<&str>,
    pipe: bool,
) -> String {
    let shown = alias.map(str::to_owned).or_else(|| {
        let words = without_md(name_of(written.trim()));
        (words.to_lowercase() != title.to_lowercase()).then(|| written.trim().to_owned())
    });
    wiki_link(embed, title, heading, shown.as_deref(), pipe)
}

/// `body`, for the note that will be at vault path `at` and was in
/// `folder` of the source, with its links pointing where things went.
pub(crate) fn rewrite_body(body: &str, at: &str, folder: &str, resolver: &Resolver) -> String {
    rewrite_links(body, |link| match link {
        Link::Wiki {
            embed,
            target,
            heading,
            alias,
            escaped_pipe,
        } => match resolver.wiki(target, folder)? {
            Target::Note(title) => Some(to_note(
                *embed,
                title,
                heading.as_deref(),
                target,
                alias.as_deref(),
                *escaped_pipe,
            )),
            Target::File(path) => {
                let url = relative(at, path);
                let caption = alias.as_deref().filter(|a| !is_size(a));
                if *embed && is_image(path) {
                    Some(format!("![{}]({url})", caption.unwrap_or(stem(path))))
                } else {
                    let name = name_of(target.trim());
                    Some(format!("[{}]({url})", caption.unwrap_or(name)))
                }
            }
        },
        Link::Markdown {
            image,
            text,
            destination,
            title,
        } => {
            if external(destination) {
                return match resolver.address(destination)? {
                    Target::Note(note) => {
                        let alias = (!text.eq_ignore_ascii_case(note)).then_some(text.as_str());
                        Some(wiki_link(
                            *image,
                            note,
                            None,
                            alias.filter(|a| !a.is_empty()),
                            false,
                        ))
                    }
                    Target::File(_) => None,
                };
            }
            let (path, fragment) = destination.split_once('#').unwrap_or((destination, ""));
            if path.is_empty() {
                return None;
            }
            let heading = (!fragment.is_empty()).then(|| percent_decode(fragment));
            match resolver.markdown(path, folder)? {
                Target::Note(note) => {
                    let alias = (!text.eq_ignore_ascii_case(note)).then_some(text.as_str());
                    Some(wiki_link(
                        *image,
                        note,
                        heading.as_deref(),
                        alias.filter(|a| !a.is_empty()),
                        false,
                    ))
                }
                Target::File(file) => {
                    let bang = if *image { "!" } else { "" };
                    let title = title
                        .as_deref()
                        .map(|t| format!(" {t}"))
                        .unwrap_or_default();
                    Some(format!("{bang}[{text}]({}{title})", relative(at, file)))
                }
            }
        }
    })
}
