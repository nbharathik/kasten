//! A page's own layout (its font, width and text size) lives in its
//! frontmatter, over the app's defaults. The header op sets each key's
//! one line, takes only the values the app knows, and leaves a value it
//! does not know as it was.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::{Error, set_meta};

const PAGE: &str = "library/layout.md";

fn page(t: &common::TempVault, text: &str) {
    fs::write(t.vault.root().join(PAGE), text).unwrap();
}

#[test]
fn sets_and_clears_a_page_s_font_width_and_text_one_line_each() {
    let t = dev_vault();
    page(
        &t,
        "---\ntitle: Layout\nupdated: 2026-09-01T00:00:00Z\n---\nBody.\n",
    );
    set_meta(&t.vault, PAGE, "font", Some("serif"), NOW).unwrap();
    set_meta(&t.vault, PAGE, "width", Some("full"), NOW).unwrap();
    let after = set_meta(&t.vault, PAGE, "text", Some("small"), NOW).unwrap();
    assert_eq!(
        after.text,
        "---\ntitle: Layout\nupdated: 2026-09-24T08:00:00Z\nfont: serif\nwidth: full\ntext: small\n---\nBody.\n"
    );
    let cleared = set_meta(&t.vault, PAGE, "width", None, NOW).unwrap();
    assert_eq!(
        cleared.text,
        "---\ntitle: Layout\nupdated: 2026-09-24T08:00:00Z\nfont: serif\ntext: small\n---\nBody.\n"
    );
    // Each value the app offers, including the ones that undo a default.
    for (key, value) in [
        ("font", "sans"),
        ("font", "mono"),
        ("width", "normal"),
        ("text", "normal"),
    ] {
        let note = set_meta(&t.vault, PAGE, key, Some(value), NOW).unwrap();
        assert!(note.text.contains(&format!("\n{key}: {value}\n")), "{key}");
    }
}

#[test]
fn refuses_values_the_app_does_not_know() {
    let t = dev_vault();
    page(&t, "---\ntitle: Layout\n---\nBody.\n");
    for (key, bad) in [
        ("font", "comic"),
        ("font", "Serif"),
        ("width", "wide"),
        ("text", "large"),
        ("text", ""),
    ] {
        assert!(
            matches!(
                set_meta(&t.vault, PAGE, key, Some(bad), NOW),
                Err(Error::Invalid(_))
            ),
            "{key}: {bad}"
        );
    }
    assert_eq!(
        fs::read_to_string(t.vault.root().join(PAGE)).unwrap(),
        "---\ntitle: Layout\n---\nBody.\n"
    );
}

#[test]
fn keeps_a_layout_value_it_does_not_know_byte_for_byte() {
    let t = dev_vault();
    let text = "---\ntitle: Layout\nfont:  'Comic Sans'   # mine\nwidth: [wide]\n---\nBody.\n";
    page(&t, text);
    let after = set_meta(&t.vault, PAGE, "icon", Some("🧪"), NOW).unwrap();
    assert!(
        after
            .text
            .contains("font:  'Comic Sans'   # mine\nwidth: [wide]\n"),
        "{}",
        after.text
    );
}
