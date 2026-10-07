//! Reading an outline.

use super::slide;
use crate::outline::{Outline, OutlineSlide, parse_outline};

fn outline(title: &str, slides: Vec<OutlineSlide>) -> Outline {
    Outline {
        title: title.to_owned(),
        slides,
    }
}

#[test]
fn the_first_title_line_is_the_deck_title() {
    assert_eq!(parse_outline(""), Outline::default());
    assert_eq!(parse_outline("# Deck\n"), outline("Deck", vec![]));
    assert_eq!(parse_outline("#\n"), outline("", vec![]));
    assert_eq!(parse_outline("## A\n"), outline("", vec![slide("A", &[])]));
    // Only the first counts, and only before the first slide.
    assert_eq!(parse_outline("# One\n# Two\n"), outline("One", vec![]));
    assert_eq!(
        parse_outline("## A\n# Two\n"),
        outline("", vec![slide("A", &["# Two"])])
    );
    assert_eq!(parse_outline("# *Marked* up\n").title, "Marked up");
}

#[test]
fn text_before_the_first_slide_is_ignored() {
    let md = "Some words.\n\n# Deck\n\nAn introduction\n- with a list\n\n## A\n- x\n";
    assert_eq!(
        parse_outline(md),
        outline("Deck", vec![slide("A", &["- x"])])
    );
}

#[test]
fn every_two_hash_line_starts_a_slide() {
    let md = "# D\n\n## One\n- a\n- b\n\n## Two\nplain\n\n##\n\n### not a slide\n";
    let got = parse_outline(md);
    assert_eq!(got.slides.len(), 3);
    assert_eq!(got.slides[0], slide("One", &["- a\n- b"]));
    assert_eq!(got.slides[1], slide("Two", &["plain"]));
    assert_eq!(got.slides[2], slide("", &["### not a slide"]));
}

#[test]
fn blocks_are_the_runs_of_lines_between_blank_lines() {
    let md = "## A\n- a\n- b\n\nsecond block\nstill it\n\n\n\nthird\n";
    assert_eq!(
        parse_outline(md).slides,
        vec![slide("A", &["- a\n- b", "second block\nstill it", "third"])]
    );
}

#[test]
fn a_fenced_block_is_one_block_even_with_blank_lines() {
    let md = "## Code\n```rust\nfn a() {}\n\n## not a slide\n\nfn b() {}\n```\nafter\n\nnext\n";
    let got = parse_outline(md);
    assert_eq!(got.slides.len(), 1);
    assert_eq!(
        got.slides[0],
        slide(
            "Code",
            &[
                "```rust\nfn a() {}\n\n## not a slide\n\nfn b() {}\n```\nafter",
                "next"
            ]
        )
    );
}

#[test]
fn notes_run_from_a_notes_line_to_the_next_slide() {
    let md = "## A\n- x\n\nNotes:\nSay this.\n\nAnd this, with a **list**:\n- one\n\n## B\ntext\nnotes:\nlate\n";
    let got = parse_outline(md);
    assert_eq!(got.slides[0].blocks, slide("A", &["- x"]).blocks);
    assert_eq!(
        got.slides[0].notes,
        "Say this.\n\nAnd this, with a **list**:\n- one"
    );
    // The line is `Notes:` in any case.
    assert_eq!(got.slides[1].blocks, slide("B", &["text"]).blocks);
    assert_eq!(got.slides[1].notes, "late");
    assert_eq!(parse_outline("## A\nNOTES:\nx").slides[0].notes, "x");
    assert_eq!(parse_outline("## A\nNotes:\n\n\n").slides[0].notes, "");
    // A second one is part of the notes; so is a heading of one hash.
    assert_eq!(
        parse_outline("## A\nNotes:\none\nNotes:\ntwo\n# three").slides[0].notes,
        "one\nNotes:\ntwo\n# three"
    );
    // Only a line that is nothing else.
    assert_eq!(parse_outline("## A\nNotes: not yet").slides[0].notes, "");
    assert_eq!(
        parse_outline("## A\nNotes: not yet").slides[0].blocks.len(),
        1
    );
}

#[test]
fn a_notes_line_or_heading_inside_a_fence_is_only_text() {
    let md = "## A\n```\nNotes:\n## B\n```\n\nNotes:\n```\n## C\n```\ndone\n";
    let got = parse_outline(md);
    assert_eq!(got.slides.len(), 1);
    assert_eq!(
        got.slides[0].blocks,
        slide("A", &["```\nNotes:\n## B\n```"]).blocks
    );
    assert_eq!(got.slides[0].notes, "```\n## C\n```\ndone");
}

#[test]
fn a_heading_in_notes_is_kept_with_a_backslash_in_front() {
    let md = "## A\nNotes:\n\\## Questions\n\\\\## slash\nplain\n## B\n";
    let got = parse_outline(md);
    assert_eq!(got.slides.len(), 2);
    assert_eq!(got.slides[0].notes, "## Questions\n\\## slash\nplain");
}

#[test]
fn a_comment_on_the_slide_line_sets_the_layout_and_flags() {
    let got = parse_outline(
        "## A <!-- layout: two-columns, hidden, backup -->\n## B <!--hidden-->\n## C <!-- layout: code -->\n## D <!-- what, layout:x , BACKUP -->\n## E <!-- -->\n",
    );
    let s = &got.slides;
    assert_eq!(s[0].title, "A");
    assert_eq!(s[0].layout.as_deref(), Some("two-columns"));
    assert!(s[0].hidden && s[0].backup);
    assert!(s[1].hidden && !s[1].backup && s[1].layout.is_none());
    assert_eq!(s[2].layout.as_deref(), Some("code"));
    assert!(!s[2].hidden && !s[2].backup);
    assert_eq!(s[3].layout.as_deref(), Some("x"));
    assert!(s[3].backup && !s[3].hidden);
    assert_eq!(s[4], slide("E", &[]));
}

#[test]
fn slide_titles_are_plain_text() {
    let got = parse_outline(
        "## A **bold** and *it* with `code`, [a link](https://x.y) and $m$\n## Escaped \\* star \\<!-- not a comment -->\n## Trailing   \n",
    );
    assert_eq!(got.slides[0].title, "A bold and it with code, a link and m");
    assert_eq!(got.slides[1].title, "Escaped * star <!-- not a comment -->");
    assert_eq!(got.slides[1].layout, None);
    assert_eq!(got.slides[2].title, "Trailing");
}

#[test]
fn a_block_that_is_only_a_comment_is_dropped() {
    let md = "## A\n- x\n\n<!-- 2 other elements -->\n\nNotes:\nn\n";
    let got = parse_outline(md);
    assert_eq!(got.slides[0].blocks, slide("A", &["- x"]).blocks);
    assert_eq!(got.slides[0].notes, "n");
}

#[test]
fn windows_line_endings_read_the_same() {
    let unix = "# D\n\n## A <!-- hidden -->\n- x\n\nNotes:\nn\n";
    assert_eq!(
        parse_outline(&unix.replace('\n', "\r\n")),
        parse_outline(unix)
    );
}

#[test]
fn a_block_can_hold_headings_quotes_and_hard_breaks() {
    let got = parse_outline("## A\n### Deep\n> quoted\none  \ntwo\n");
    assert_eq!(
        got.slides[0].blocks,
        slide("A", &["### Deep\n> quoted\none  \ntwo"]).blocks
    );
    assert_eq!(got.slides[0].blocks[0].len(), 3);
}

#[test]
fn a_heading_needs_its_marks_at_the_start_of_the_line_and_a_space_after() {
    let md = "#Title\n## A\n ## indented\n##tight\n#### four\n\\## escaped\n";
    let got = parse_outline(md);
    assert_eq!(got.title, "");
    assert_eq!(got.slides.len(), 1);
    assert_eq!(
        got.slides[0],
        slide("A", &[" ## indented\n##tight\n#### four\n\\## escaped"])
    );
}

#[test]
fn slides_come_in_the_order_they_are_written_and_may_be_empty() {
    let got = parse_outline("## 1\n## 2\n\n\n## 3\nx\n## 4\nNotes:\n## 5\n");
    let titles: Vec<&str> = got.slides.iter().map(|s| s.title.as_str()).collect();
    assert_eq!(titles, ["1", "2", "3", "4", "5"]);
    assert!(got.slides[0].blocks.is_empty() && got.slides[1].blocks.is_empty());
    assert_eq!(got.slides[2].blocks.len(), 1);
    assert!(got.slides[3].blocks.is_empty() && got.slides[3].notes.is_empty());
}

#[test]
fn nothing_but_a_notes_line_and_words_after_it_makes_notes() {
    let got = parse_outline("## A\n- x\nNotes:\n- y\n\nz\n");
    // No blank line before the marker is needed: the block ends there.
    assert_eq!(got.slides[0].blocks, slide("A", &["- x"]).blocks);
    assert_eq!(got.slides[0].notes, "- y\n\nz");
}

#[test]
fn a_comment_in_the_middle_of_a_title_or_a_broken_one_is_only_words() {
    let got = parse_outline("## A <!-- hidden --> B\n## C <!-- hidden\n## D <!-- hidden -->  \n");
    assert_eq!(got.slides[0].title, "A <!-- hidden --> B");
    assert!(!got.slides[0].hidden);
    assert_eq!(got.slides[1].title, "C <!-- hidden");
    assert_eq!(got.slides[2].title, "D");
    assert!(got.slides[2].hidden);
}
