//! A Notion page's text as Kasten keeps it: without the title heading
//! Notion writes first, a database row without the `Column: value` lines
//! that repeat its values, and callouts (`<aside>`) as `> [!note]` blocks.

use super::markdown::without_title;
use super::resolve::{Resolver, rewrite_body};
use super::walk::SourceFile;
use crate::frontmatter::split;

/// A page's body: without its title heading or a row's lines of values,
/// callouts as Kasten's, links pointing where things went.
pub(crate) fn page_body(
    file: Option<&SourceFile>,
    text: &str,
    title: &str,
    at: &str,
    headers: &[String],
    resolver: &Resolver,
) -> String {
    let Some(f) = file else {
        return String::new();
    };
    let body = without_title(split(text).body, title);
    let body = without_values(&body, headers);
    rewrite_body(&callouts(&body), at, f.folder(), resolver)
}

/// A row's page repeats its values as `Column: value` lines under the title.
pub(crate) fn without_values(body: &str, headers: &[String]) -> String {
    let names: Vec<String> = headers
        .iter()
        .skip(1)
        .map(|h| h.trim().to_lowercase())
        .collect();
    if names.is_empty() {
        return body.to_owned();
    }
    let mut end = 0;
    for line in body.split_inclusive('\n') {
        let key = line.split_once(':').map(|(k, _)| k.trim().to_lowercase());
        if !key.is_some_and(|k| names.contains(&k)) {
            break;
        }
        end += line.len();
    }
    body[end..].trim_start_matches(['\n', '\r']).to_owned()
}

/// Notion's `<aside>` callouts as `> [!note]` blocks.
pub(crate) fn callouts(body: &str) -> String {
    let mut out = String::with_capacity(body.len());
    let mut inside: Option<Vec<String>> = None;
    let emit = |out: &mut String, lines: &[String]| {
        let start = lines
            .iter()
            .position(|l| !l.is_empty())
            .unwrap_or(lines.len());
        let end = lines
            .iter()
            .rposition(|l| !l.is_empty())
            .map_or(start, |i| i + 1);
        out.push_str("> [!note]\n");
        for line in &lines[start..end] {
            out.push_str(if line.is_empty() { ">\n" } else { "> " });
            if !line.is_empty() {
                out.push_str(line);
                out.push('\n');
            }
        }
    };
    for line in body.split_inclusive('\n') {
        let trimmed = line.trim();
        match inside.as_mut() {
            None if trimmed == "<aside>" => inside = Some(Vec::new()),
            None if trimmed.starts_with("<aside>") && trimmed.ends_with("</aside>") => {
                let inner = &trimmed["<aside>".len()..trimmed.len() - "</aside>".len()];
                emit(&mut out, &[inner.trim().to_owned()]);
            }
            None => out.push_str(line),
            Some(lines) if trimmed == "</aside>" => {
                emit(&mut out, lines);
                inside = None;
            }
            Some(lines) => lines.push(line.trim_end_matches(['\n', '\r']).trim_start().to_owned()),
        }
    }
    if let Some(lines) = inside {
        emit(&mut out, &lines);
    }
    out
}
