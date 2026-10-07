//! A citation is drawn as the work it names, from the `.bib` files beside the deck, and as its key where there are
//! none: through the binary and a real browser (the test says so and passes where there is none). What is read is
//! the text of the page the browser made, never pixels.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde_json::{Value, json};

const BIB: &str = "\
@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}
";

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

fn temp(name: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("slides-drawn-cited-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

/// `slides ...`; where the tests run as the administrator the browser's sandbox, which it cannot use there, is
/// switched off as the message to a person says to.
fn slides(args: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_slides"));
    command.args(args);
    if slides_render::private::running_as_root() {
        command.env("SLIDES_RENDER_NO_SANDBOX", "1");
    }
    command
        .output()
        .unwrap_or_else(|e| panic!("the slides binary runs: {e}"))
}

fn has_browser() -> bool {
    match (
        slides_render::find_browser(),
        slides_render::bundle::Page::locate(),
    ) {
        (Ok(_), Some(_)) => true,
        (browser, page) => {
            eprintln!(
                "SKIPPED: no browser ({}) or no page ({})",
                browser.err().map(|e| e.to_string()).unwrap_or_default(),
                page.is_none()
            );
            false
        }
    }
}

fn op(deck: &Path, name: &str, input: &Value) -> Value {
    let done = slides(&[
        "op",
        deck.to_str().unwrap_or_default(),
        name,
        &input.to_string(),
    ]);
    assert!(done.status.success(), "{name}: {}", text(&done.stderr));
    serde_json::from_slice(&done.stdout).unwrap_or_else(|e| panic!("{e}"))
}

/// A deck of one blank slide that cites one work.
fn cited_deck(dir: &Path) -> PathBuf {
    let deck = dir.join("talk.deck");
    let made = slides(&["new", deck.to_str().unwrap_or_default(), "--title", "Cited"]);
    assert!(made.status.success(), "{}", text(&made.stderr));
    let added = op(&deck, "add_slide", &json!({ "layout": "blank" }));
    let cite = json!({ "type": "citation", "id": "c1", "x": 64, "y": 400, "w": 800, "h": 32, "keys": ["vaswani2017attention"] });
    op(
        &deck,
        "add_elements",
        &json!({ "slide": added["slide"], "elements": [cite] }),
    );
    deck
}

/// The offline web page of the deck, as the text that was written.
fn web_page(deck: &Path) -> String {
    let out = deck.with_extension("html");
    let done = slides(&[
        "export",
        deck.to_str().unwrap_or_default(),
        "-o",
        out.to_str().unwrap_or_default(),
    ]);
    assert!(done.status.success(), "{}", text(&done.stderr));
    fs::read_to_string(&out).unwrap_or_else(|e| panic!("{e}"))
}

#[test]
fn a_citation_is_written_from_the_bib_file_beside_the_deck_and_is_its_key_without_one() {
    if !has_browser() {
        return;
    }
    let with = temp("with");
    let deck = cited_deck(&with);
    fs::write(with.join("refs.bib"), BIB).unwrap_or_else(|e| panic!("{e}"));
    let page = web_page(&deck);
    assert!(
        page.contains("Vaswani et al., 2017 (NeurIPS)"),
        "the work is written out"
    );
    assert!(
        !page.contains("(vaswani2017attention)"),
        "the key is not what is drawn"
    );

    // The same deck in a folder with no bibliography: the key is drawn as it is.
    let without = temp("without");
    let copy = without.join("talk.deck");
    fs::copy(&deck, &copy).unwrap_or_else(|e| panic!("{e}"));
    let page = web_page(&copy);
    assert!(page.contains("(vaswani2017attention)"), "the key is drawn");
    assert!(!page.contains("Vaswani et al."));
    let _ = fs::remove_dir_all(&with);
    let _ = fs::remove_dir_all(&without);
}
