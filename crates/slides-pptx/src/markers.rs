//! The line an export puts last in a slide's notes so a program that reads
//! the file can tell which slide of a deck each page is: `[kasten s-1a2b3c4d]`,
//! and on a page of a slide written as several, `[kasten s-1a2b3c4d step 2/5]`.
//! A backup slide, which the file marks hidden like a hidden one, says
//! `backup` too. An import takes the line off the notes again.

use slides_core::Slide;

const OPEN: &str = "[kasten ";

/// What a marker says.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Marker {
    pub slide: String,
    /// The page of a slide written as several: this one of that many, from 1.
    pub step: Option<(u32, u32)>,
    pub backup: bool,
}

/// Reads a notes line as a marker; None if it is not one.
pub fn parse(line: &str) -> Option<Marker> {
    let inner = line.trim().strip_prefix(OPEN)?.strip_suffix(']')?;
    let mut words = inner.split_whitespace();
    let slide = words.next()?.to_owned();
    let mut marker = Marker {
        slide,
        step: None,
        backup: false,
    };
    while let Some(word) = words.next() {
        match word {
            "step" => {
                let (k, n) = words.next()?.split_once('/')?;
                marker.step = Some((k.parse().ok()?, n.parse().ok()?));
            }
            "backup" => marker.backup = true,
            _ => {}
        }
    }
    Some(marker)
}

/// The notes of an imported slide without their marker lines, and the last marker there was.
pub fn strip(notes: &str) -> (String, Option<Marker>) {
    let mut found = None;
    let kept: Vec<&str> = notes
        .lines()
        .filter(|line| match parse(line) {
            Some(m) => {
                found = Some(m);
                false
            }
            None => true,
        })
        .collect();
    (kept.join("\n").trim_end().to_owned(), found)
}

/// The notes lines of a page with the slide's marker last, when there is not already one from a step.
pub fn stamp(mut lines: Vec<String>, slide: &Slide, enabled: bool) -> Vec<String> {
    if !enabled {
        return lines;
    }
    let flag = if slide.backup { " backup" } else { "" };
    if let Some(last) = lines.last_mut().filter(|l| parse(l).is_some()) {
        last.pop();
        last.push_str(flag);
        last.push(']');
        return lines;
    }
    while lines.last().is_some_and(String::is_empty) {
        lines.pop();
    }
    if !lines.is_empty() {
        lines.push(String::new());
    }
    lines.push(format!("{OPEN}{}{flag}]", slide.id));
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slide(backup: bool) -> Slide {
        let mut s = Slide::new("s-1a2b", "blank");
        s.backup = backup;
        s
    }

    #[test]
    fn a_marker_names_the_slide_the_page_and_whether_it_is_a_backup() {
        assert_eq!(
            parse("[kasten s-1a2b]"),
            Some(Marker {
                slide: "s-1a2b".into(),
                step: None,
                backup: false
            })
        );
        assert_eq!(
            parse("  [kasten s-1a2b step 2/5 backup]  "),
            Some(Marker {
                slide: "s-1a2b".into(),
                step: Some((2, 5)),
                backup: true
            })
        );
        for not in [
            "kasten s-1",
            "[kasten]",
            "[kasten s-1 step x/2]",
            "see [kasten s-1] here",
            "[other s-1]",
        ] {
            assert_eq!(parse(not), None, "{not}");
        }
    }

    #[test]
    fn marker_lines_come_off_the_notes_and_the_rest_stays() {
        let (notes, marker) = strip("Say this.\n\n- and this\n\n[kasten s-9 step 1/3]\n");
        assert_eq!(notes, "Say this.\n\n- and this");
        assert_eq!(marker.map(|m| m.step), Some(Some((1, 3))));
        assert_eq!(
            strip("[kasten s-9]"),
            (String::new(), parse("[kasten s-9]"))
        );
        assert_eq!(strip("plain"), ("plain".to_owned(), None));
    }

    #[test]
    fn a_page_gets_its_marker_last_after_a_blank_line_and_only_when_asked() {
        let words = vec!["one".to_owned(), "two".to_owned(), String::new()];
        let stamped = stamp(words.clone(), &slide(false), true);
        assert_eq!(stamped, ["one", "two", "", "[kasten s-1a2b]"]);
        assert_eq!(stamp(words, &slide(false), false).len(), 3);
        assert_eq!(
            stamp(Vec::new(), &slide(true), true),
            ["[kasten s-1a2b backup]"]
        );
    }

    #[test]
    fn a_step_marker_already_there_is_kept_and_only_gains_the_flag() {
        let with_step = vec![
            "hi".to_owned(),
            String::new(),
            "[kasten s-1a2b step 2/4]".to_owned(),
        ];
        assert_eq!(stamp(with_step.clone(), &slide(false), true), with_step);
        assert_eq!(
            stamp(with_step, &slide(true), true)[2],
            "[kasten s-1a2b step 2/4 backup]"
        );
    }
}
