use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::*;

fn scratch(name: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "slides-render-refs-{name}-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

#[test]
fn the_bib_files_of_a_folder_are_read_in_the_order_of_their_names() {
    let dir = scratch("order");
    fs::write(dir.join("b.bib"), "@misc{b}").unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("a.BIB"), "@misc{a}").unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("notes.txt"), "@misc{not-this}").unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("talk.deck"), "{}").unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(in_folder(&dir).as_deref(), Some("@misc{a}\n@misc{b}\n"));
}

#[test]
fn a_folder_without_a_bibliography_gives_none_and_so_does_one_that_is_not_there() {
    let dir = scratch("none");
    fs::write(dir.join("talk.deck"), "{}").unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(in_folder(&dir), None);
    assert_eq!(in_folder(&dir.join("missing")), None);
    // A folder named like a bibliography is not one.
    fs::create_dir(dir.join("refs.bib")).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(in_folder(&dir), None);
}

#[test]
fn only_so_many_files_of_so_many_bytes_are_read() {
    let dir = scratch("caps");
    for n in 0..12 {
        fs::write(dir.join(format!("f{n:02}.bib")), format!("@misc{{k{n}}}"))
            .unwrap_or_else(|e| panic!("{e}"));
    }
    let text = in_folder(&dir).unwrap_or_default();
    assert_eq!(text.matches("@misc").count(), MOST_FILES);
    assert!(text.contains("k7") && !text.contains("k8}"), "{text}");
    let big = scratch("big");
    fs::write(
        big.join("huge.bib"),
        vec![b'x'; usize::try_from(MOST_BYTES).unwrap_or(0) + 1],
    )
    .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(in_folder(&big), None, "a file over the limit is left out");
    fs::write(big.join("ok.bib"), "@misc{ok}").unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(in_folder(&big).as_deref(), Some("@misc{ok}\n"));
}
