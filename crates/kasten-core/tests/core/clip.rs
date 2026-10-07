//! The web clipper keeps a page's article as an inbox card, with the
//! address it came from, in one commit.

use crate::common;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::Actor;

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

#[test]
fn keeps_a_page_as_an_inbox_card() {
    let (_t, k) = open();
    let commits = k.log(None, 500).unwrap().len();
    let page = "<html><head><title>Slip-box basics</title></head><body><nav>Menu</nav><article><h1>Slip-box basics</h1><p>One idea per <a href=\"/notes\">note</a>.</p></article></body></html>";
    let note = k
        .clip(
            &Actor::Human,
            "https://example.com/guide/slip-box",
            page,
            NOW,
        )
        .unwrap();
    assert_eq!(note.meta.path, "inbox/slip-box-basics.md");
    assert_eq!(
        (note.meta.kind.as_str(), note.meta.title.as_str()),
        ("card", "Slip-box basics")
    );
    assert!(
        note.text
            .contains("\nurl: https://example.com/guide/slip-box\n"),
        "{}",
        note.text
    );
    assert!(
        note.text.ends_with("---\nOne idea per [note](https://example.com/notes).\n\nClipped from [example.com](https://example.com/guide/slip-box) on 2026-09-24.\n"),
        "{}",
        note.text
    );
    let log = k.log(None, 500).unwrap();
    assert_eq!(log.len(), commits + 1);
    assert_eq!(log[0].summary, "clip: Slip-box basics");
    assert!(!k.search("slip", 10).unwrap().is_empty());
}

#[test]
fn refuses_a_page_with_nothing_to_keep() {
    let (_t, k) = open();
    let commits = k.log(None, 500).unwrap().len();
    let empty = "<html><body><nav>Menu</nav><script>app()</script></body></html>";
    assert!(
        k.clip(&Actor::Human, "https://example.com/app", empty, NOW)
            .is_err()
    );
    assert_eq!(k.log(None, 500).unwrap().len(), commits);
}

#[test]
fn clips_a_page_nested_deeper_than_any_stack() {
    // Unclosed tags nest every later one inside the last: a walk over such a
    // tree once ran out of stack and took the whole app down.
    let mut page = String::from("<html><body><article><h1>Deep</h1>");
    page.push_str(&"<span>".repeat(200_000));
    page.push_str("<p>At the bottom.</p></article></body></html>");
    let clipped = kasten_core::clip::clip("https://example.com/deep", &page);
    assert_eq!(clipped.title, "Deep");
    assert!(
        clipped.markdown.contains("At the bottom."),
        "{}",
        clipped.markdown
    );
}
