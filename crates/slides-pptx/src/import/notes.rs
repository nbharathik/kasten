//! Speaker notes: the paragraphs of a notes slide's body, as the Markdown a
//! deck keeps. A bullet becomes a list item, a break inside a paragraph a
//! line break; the slide image, number and header placeholders are not notes.

use super::dom::Node;
use super::master::ph_element;

/// Text of a paragraph as a line of Markdown.
fn line(p: &Node) -> String {
    let mut text = String::new();
    for child in p.elements() {
        match child.name.as_str() {
            "a:r" | "a:fld" => {
                if let Some(t) = child.child("a:t") {
                    text.push_str(&t.text());
                }
            }
            "a:br" => text.push('\n'),
            _ => {}
        }
    }
    let ppr = p.child("a:pPr");
    let level = ppr
        .and_then(|n| n.int("lvl"))
        .map_or(0, |l| l.clamp(0, 8) as usize);
    let explicit_bullet = ppr.is_some_and(|n| n.child("a:buChar").is_some());
    let indent = "  ".repeat(level);
    if explicit_bullet && !text.is_empty() {
        return format!("{indent}- {text}");
    }
    // The exporter writes a list item as its bullet character, a space and the words.
    for bullet in ["• ", "– ", "▪ "] {
        let plain = text.trim_start_matches(' ');
        if let Some(rest) = plain.strip_prefix(bullet) {
            let depth = text.len() - plain.len();
            return format!("{}- {rest}", " ".repeat(depth));
        }
    }
    text
}

/// The notes of a notes slide.
pub fn read(notes: &Node) -> String {
    let Some(tree) = notes.at(&["p:cSld", "p:spTree"]) else {
        return String::new();
    };
    let body = tree
        .children_named("p:sp")
        .find(|sp| ph_element(sp).is_some_and(|ph| ph.attr("type") == Some("body")))
        .or_else(|| {
            tree.children_named("p:sp").find(|sp| {
                ph_element(sp).is_some_and(|ph| {
                    !matches!(
                        ph.attr("type"),
                        Some("sldImg" | "sldNum" | "hdr" | "dt" | "ftr")
                    )
                }) && sp.child("p:txBody").is_some()
            })
        });
    let Some(body) = body.and_then(|b| b.child("p:txBody")) else {
        return String::new();
    };
    let lines: Vec<String> = body.children_named("a:p").map(line).collect();
    join(&lines).trim_end().to_owned()
}

fn is_item(line: &str) -> bool {
    let plain = line.trim_start();
    plain.starts_with("- ")
        || plain
            .split_once(". ")
            .is_some_and(|(n, _)| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
}

/// The lines as Markdown. A file whose paragraphs are separated by empty ones (as this crate's
/// exporter writes them) keeps its lines as they are; in a file whose paragraphs are not, each
/// paragraph of words is a paragraph of the notes.
fn join(lines: &[String]) -> String {
    let separated = lines.iter().any(|l| l.trim().is_empty());
    let mut out = String::new();
    for (n, current) in lines.iter().enumerate() {
        if n > 0 {
            let before = &lines[n - 1];
            let words = |l: &String| !l.trim().is_empty() && !is_item(l);
            out.push_str(if !separated && words(before) && words(current) {
                "\n\n"
            } else {
                "\n"
            });
        }
        out.push_str(current);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::testing::xml;

    fn notes(paragraphs: &str) -> String {
        let node = xml(&format!(
            r#"<p:notes><p:cSld><p:spTree>
            <p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
            <p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
              <p:txBody><a:bodyPr/><a:lstStyle/>{paragraphs}</p:txBody></p:sp>
            <p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Number"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:p><a:r><a:t>7</a:t></a:r></a:p></p:txBody></p:sp>
            </p:spTree></p:cSld></p:notes>"#
        ));
        read(&node)
    }

    #[test]
    fn the_paragraphs_of_the_notes_placeholder_are_the_lines() {
        assert_eq!(
            notes(
                r#"<a:p><a:r><a:t>Say this.</a:t></a:r></a:p><a:p><a:endParaRPr/></a:p><a:p><a:r><a:t>Then </a:t></a:r><a:r><a:t>that.</a:t></a:r><a:br/><a:r><a:t>After a break.</a:t></a:r></a:p>"#
            ),
            "Say this.\n\nThen that.\nAfter a break."
        );
        assert_eq!(notes(""), "");
    }

    #[test]
    fn paragraphs_with_nothing_between_them_are_paragraphs_of_the_notes() {
        assert_eq!(
            notes(
                r#"<a:p><a:r><a:t>One.</a:t></a:r></a:p><a:p><a:r><a:t>Two.</a:t></a:r></a:p><a:p><a:r><a:t>• item</a:t></a:r></a:p><a:p><a:r><a:t>• item</a:t></a:r></a:p>"#
            ),
            "One.\n\nTwo.\n- item\n- item"
        );
    }

    #[test]
    fn a_bullet_is_a_list_item_whether_the_file_marks_it_or_types_it() {
        assert_eq!(
            notes(
                r#"<a:p><a:pPr lvl="1"><a:buChar char="x"/></a:pPr><a:r><a:t>marked</a:t></a:r></a:p><a:p><a:r><a:t>• typed</a:t></a:r></a:p><a:p><a:r><a:t>  – deeper</a:t></a:r></a:p><a:p><a:r><a:t>1. numbered</a:t></a:r></a:p>"#
            ),
            "  - marked\n- typed\n  - deeper\n1. numbered"
        );
    }
}
