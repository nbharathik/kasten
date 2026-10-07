//! A plan as the Markdown outline `create_deck` takes.

use super::plan::{Plan, Planned};
use super::text::plain;

/// One line of plain words that can stand in a heading: no markup that means something to the outline.
fn heading_words(words: &str) -> String {
    let flat = plain(words)
        .replace("<!--", "")
        .replace("-->", "")
        .replace(['[', ']'], "");
    let flat = flat.trim().trim_start_matches('#').trim();
    if flat.is_empty() {
        "Untitled".to_owned()
    } else {
        flat.to_owned()
    }
}

/// A line of notes or of a list that cannot start a slide, a comment or the notes.
fn safe(line: &str) -> String {
    let t = line.trim_start();
    if t.starts_with('#') {
        format!("\\{t}")
    } else if t.eq_ignore_ascii_case("notes:") {
        "Notes –".to_owned()
    } else {
        line.replace("<!--", "").replace("-->", "")
    }
}

fn notes(out: &mut String, text: &str) {
    if text.trim().is_empty() {
        return;
    }
    out.push_str("\nNotes:\n");
    for line in text.lines() {
        out.push_str(&safe(line));
        out.push('\n');
    }
}

fn slide(out: &mut String, planned: &Planned) {
    out.push('\n');
    let title = heading_words(&planned.title);
    match (&planned.picture, planned.layout) {
        (Some(_), _) => {
            // The picture is placed by its path, not written in the outline, where a name with spaces
            // or brackets would be read as something else.
            out.push_str(&format!("## {title} <!-- layout: image-caption -->\n"));
        }
        (None, layout) => {
            match layout {
                Some(name) => out.push_str(&format!("## {title} <!-- layout: {name} -->\n")),
                None => out.push_str(&format!("## {title}\n")),
            }
            if !planned.lines.is_empty() {
                let list: Vec<String> = planned.lines.iter().map(|l| safe(l)).collect();
                if layout == Some("section") {
                    // A divider's one line is its subtitle, not a bullet.
                    let words = list[0].trim_start().trim_start_matches("- ");
                    out.push_str(&format!("{words}\n"));
                } else {
                    out.push_str(&list.join("\n"));
                    out.push('\n');
                }
            }
        }
    }
    notes(out, &planned.notes);
}

/// The whole outline: the deck's title, its cover, and a slide for each planned one.
pub(super) fn of(plan: &Plan) -> String {
    let title = heading_words(&plan.title);
    let mut out = format!("# {title}\n\n## {title} <!-- layout: title -->\n");
    if !plan.subtitle.trim().is_empty() {
        out.push_str(&format!("{}\n", safe(&plan.subtitle)));
    }
    notes(&mut out, &plan.cover_notes);
    for planned in &plan.slides {
        slide(&mut out, planned);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::super::text::Picture;
    use super::*;

    #[test]
    fn a_plan_is_an_outline_that_cannot_be_turned_into_another_by_what_the_note_says() {
        let plan = Plan {
            title: "A <!-- layout: code --> note".into(),
            subtitle: "Why links win.".into(),
            cover_notes: "First paragraph.\n\nNotes:\n## Not a slide".into(),
            slides: vec![
                Planned {
                    title: "# Method".into(),
                    lines: vec![
                        "- one".into(),
                        "  - nested".into(),
                        "- ## not a heading".into(),
                    ],
                    notes: "Say <!-- x --> it.".into(),
                    ..Planned::default()
                },
                Planned {
                    title: "Figure".into(),
                    layout: Some("image-caption"),
                    picture: Some(Picture {
                        alt: "A (chart)".into(),
                        src: "assets/a chart.png".into(),
                    }),
                    ..Planned::default()
                },
                Planned {
                    title: "Linked".into(),
                    lines: vec!["- What it is.".into()],
                    layout: Some("section"),
                    ..Planned::default()
                },
            ],
            ..Plan::default()
        };
        let text = of(&plan);
        let parsed = slides_core::outline::parse_outline(&text);
        assert_eq!(parsed.title, "A note");
        assert_eq!(parsed.slides.len(), 4, "{text}");
        assert_eq!(parsed.slides[0].layout.as_deref(), Some("title"));
        assert_eq!(parsed.slides[1].title, "Method");
        assert_eq!(parsed.slides[2].layout.as_deref(), Some("image-caption"));
        assert_eq!(parsed.slides[3].layout.as_deref(), Some("section"));
        assert!(
            parsed.slides[0].notes.contains("Notes –"),
            "{:?}",
            parsed.slides[0].notes
        );
        assert!(
            parsed.slides[0].notes.contains("## Not a slide"),
            "{:?}",
            parsed.slides[0].notes
        );
        assert!(!text.contains("!["), "{text}");
        assert!(
            parsed.slides[2].blocks.is_empty(),
            "{:?}",
            parsed.slides[2].blocks
        );
    }
}
