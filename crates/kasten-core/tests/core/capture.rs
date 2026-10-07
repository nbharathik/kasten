//! Quick captures keep each line once: a plain first line is the title and
//! the rest is the body, so a short thought is one clean card and a long one
//! a page with a real title.

use kasten_core::Kasten;
use kasten_core::history::Actor;

use crate::common::{NOW, dev_vault};

/// The captured card's title and body, for `markdown`.
fn captured(markdown: &str) -> (String, String) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let note = k.capture(&Actor::Human, markdown, &[], NOW).unwrap();
    let body = note
        .text
        .split_once("\n---\n")
        .map(|(_, b)| b.to_owned())
        .unwrap();
    (note.meta.title, body)
}

#[test]
fn a_one_line_thought_is_a_title_alone() {
    assert_eq!(captured("Buy milk"), ("Buy milk".into(), String::new()));
    assert_eq!(
        captured("  Buy milk  \n\n"),
        ("Buy milk".into(), String::new())
    );
    // A title drops one closing full stop, as headlines do; ? ! and … stay.
    assert_eq!(captured("Buy milk.").0, "Buy milk");
    assert_eq!(captured("Is it done?").0, "Is it done?");
    assert_eq!(captured("Wait...").0, "Wait...");
}

#[test]
fn the_first_line_becomes_the_title_and_is_not_repeated() {
    assert_eq!(
        captured("Call the **printer** about toner\nThey open at nine."),
        (
            "Call the printer about toner".into(),
            "They open at nine.\n".into()
        )
    );
    assert_eq!(
        captured("# Weekly plan\n\n- [ ] Draft the intro\n- [ ] Book the room"),
        (
            "Weekly plan".into(),
            "- [ ] Draft the intro\n- [ ] Book the room\n".into()
        )
    );
}

#[test]
fn a_first_line_that_would_lose_something_stays_in_the_body() {
    // A to-do keeps its box, a link its address, code and math their marks.
    for markdown in [
        "- [ ] Call the venue\n- [ ] Pack",
        "Read [the paper](https://example.org/p) tonight",
        "Look at [[Zettelkasten method]] again",
        "Try `cargo bench` on the laptop",
        "> A quote to keep",
    ] {
        let (title, body) = captured(markdown);
        assert!(!title.is_empty(), "{markdown}");
        assert_eq!(body, format!("{markdown}\n"), "{markdown}");
    }
}

#[test]
fn a_long_first_line_splits_after_its_first_sentence() {
    let (title, body) = captured(
        "Photos pile up because nobody sorts them. A weekly ten-minute review might fix that, if it is easy to start.",
    );
    assert_eq!(title, "Photos pile up because nobody sorts them");
    assert_eq!(
        body,
        "A weekly ten-minute review might fix that, if it is easy to start.\n"
    );
}

#[test]
fn a_long_line_with_no_sentence_to_split_keeps_all_of_it_in_the_body() {
    let long = "Notes we never find again are the real cost of keeping notes and the reason search matters so much to people";
    let (title, body) = captured(long);
    assert!(title.ends_with('…'), "{title}");
    assert!(title.chars().count() <= 81, "{title}");
    assert!(long.starts_with(title.trim_end_matches('…')), "{title}");
    assert_eq!(body, format!("{long}\n"));
}

#[test]
fn an_excerpt_skips_a_first_line_that_repeats_the_title() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    let excerpt = |path: &str, text: &str| {
        std::fs::write(t.vault.root().join(path), text).unwrap();
        k.read(path).unwrap().meta.excerpt
    };
    // Captured before titles stopped repeating: the file stays as it is.
    assert_eq!(
        excerpt(
            "inbox/old.md",
            "---\ntitle: Buy milk\ntype: card\n---\nBuy milk\nFrom the corner shop.\n"
        ),
        "From the corner shop."
    );
    assert_eq!(
        excerpt(
            "library/h1.md",
            "---\ntitle: Weekly plan\n---\n# Weekly plan\n\nDraft the intro.\n"
        ),
        "Draft the intro."
    );
    // A first line that only starts like the title is text of its own.
    assert_eq!(
        excerpt(
            "library/other.md",
            "---\ntitle: Buy\n---\nBuy milk today.\n"
        ),
        "Buy milk today."
    );
    assert_eq!(
        std::fs::read_to_string(t.vault.root().join("inbox/old.md")).unwrap(),
        "---\ntitle: Buy milk\ntype: card\n---\nBuy milk\nFrom the corner shop.\n"
    );
}
