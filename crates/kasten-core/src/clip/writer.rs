//! A page's article as Markdown: blocks apart by a blank line, inline
//! content gathered into paragraphs, lists nested, links and images made
//! absolute against the page's address.

use super::escape::{code_block, code_span, plain, target};
use super::html::{Element, Node};
use super::one_line;

/// Elements that are never an article's text.
const SKIP: [&str; 10] = [
    "nav", "aside", "form", "button", "select", "input", "dialog", "menu", "object", "canvas",
];
/// Page furniture, left out when there is no article or main part.
const FRAME: [&str; 2] = ["header", "footer"];

pub(crate) struct Writer<'a> {
    pub base: &'a str,
    /// Leave out headers and footers: the page has no article.
    pub frame: bool,
}

/// Placeholder for a line break inside a paragraph, until spaces are tidied.
const BREAK: char = '\u{1}';

fn is_block(name: &str) -> bool {
    matches!(
        name,
        "p" | "div"
            | "section"
            | "article"
            | "main"
            | "header"
            | "footer"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "ul"
            | "ol"
            | "li"
            | "blockquote"
            | "pre"
            | "table"
            | "figure"
            | "figcaption"
            | "hr"
            | "dl"
            | "dt"
            | "dd"
            | "details"
            | "summary"
            | "center"
            | "address"
    )
}

impl Writer<'_> {
    fn skipped(&self, e: &Element) -> bool {
        SKIP.contains(&e.name.as_str())
            || (self.frame && FRAME.contains(&e.name.as_str()))
            || e.attr("hidden").is_some()
            || e.attr("aria-hidden") == Some("true")
    }

    /// The blocks of a run of nodes, inline content gathered into paragraphs.
    pub fn blocks(&self, nodes: &[Node]) -> Vec<String> {
        let mut out = Vec::new();
        let mut run: Vec<&Node> = Vec::new();
        let flush = |run: &mut Vec<&Node>, out: &mut Vec<String>| {
            let text = tidy(&self.inline_nodes(run));
            if !text.is_empty() {
                out.push(text);
            }
            run.clear();
        };
        for node in nodes {
            match node {
                Node::Element(e) if self.skipped(e) => {}
                Node::Element(e) if is_block(&e.name) => {
                    flush(&mut run, &mut out);
                    out.extend(self.block(e));
                }
                other => run.push(other),
            }
        }
        flush(&mut run, &mut out);
        out
    }

    fn block(&self, e: &Element) -> Vec<String> {
        match e.name.as_str() {
            h if h.len() == 2 && h.starts_with('h') && h.as_bytes()[1].is_ascii_digit() => {
                let text = tidy(&self.inline(&e.children)).replace(['\n', BREAK], " ");
                if text.is_empty() {
                    return Vec::new();
                }
                vec![format!(
                    "{} {text}",
                    "#".repeat(usize::from(h.as_bytes()[1] - b'0'))
                )]
            }
            "ul" | "ol" => {
                let list = self.list(e, "");
                if list.is_empty() {
                    Vec::new()
                } else {
                    vec![list]
                }
            }
            "blockquote" => {
                let inner = self.blocks(&e.children).join("\n\n");
                if inner.is_empty() {
                    return Vec::new();
                }
                vec![
                    inner
                        .lines()
                        .map(|l| {
                            if l.is_empty() {
                                ">".to_owned()
                            } else {
                                format!("> {l}")
                            }
                        })
                        .collect::<Vec<_>>()
                        .join("\n"),
                ]
            }
            "pre" => {
                let code = e.text();
                let code = code.strip_prefix('\n').unwrap_or(&code).trim_end();
                let lang = e
                    .find(&|c| c.name == "code")
                    .and_then(|c| c.attr("class"))
                    .and_then(|class| {
                        class
                            .split_whitespace()
                            .find_map(|c| c.strip_prefix("language-"))
                    })
                    .unwrap_or("");
                vec![code_block(code, lang)]
            }
            "hr" => vec!["---".to_owned()],
            "table" => self.table(e).into_iter().collect(),
            "figcaption" => {
                let text = tidy(&self.inline(&e.children));
                if text.is_empty() {
                    Vec::new()
                } else {
                    vec![format!("*{text}*")]
                }
            }
            "dt" => {
                let text = tidy(&self.inline(&e.children));
                if text.is_empty() {
                    Vec::new()
                } else {
                    vec![format!("**{text}**")]
                }
            }
            _ => self.blocks(&e.children),
        }
    }

    /// A list, its items one per line, nested lists indented under them.
    fn list(&self, list: &Element, indent: &str) -> String {
        let ordered = list.name == "ol";
        let mut lines: Vec<String> = Vec::new();
        let mut n = 0;
        for item in list.children.iter().filter_map(|c| match c {
            Node::Element(e) if e.name == "li" => Some(e),
            _ => None,
        }) {
            n += 1;
            let marker = if ordered {
                format!("{n}. ")
            } else {
                "- ".to_owned()
            };
            let deeper = format!("{indent}{}", " ".repeat(marker.len()));
            let mut first = true;
            let mut inline: Vec<&Node> = Vec::new();
            let mut parts: Vec<String> = Vec::new();
            for child in &item.children {
                match child {
                    Node::Element(e) if matches!(e.name.as_str(), "ul" | "ol") => {
                        let text = tidy(&self.inline_nodes(&inline));
                        inline.clear();
                        if !text.is_empty() {
                            parts.push(text);
                        }
                        parts.push(self.list(e, &deeper).trim_start().to_owned());
                    }
                    Node::Element(e) if self.skipped(e) => {}
                    other => inline.push(other),
                }
            }
            let text = tidy(&self.inline_nodes(&inline));
            if !text.is_empty() {
                parts.push(text);
            }
            for part in parts {
                let is_list = part.starts_with("- ")
                    || part.split_once(". ").is_some_and(|(n, _)| {
                        n.chars().all(|c| c.is_ascii_digit()) && !n.is_empty()
                    });
                let line = if first {
                    format!(
                        "{indent}{marker}{}",
                        part.replace('\n', &format!("\n{deeper}"))
                    )
                } else if is_list {
                    format!("{deeper}{part}")
                } else {
                    format!("{deeper}{}", part.replace('\n', &format!("\n{deeper}")))
                };
                lines.push(line);
                first = false;
            }
        }
        lines.join("\n")
    }

    fn table(&self, table: &Element) -> Option<String> {
        let mut rows: Vec<Vec<String>> = Vec::new();
        let mut collect = |e: &Element| {
            let cells: Vec<String> = e
                .children
                .iter()
                .filter_map(|c| match c {
                    Node::Element(cell) if matches!(cell.name.as_str(), "td" | "th") => Some(
                        tidy(&self.inline(&cell.children))
                            .replace(['\n', BREAK], " ")
                            .replace('|', "\\|"),
                    ),
                    _ => None,
                })
                .collect();
            if !cells.is_empty() {
                rows.push(cells);
            }
        };
        for child in &table.children {
            if let Node::Element(e) = child {
                match e.name.as_str() {
                    "tr" => collect(e),
                    "thead" | "tbody" | "tfoot" => e.children.iter().for_each(|c| {
                        if let Node::Element(r) = c
                            && r.name == "tr"
                        {
                            collect(r);
                        }
                    }),
                    _ => {}
                }
            }
        }
        let width = rows.iter().map(Vec::len).max()?;
        let line = |cells: &[String]| {
            let mut all: Vec<&str> = cells.iter().map(String::as_str).collect();
            all.resize(width, "");
            format!("| {} |", all.join(" | "))
        };
        let mut out = vec![line(&rows[0]), format!("|{}", " --- |".repeat(width))];
        out.extend(rows[1..].iter().map(|r| line(r)));
        Some(out.join("\n"))
    }

    fn inline(&self, nodes: &[Node]) -> String {
        self.inline_nodes(&nodes.iter().collect::<Vec<_>>())
    }

    fn inline_nodes(&self, nodes: &[&Node]) -> String {
        let mut out = String::new();
        for node in nodes {
            match node {
                Node::Text(text) => {
                    out.push_str(&plain(&text.replace(|c: char| c.is_whitespace(), " ")));
                }
                Node::Element(e) if self.skipped(e) => {}
                Node::Element(e) => out.push_str(&self.inline_element(e)),
            }
        }
        out
    }

    fn inline_element(&self, e: &Element) -> String {
        let inner = || self.inline(&e.children);
        let wrap = |mark: &str| {
            let text = inner();
            let trimmed = text.trim();
            if trimmed.is_empty() {
                text
            } else {
                let lead = &text[..text.len() - text.trim_start().len()];
                let tail = &text[text.trim_end().len()..];
                format!("{lead}{mark}{trimmed}{mark}{tail}")
            }
        };
        match e.name.as_str() {
            "br" => BREAK.to_string(),
            "strong" | "b" => wrap("**"),
            "em" | "i" => wrap("*"),
            "del" | "s" | "strike" => wrap("~~"),
            "code" | "kbd" => code_span(&one_line(&e.text())),
            "img" => {
                let src = e.attr("src").or_else(|| e.attr("data-src")).unwrap_or("");
                let Some(src) = Some(src.trim())
                    .filter(|s| !s.is_empty())
                    .and_then(|s| target(self.base, s))
                else {
                    return String::new();
                };
                format!(
                    "![{}]({src})",
                    plain(&one_line(e.attr("alt").unwrap_or("")))
                )
            }
            "a" => {
                let text = tidy(&inner());
                let href = e.attr("href").unwrap_or("").trim();
                if href.is_empty() || href.starts_with('#') || text.is_empty() {
                    return inner();
                }
                match target(self.base, href) {
                    Some(to) => format!("[{text}]({to})"),
                    None => inner(),
                }
            }
            _ => inner(),
        }
    }
}

/// Spaces tidied: one between words, none around line breaks or at the ends.
fn tidy(text: &str) -> String {
    let lines: Vec<String> = text.split(BREAK).map(one_line).collect();
    let joined = lines.join("  \n");
    joined
        .trim_matches(|c: char| c.is_whitespace() && c != '\n')
        .trim_end_matches("  \n")
        .to_owned()
}
