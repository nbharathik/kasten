//! Speaker notes. The notes of a slide are Markdown in the deck; PowerPoint's
//! notes are plain paragraphs, so the markers are taken off and the words kept.

use crate::cx::Cx;
use crate::layouts::{open_root, write_tree_header};
use crate::rels;
use crate::xml::Xml;

/// The bullet a note's list item is given, by depth.
const BULLETS: [&str; 3] = ["•", "–", "▪"];

fn is_rule(line: &str) -> bool {
    let t = line.trim();
    t.len() >= 3
        && ["-", "*", "_"]
            .iter()
            .any(|m| t.chars().all(|c| c.to_string() == *m || c == ' '))
}

/// A link `[words](address)` or picture `![words](address)` starting at
/// `chars[at]`: its words, its address, whether it is a picture, and where it ends.
fn link_at(chars: &[char], at: usize) -> Option<(String, String, bool, usize)> {
    let picture = chars[at] == '!';
    let open = at + usize::from(picture);
    if chars.get(open) != Some(&'[') {
        return None;
    }
    let close = open + chars[open..].iter().position(|c| *c == ']')?;
    if chars.get(close + 1) != Some(&'(') {
        return None;
    }
    let end = close + chars[close..].iter().position(|c| *c == ')')?;
    let words = chars[open + 1..close].iter().collect();
    let address = chars[close + 2..end].iter().collect();
    Some((words, address, picture, end + 1))
}

/// How many characters of emphasis, strike-through or code marker start at
/// `chars[at]`; none when it is an ordinary `*` or `_` (a product, a snake_case name).
fn marker_len(chars: &[char], at: usize) -> usize {
    let c = chars[at];
    if !matches!(c, '*' | '_' | '~' | '`') {
        return 0;
    }
    let word = |c: Option<&char>| c.is_some_and(|c| c.is_alphanumeric());
    let next = chars.get(at + 1);
    let before = at.checked_sub(1).and_then(|p| chars.get(p));
    let doubled = next == Some(&c);
    // A doubled marker is emphasis. A single one is when it touches a word on one side only.
    let touches = word(next) != word(before)
        || (!word(next) && !word(before) && next.is_some_and(|n| !n.is_whitespace()));
    if matches!(c, '`' | '~') || doubled || touches {
        if doubled { 2 } else { 1 }
    } else {
        0
    }
}

/// The words of a line with the inline markers taken off: emphasis, code
/// ticks, strike-through, and links and pictures reduced to their words.
fn inline(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if let Some((words, address, picture, next)) = link_at(&chars, i) {
            out.push_str(&words);
            if !picture && !address.is_empty() && address != words {
                out.push_str(&format!(" ({address})"));
            }
            i = next;
        } else if chars[i] == '\\' && chars.get(i + 1).is_some_and(char::is_ascii_punctuation) {
            out.push(chars[i + 1]);
            i += 2;
        } else if marker_len(&chars, i) > 0 {
            i += marker_len(&chars, i);
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// The paragraphs of notes: one per line, blank lines kept once as a gap.
pub fn plain(markdown: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut in_code = false;
    for raw in markdown.replace("\r\n", "\n").lines() {
        let line = raw.trim_end();
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            out.push(line.to_owned());
            continue;
        }
        if trimmed.is_empty() {
            if out.last().is_some_and(|l| !l.is_empty()) {
                out.push(String::new());
            }
            continue;
        }
        if is_rule(trimmed) {
            continue;
        }
        let depth = (line.len() - trimmed.len())
            .div_ceil(2)
            .min(BULLETS.len() * 3);
        let indent = "  ".repeat(depth);
        let text = if let Some(rest) = trimmed
            .trim_start_matches('#')
            .strip_prefix(' ')
            .filter(|_| trimmed.starts_with('#'))
        {
            inline(rest)
        } else if let Some(rest) = trimmed.strip_prefix('>') {
            inline(rest.trim_start())
        } else if let Some(rest) = ["- ", "* ", "+ "]
            .iter()
            .find_map(|m| trimmed.strip_prefix(m))
        {
            format!(
                "{indent}{} {}",
                BULLETS[depth % BULLETS.len()],
                inline(rest.trim_start())
            )
        } else {
            let digits = trimmed.chars().take_while(char::is_ascii_digit).count();
            match trimmed[digits..].chars().next() {
                Some('.' | ')') if digits > 0 && trimmed[digits + 1..].starts_with(' ') => {
                    format!(
                        "{indent}{}. {}",
                        &trimmed[..digits],
                        inline(trimmed[digits + 2..].trim_start())
                    )
                }
                _ => inline(trimmed),
            }
        };
        out.push(text);
    }
    while out.last().is_some_and(String::is_empty) {
        out.pop();
    }
    out
}

fn write_paragraph(x: &mut Xml, text: &str) {
    x.open("a:p");
    if text.is_empty() {
        x.open("a:endParaRPr")
            .attr("lang", "en-US")
            .attr("dirty", "0")
            .close();
    } else {
        x.open("a:r");
        x.open("a:rPr")
            .attr("lang", "en-US")
            .attr("dirty", "0")
            .close();
        x.text_element("a:t", text);
        x.close();
    }
    x.close();
}

/// A notes slide, whose text is `paragraphs`. It relates to the notes master and to its slide.
pub fn write_slide(cx: &mut Cx, paragraphs: &[String], slide_part: &str) -> Vec<u8> {
    cx.rels
        .add(rels::NOTES_MASTER, "../notesMasters/notesMaster1.xml");
    cx.rels.add(rels::SLIDE, &format!("../slides/{slide_part}"));
    let mut x = Xml::document();
    open_root(&mut x, "p:notes");
    x.open("p:cSld");
    x.open("p:spTree");
    write_tree_header(&mut x);
    x.open("p:sp");
    x.open("p:nvSpPr");
    x.open("p:cNvPr")
        .int("id", 2)
        .attr("name", "Slide Image Placeholder 1")
        .close();
    x.open("p:cNvSpPr");
    x.open("a:spLocks")
        .attr("noGrp", "1")
        .attr("noRot", "1")
        .attr("noChangeAspect", "1")
        .close();
    x.close();
    x.open("p:nvPr");
    x.open("p:ph").attr("type", "sldImg").close();
    x.close();
    x.close();
    x.open("p:spPr").close();
    x.close();
    x.open("p:sp");
    x.open("p:nvSpPr");
    x.open("p:cNvPr")
        .int("id", 3)
        .attr("name", "Notes Placeholder 2")
        .close();
    x.open("p:cNvSpPr");
    x.open("a:spLocks").attr("noGrp", "1").close();
    x.close();
    x.open("p:nvPr");
    x.open("p:ph").attr("type", "body").attr("idx", "1").close();
    x.close();
    x.close();
    x.open("p:spPr").close();
    x.open("p:txBody");
    x.open("a:bodyPr").close();
    x.open("a:lstStyle").close();
    if paragraphs.is_empty() {
        write_paragraph(&mut x, "");
    }
    for text in paragraphs {
        write_paragraph(&mut x, text);
    }
    x.close();
    x.close();
    x.close();
    x.close();
    x.open("p:clrMapOvr");
    x.open("a:masterClrMapping").close();
    x.close();
    x.close();
    x.finish()
}

/// The notes master: where the slide's picture and the notes go on a notes page.
pub fn write_master(cx: &mut Cx) -> Vec<u8> {
    cx.rels.add(rels::THEME, "../theme/theme2.xml");
    // The slide's picture is six inches wide, in the deck's proportions, centred on the page.
    let (w, h) = (cx.deck.size.w.max(1.0), cx.deck.size.h.max(1.0));
    let across = 5_486_400_i64;
    let down = (across as f64 * h / w).round() as i64;
    let mut x = Xml::document();
    open_root(&mut x, "p:notesMaster");
    x.open("p:cSld");
    x.open("p:bg");
    x.open("p:bgRef").int("idx", 1001);
    x.open("a:schemeClr").attr("val", "bg1").close();
    x.close();
    x.close();
    x.open("p:spTree");
    write_tree_header(&mut x);
    let mut shape = |id: i64,
                     name: &str,
                     ph: &[(&str, &str)],
                     locks: &[&str],
                     geometry: Option<(i64, i64, i64, i64)>,
                     body: bool| {
        x.open("p:sp");
        x.open("p:nvSpPr");
        x.open("p:cNvPr").int("id", id).attr("name", name).close();
        x.open("p:cNvSpPr");
        x.open("a:spLocks");
        for lock in locks {
            x.attr(lock, "1");
        }
        x.close();
        x.close();
        x.open("p:nvPr");
        x.open("p:ph");
        for (k, v) in ph {
            x.attr(k, v);
        }
        x.close();
        x.close();
        x.close();
        x.open("p:spPr");
        if let Some((left, top, cx_, cy)) = geometry {
            x.open("a:xfrm");
            x.open("a:off").int("x", left).int("y", top).close();
            x.open("a:ext").int("cx", cx_).int("cy", cy).close();
            x.close();
            x.open("a:prstGeom").attr("prst", "rect");
            x.open("a:avLst").close();
            x.close();
            if !body {
                x.open("a:noFill").close();
                x.open("a:ln").int("w", 12700);
                x.open("a:solidFill");
                x.open("a:prstClr").attr("val", "black").close();
                x.close();
                x.close();
            }
        }
        x.close();
        if body {
            x.open("p:txBody");
            x.open("a:bodyPr")
                .attr("vert", "horz")
                .int("lIns", 91440)
                .int("tIns", 45720)
                .int("rIns", 91440)
                .int("bIns", 45720)
                .attr("rtlCol", "0");
            x.close();
            x.open("a:lstStyle").close();
            for level in ["Click to edit Master text styles", "Second level"] {
                x.open("a:p");
                if level == "Second level" {
                    x.open("a:pPr").int("lvl", 1).close();
                }
                x.open("a:r");
                x.open("a:rPr").attr("lang", "en-US").close();
                x.text_element("a:t", level);
                x.close();
                x.close();
            }
            x.close();
        }
        x.close();
    };
    shape(
        2,
        "Slide Image Placeholder 1",
        &[("type", "sldImg"), ("idx", "2")],
        &["noGrp", "noRot", "noChangeAspect"],
        Some((685_800, 1_143_000, across, down)),
        false,
    );
    shape(
        3,
        "Notes Placeholder 2",
        &[("type", "body"), ("sz", "quarter"), ("idx", "3")],
        &["noGrp"],
        Some((685_800, 4_400_550, 5_486_400, 3_600_450)),
        true,
    );
    x.close();
    x.close();
    x.leaf(
        "p:clrMap",
        &[
            ("bg1", "lt1"),
            ("tx1", "dk1"),
            ("bg2", "lt2"),
            ("tx2", "dk2"),
            ("accent1", "accent1"),
            ("accent2", "accent2"),
            ("accent3", "accent3"),
            ("accent4", "accent4"),
            ("accent5", "accent5"),
            ("accent6", "accent6"),
            ("hlink", "hlink"),
            ("folHlink", "folHlink"),
        ],
    );
    x.open("p:notesStyle");
    for level in 1..=9 {
        x.open(&format!("a:lvl{level}pPr"))
            .int("marL", 457_200 * (level - 1))
            .attr("algn", "l")
            .int("defTabSz", 914_400)
            .attr("rtl", "0")
            .attr("eaLnBrk", "1")
            .attr("latinLnBrk", "0")
            .attr("hangingPunct", "1");
        x.open("a:defRPr").int("sz", 1200).int("kern", 1200);
        crate::color::Color::Scheme("tx1").solid_fill(&mut x, None);
        x.leaf("a:latin", &[("typeface", "+mn-lt")]);
        x.close();
        x.close();
    }
    x.close();
    x.close();
    x.finish()
}

#[cfg(test)]
mod tests;
