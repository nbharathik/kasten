//! Comparing a deck with the deck an import makes of the file it was exported
//! to: the same slides in the same places saying the same, to within half a
//! unit and a tenth of a degree. What a file cannot hold is not a difference;
//! the comparison knows what the exporter writes and what it leaves out.
#![allow(dead_code)]

mod elements;
mod style;
mod table;
mod text;

use slides_core::{Deck, Slide};
use slides_pptx::import::Imported;
use slides_pptx::{Options, StepsMode, pages};

use elements::{Pair, compare_lists, expected};

/// What differs, one line each. Empty when the decks are the same.
#[derive(Default)]
pub struct Diff {
    pub items: Vec<String>,
}

impl Diff {
    pub fn note(&mut self, at: &str, message: String) {
        self.items.push(format!("{at}: {message}"));
    }
}

fn near(a: f64, b: f64) -> bool {
    (a - b).abs() <= 0.5
}

/// `[words](address)` as `words (address)`, which is how the exporter writes a link in notes.
fn links_as_words(line: &str) -> String {
    let mut out = String::new();
    let mut rest = line;
    while let Some(open) = rest.find('[') {
        let after = &rest[open + 1..];
        let Some(close) = after.find("](") else { break };
        let Some(end) = after[close + 2..].find(')') else {
            break;
        };
        let (words, address) = (&after[..close], &after[close + 2..close + 2 + end]);
        out.push_str(&rest[..open]);
        out.push_str(words);
        if !address.is_empty() && address != words {
            out.push_str(&format!(" ({address})"));
        }
        rest = &after[close + 2 + end + 1..];
    }
    out.push_str(rest);
    out
}

fn plain_lines(notes: &str) -> Vec<String> {
    let mut out = Vec::new();
    for raw in notes.lines() {
        let mut line = raw.trim().to_owned();
        for marker in ["- ", "• ", "* ", "– ", "▪ "] {
            if let Some(rest) = line.strip_prefix(marker) {
                line = rest.trim().to_owned();
                break;
            }
        }
        let line = links_as_words(line.trim_start_matches('#'));
        let line: String = line
            .chars()
            .filter(|c| !matches!(c, '*' | '_' | '`'))
            .collect();
        let line = line.trim().to_owned();
        if !line.is_empty() {
            out.push(line);
        }
    }
    out
}

fn deck_level(diff: &mut Diff, a: &Deck, b: &Deck) {
    if !near(a.size.w, b.size.w) || !near(a.size.h, b.size.h) {
        diff.note(
            "deck",
            format!("size {:?} came back as {:?}", a.size, b.size),
        );
    }
    if a.title != b.title {
        diff.note(
            "deck",
            format!("title {:?} came back as {:?}", a.title, b.title),
        );
    }
    let (ca, cb) = (&a.theme.colors, &b.theme.colors);
    for (name, x, y) in [
        ("text1", &ca.text1, &cb.text1),
        ("text2", &ca.text2, &cb.text2),
        ("bg1", &ca.bg1, &cb.bg1),
        ("bg2", &ca.bg2, &cb.bg2),
        ("accent1", &ca.accent1, &cb.accent1),
        ("accent2", &ca.accent2, &cb.accent2),
        ("accent3", &ca.accent3, &cb.accent3),
        ("accent4", &ca.accent4, &cb.accent4),
        ("accent5", &ca.accent5, &cb.accent5),
        ("accent6", &ca.accent6, &cb.accent6),
    ] {
        if !x.eq_ignore_ascii_case(y) {
            diff.note("theme", format!("colour {name} {x} came back as {y}"));
        }
    }
    for (name, x, y) in [
        (
            "heading",
            &a.theme.fonts.heading.family,
            &b.theme.fonts.heading.family,
        ),
        (
            "body",
            &a.theme.fonts.body.family,
            &b.theme.fonts.body.family,
        ),
    ] {
        if !x.eq_ignore_ascii_case(y) {
            diff.note("theme", format!("{name} font {x} came back as {y}"));
        }
    }
    layouts(diff, a, b);
}

fn layouts(diff: &mut Diff, a: &Deck, b: &Deck) {
    let names = |d: &Deck| {
        d.theme
            .layouts
            .iter()
            .map(|l| l.name.clone())
            .collect::<Vec<_>>()
    };
    if names(a) != names(b) {
        diff.note(
            "theme",
            format!("layouts {:?} came back as {:?}", names(a), names(b)),
        );
        return;
    }
    for (la, lb) in a.theme.layouts.iter().zip(&b.theme.layouts) {
        let at = format!("layout {}", la.name);
        if la.hide_master != lb.hide_master || la.label != lb.label {
            diff.note(
                &at,
                format!(
                    "label/hide {:?}/{} came back as {:?}/{}",
                    la.label, la.hide_master, lb.label, lb.hide_master
                ),
            );
        }
        let roles = |l: &slides_core::Layout| {
            l.placeholders
                .iter()
                .map(|p| p.role.clone())
                .collect::<Vec<_>>()
        };
        if roles(la) != roles(lb) {
            diff.note(
                &at,
                format!("slots {:?} came back as {:?}", roles(la), roles(lb)),
            );
            continue;
        }
        for (pa, pb) in la.placeholders.iter().zip(&lb.placeholders) {
            let slot = format!("{at}/{}", pa.role);
            if ![(pa.x, pb.x), (pa.y, pb.y), (pa.w, pb.w), (pa.h, pb.h)]
                .iter()
                .all(|(x, y)| near(*x, *y))
            {
                diff.note(
                    &slot,
                    format!(
                        "box {:?} came back as {:?}",
                        (pa.x, pa.y, pa.w, pa.h),
                        (pb.x, pb.y, pb.w, pb.h)
                    ),
                );
            }
            if pa.kind != pb.kind || pa.list != pb.list {
                diff.note(
                    &slot,
                    format!(
                        "kind/list {:?}/{:?} came back as {:?}/{:?}",
                        pa.kind, pa.list, pb.kind, pb.list
                    ),
                );
            }
            let (Some(sa), Some(sb)) = (
                pa.style.as_deref().and_then(|s| a.theme.text_style(s)),
                pb.style.as_deref().and_then(|s| b.theme.text_style(s)),
            ) else {
                continue;
            };
            let hex = |d: &Deck, v: &str| {
                d.theme
                    .resolve_color(v)
                    .unwrap_or_default()
                    .to_ascii_lowercase()
            };
            let family = |d: &Deck, f: &str| match f {
                "heading" => d.theme.fonts.heading.family.to_ascii_lowercase(),
                "code" => "code".to_owned(),
                "body" | "" => d.theme.fonts.body.family.to_ascii_lowercase(),
                other => other.to_ascii_lowercase(),
            };
            let same = near(sa.size, sb.size)
                && hex(a, &sa.color) == hex(b, &sb.color)
                && family(a, &sa.font) == family(b, &sb.font)
                && (sa.bold, sa.italic) == (sb.bold, sb.italic)
                && sa.align.clone().unwrap_or(slides_core::Align::Left)
                    == sb.align.clone().unwrap_or(slides_core::Align::Left);
            if !same {
                diff.note(&slot, format!("text style {sa:?} came back as {sb:?}"));
            }
        }
    }
}

/// Compares the deck `original` with the deck imported from its export. `media_a` gives the pictures the
/// original named; `media_b` the imported deck's.
pub fn compare(
    original: &Deck,
    options: &Options,
    imported: &Imported,
    media_a: &dyn Fn(&str) -> Option<Vec<u8>>,
) -> Vec<String> {
    let mut diff = Diff::default();
    let a = slides_core::composites::expand_deck(original);
    let b = &imported.deck;
    deck_level(&mut diff, &a, b);

    let pages = pages(&a, options);
    if pages.len() != b.slides.len() {
        diff.note(
            "deck",
            format!("{} pages became {} slides", pages.len(), b.slides.len()),
        );
        return diff.items;
    }
    let first_page_of: Vec<Option<usize>> = (0..a.slides.len())
        .map(|s| pages.iter().position(|p| p.slide == s))
        .collect();
    let index_a = |id: &str| a.index_of(id).and_then(|i| first_page_of[i]);
    let index_b = |id: &str| b.index_of(id);
    let media_b = |path: &str| {
        imported
            .media
            .iter()
            .find(|m| m.path == path)
            .map(|m| m.bytes.clone())
    };
    for (n, page) in pages.iter().enumerate() {
        let (sa, sb): (&Slide, &Slide) = (&a.slides[page.slide], &b.slides[n]);
        let at = format!("slide {n}");
        let stepped = options.steps == StepsMode::Expand && sa.steps > 0;
        if (sa.backup, sb.backup) == (true, false) || (sa.backup != sb.backup) {
            diff.note(
                &at,
                format!("backup {} came back as {}", sa.backup, sb.backup),
            );
        }
        if !sa.backup && sa.hidden != sb.hidden {
            diff.note(
                &at,
                format!("hidden {} came back as {}", sa.hidden, sb.hidden),
            );
        }
        if sa.backup && sb.hidden {
            diff.note(&at, "a backup slide came back hidden as well".to_owned());
        }
        if plain_lines(&sa.notes) != plain_lines(&sb.notes) {
            diff.note(
                &at,
                format!(
                    "notes {:?} came back as {:?}",
                    plain_lines(&sa.notes),
                    plain_lines(&sb.notes)
                ),
            );
        }
        if stepped {
            continue;
        }
        if sa.layout != sb.layout {
            diff.note(
                &at,
                format!("layout {} came back as {}", sa.layout, sb.layout),
            );
        }
        let pair = Pair {
            a: (&a, sa),
            b: (b, sb),
            index_a: &index_a,
            index_b: &index_b,
            media_a,
            media_b: &media_b,
        };
        let want = expected(&sa.elements);
        compare_lists(&mut diff, &at, &pair, &want, &sb.elements);
    }
    // Sections, allowing the one the exporter makes for slides before the first.
    let sections = |d: &Deck| {
        d.sections
            .iter()
            .filter_map(|s| d.index_of(&s.starts_at).map(|i| (s.title.clone(), i)))
            .collect::<Vec<_>>()
    };
    let mut got = sections(b);
    if got.first().is_some_and(|(t, _)| t == "Default Section")
        && !sections(&a).iter().any(|(t, _)| t == "Default Section")
    {
        got.remove(0);
    }
    let want: Vec<(String, usize)> = sections(&a)
        .into_iter()
        .filter_map(|(t, i)| first_page_of[i].map(|p| (t, p)))
        .collect();
    if want != got {
        diff.note("deck", format!("sections {want:?} came back as {got:?}"));
    }
    diff.items
}
