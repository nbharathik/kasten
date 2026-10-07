//! Heptabase keeps a card's text as ProseMirror JSON. This writes it as the
//! Markdown Kasten keeps: headings, paragraphs with bold, italic, code,
//! strikes and links, lists (bulleted, numbered, to-dos) with their nesting,
//! toggles as `<details>`, quotes, code blocks, rules, images, maths, and
//! card mentions as `[[links]]`. Unknown nodes keep their text.

use serde_json::Value;

fn kind(node: &Value) -> &str {
    node.get("type").and_then(Value::as_str).unwrap_or("")
}

fn children(node: &Value) -> &[Value] {
    node.get("content")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn attr<'a>(node: &'a Value, key: &str) -> Option<&'a Value> {
    node.get("attrs").and_then(|a| a.get(key))
}

fn attr_str<'a>(node: &'a Value, key: &str) -> Option<&'a str> {
    attr(node, key).and_then(Value::as_str)
}

/// A card's content as Markdown: ProseMirror JSON (or a string holding
/// it), or Markdown as it is.
pub(crate) fn content_markdown(content: &Value, titles: &dyn Fn(&str) -> Option<String>) -> String {
    let parsed;
    let doc = match content {
        Value::String(text) => match serde_json::from_str::<Value>(text) {
            Ok(value) if value.is_object() => {
                parsed = value;
                &parsed
            }
            _ if text.trim().is_empty() => return String::new(),
            _ => return format!("{}\n", text.trim_end()),
        },
        Value::Object(_) => content,
        _ => return String::new(),
    };
    to_markdown(doc, titles)
}

/// A document as Markdown, blocks apart by a blank line, list items not.
pub(crate) fn to_markdown(doc: &Value, titles: &dyn Fn(&str) -> Option<String>) -> String {
    let out = blocks(children(doc), titles, "");
    if out.is_empty() {
        out
    } else {
        format!("{}\n", out.trim_end_matches('\n'))
    }
}

/// A list item of any kind but a toggle, which is written as a block.
fn is_item(node: &Value) -> bool {
    let k = kind(node);
    (k.ends_with("list_item") && k != "toggle_list_item") || k == "task_item"
}

/// Blocks at one level, each line after the first `indent`ed.
fn blocks(nodes: &[Value], titles: &dyn Fn(&str) -> Option<String>, indent: &str) -> String {
    let mut out = String::new();
    let mut number = 0;
    let mut previous_item = false;
    for node in nodes {
        let item = is_item(node);
        if !out.is_empty() {
            out.push_str(if item && previous_item { "\n" } else { "\n\n" });
            out.push_str(indent);
        }
        number = if kind(node) == "numbered_list_item" || kind(node) == "ordered_list_item" {
            number + 1
        } else {
            0
        };
        out.push_str(&block(node, titles, indent, number));
        previous_item = item;
    }
    out
}

fn block(
    node: &Value,
    titles: &dyn Fn(&str) -> Option<String>,
    indent: &str,
    number: usize,
) -> String {
    let inner = |node: &Value| inline(children(node), titles);
    match kind(node) {
        "paragraph" => inner(node),
        "heading" => {
            let level = attr(node, "level")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6);
            format!("{} {}", "#".repeat(level as usize), inner(node))
        }
        "blockquote" => blocks(children(node), titles, "")
            .lines()
            .map(|l| {
                if l.is_empty() {
                    ">".to_owned()
                } else {
                    format!("> {l}")
                }
            })
            .collect::<Vec<_>>()
            .join(&format!("\n{indent}")),
        "code_block" => {
            let lang = attr_str(node, "params")
                .or_else(|| attr_str(node, "language"))
                .unwrap_or("");
            let code = plain(node);
            format!("```{lang}\n{code}\n```").replace('\n', &format!("\n{indent}"))
        }
        "horizontal_rule" => "---".to_owned(),
        "image" => {
            let src = attr_str(node, "src").unwrap_or("");
            let alt = attr_str(node, "alt").unwrap_or("");
            format!("![{alt}]({src})")
        }
        "card" => card(node, titles, true),
        "math_display" | "math_block" => format!("$$\n{}\n$$", plain(node)),
        "bullet_list" | "ordered_list" | "todo_list" | "task_list" => {
            blocks(children(node), titles, indent)
        }
        "toggle_list_item" => {
            let (first, rest) = children(node)
                .split_first()
                .map_or((String::new(), &[][..]), |(f, r)| {
                    (block(f, titles, "", 0), r)
                });
            let body = blocks(rest, titles, "");
            let body = if body.is_empty() {
                String::new()
            } else {
                format!("{body}\n\n")
            };
            format!("<details>\n<summary>{first}</summary>\n\n{body}</details>")
        }
        k if is_item(node) => {
            let mark = match k {
                "numbered_list_item" | "ordered_list_item" => format!("{}. ", number.max(1)),
                "todo_list_item" | "task_item" | "check_list_item" => {
                    let done = attr(node, "checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    format!("- [{}] ", if done { "x" } else { " " })
                }
                _ => "- ".to_owned(),
            };
            let deeper = format!(
                "{indent}{}",
                " ".repeat(if mark.starts_with('-') { 2 } else { mark.len() })
            );
            let (first, rest) = children(node)
                .split_first()
                .map_or((String::new(), &[][..]), |(f, r)| {
                    (block(f, titles, &deeper, 0), r)
                });
            if rest.is_empty() {
                format!("{mark}{first}")
            } else {
                let sep = if rest.iter().all(is_item) {
                    "\n"
                } else {
                    "\n\n"
                };
                format!(
                    "{mark}{first}{sep}{deeper}{}",
                    blocks(rest, titles, &deeper)
                )
            }
        }
        "table" => table(node, titles),
        _ if children(node).iter().all(|c| kind(c) == "text") => inner(node),
        _ => blocks(children(node), titles, indent),
    }
}

/// A card mention: a link to its card, or words saying it is gone.
fn card(node: &Value, titles: &dyn Fn(&str) -> Option<String>, block: bool) -> String {
    let id = attr_str(node, "cardId")
        .or_else(|| attr_str(node, "id"))
        .unwrap_or("");
    match titles(id) {
        Some(title) if block => format!("![[{title}]]"),
        Some(title) => format!("[[{title}]]"),
        None => "a card that is gone".to_owned(),
    }
}

fn table(node: &Value, titles: &dyn Fn(&str) -> Option<String>) -> String {
    let rows: Vec<Vec<String>> = children(node)
        .iter()
        .map(|row| {
            children(row)
                .iter()
                .map(|cell| {
                    blocks(children(cell), titles, "")
                        .replace('\n', " ")
                        .replace('|', "\\|")
                })
                .collect()
        })
        .collect();
    let Some(width) = rows.iter().map(Vec::len).max() else {
        return String::new();
    };
    let line = |cells: &[String]| {
        let mut all: Vec<&str> = cells.iter().map(String::as_str).collect();
        all.resize(width, "");
        format!("| {} |", all.join(" | "))
    };
    let mut out = vec![line(&rows[0]), format!("|{}", " --- |".repeat(width))];
    out.extend(rows[1..].iter().map(|r| line(r)));
    out.join("\n")
}

/// All the text under a node, as it is.
fn plain(node: &Value) -> String {
    match node.get("text").and_then(Value::as_str) {
        Some(text) => text.to_owned(),
        None => children(node).iter().map(plain).collect(),
    }
}

fn inline(nodes: &[Value], titles: &dyn Fn(&str) -> Option<String>) -> String {
    let mut out = String::new();
    for node in nodes {
        match kind(node) {
            "text" => {
                let mut text = node
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                let marks = node
                    .get("marks")
                    .and_then(Value::as_array)
                    .map(Vec::as_slice)
                    .unwrap_or_default();
                for mark in marks {
                    text = match kind(mark) {
                        "bold" | "strong" => format!("**{text}**"),
                        "italic" | "em" => format!("*{text}*"),
                        "code" => format!("`{text}`"),
                        "strike" | "strikethrough" => format!("~~{text}~~"),
                        "underline" => format!("<u>{text}</u>"),
                        "link" => format!("[{text}]({})", attr_str(mark, "href").unwrap_or("")),
                        _ => text,
                    };
                }
                out.push_str(&text);
            }
            "hard_break" => out.push_str("  \n"),
            "card" | "card_mention" => out.push_str(&card(node, titles, false)),
            "math_inline" => out.push_str(&format!("${}$", plain(node))),
            "image" => out.push_str(&block(node, titles, "", 0)),
            _ => out.push_str(&plain(node)),
        }
    }
    out
}

/// The first line of text, for a card without a title.
pub(crate) fn first_line(doc: &Value) -> Option<String> {
    let text = children(doc)
        .iter()
        .map(plain)
        .find(|t| !t.trim().is_empty())?;
    Some(text.lines().next()?.trim().to_owned())
}

#[cfg(test)]
#[path = "prosemirror_tests.rs"]
mod tests;
