//! `slides export`: a deck to a PowerPoint file, with its pictures read from a folder.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// A real PNG, 3 by 2 pixels.
const PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0x12, 0x16, 0xf1,
    0x4d, 0x00, 0x00, 0x00, 0x15, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x94, 0xab, 0x38, 0xc1,
    0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc4, 0x00, 0x03, 0x00, 0x18, 0x2e, 0x01, 0x62, 0x87, 0x96,
    0x3e, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

fn slides(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_slides"))
        .args(args)
        .output()
        .expect("the slides binary runs")
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-export-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

/// A deck in `dir` with a title slide and a blank one that holds a picture named `src`.
fn deck_with_picture(dir: &Path, src: &str) -> PathBuf {
    let deck = dir.join("talk.deck");
    let deck_arg = deck.to_str().unwrap_or_default();
    assert!(
        slides(&["new", deck_arg, "--title", "Export me"])
            .status
            .success()
    );
    let added = slides(&[
        "op",
        deck_arg,
        "add_slide",
        r#"{"layout":"blank","notes":"say hello"}"#,
    ]);
    assert!(added.status.success(), "{}", text(&added.stderr));
    let slide = text(&added.stdout)
        .split('"')
        .skip_while(|s| *s != "slide")
        .nth(2)
        .unwrap_or_default()
        .to_owned();
    let element = format!(
        r#"{{"slide":"{slide}","elements":[{{"type":"image","x":100,"y":100,"w":300,"h":200,"src":"{src}","alt":"A picture"}}]}}"#
    );
    let placed = slides(&["op", deck_arg, "add_elements", &element]);
    assert!(placed.status.success(), "{}", text(&placed.stderr));
    deck
}

/// The names of the entries of a zip file.
fn entries(file: &Path) -> Vec<String> {
    let bytes = fs::read(file).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
    assert!(bytes.starts_with(b"PK"), "not a zip");
    let names = String::from_utf8_lossy(&bytes);
    [
        "[Content_Types].xml",
        "ppt/presentation.xml",
        "ppt/slides/slide2.xml",
        "ppt/media/image1.png",
        "ppt/notesSlides/notesSlide2.xml",
    ]
    .iter()
    .filter(|n| names.contains(*n))
    .map(|n| (*n).to_owned())
    .collect()
}

#[test]
fn exports_a_deck_with_its_pictures_from_the_decks_folder() {
    let dir = temp("here");
    fs::create_dir_all(dir.join("assets")).unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("assets/figure.png"), PNG).unwrap_or_else(|e| panic!("{e}"));
    let deck = deck_with_picture(&dir, "assets/figure.png");
    let out = dir.join("talk.pptx");
    let run = slides(&[
        "export",
        deck.to_str().unwrap_or_default(),
        "-o",
        out.to_str().unwrap_or_default(),
    ]);
    assert!(run.status.success(), "{}", text(&run.stderr));
    assert!(
        text(&run.stdout).contains("Wrote") && text(&run.stdout).contains("2 slides"),
        "{}",
        text(&run.stdout)
    );
    assert!(
        text(&run.stderr).is_empty(),
        "no warnings: {}",
        text(&run.stderr)
    );
    assert_eq!(
        entries(&out),
        [
            "[Content_Types].xml",
            "ppt/presentation.xml",
            "ppt/slides/slide2.xml",
            "ppt/media/image1.png",
            "ppt/notesSlides/notesSlide2.xml"
        ]
    );
    assert!(!dir.join("talk.pptx.tmp").exists());
}

#[test]
fn the_assets_folder_can_be_named_and_the_output_defaults_to_the_deck_name() {
    let dir = temp("named");
    let deck = deck_with_picture(&dir, "figure.png");
    let store = dir.join("store");
    fs::create_dir_all(&store).unwrap_or_else(|e| panic!("{e}"));
    fs::write(store.join("figure.png"), PNG).unwrap_or_else(|e| panic!("{e}"));
    let run = slides(&[
        "export",
        deck.to_str().unwrap_or_default(),
        "--assets",
        store.to_str().unwrap_or_default(),
    ]);
    assert!(run.status.success(), "{}", text(&run.stderr));
    assert!(entries(&dir.join("talk.pptx")).contains(&"ppt/media/image1.png".to_owned()));
}

#[test]
fn a_picture_that_is_not_in_the_folder_is_a_warning_and_never_read_from_elsewhere() {
    let dir = temp("escape");
    let folder = dir.join("deck");
    fs::create_dir_all(&folder).unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("secret.png"), PNG).unwrap_or_else(|e| panic!("{e}"));
    for src in [
        "../secret.png",
        "/nonexistent-absolute.png",
        "sub/../../secret.png",
    ] {
        let deck = deck_with_picture(&folder, src);
        let out = folder.join("out.pptx");
        let run = slides(&[
            "export",
            deck.to_str().unwrap_or_default(),
            "-o",
            out.to_str().unwrap_or_default(),
        ]);
        assert!(run.status.success(), "{src}: {}", text(&run.stderr));
        assert!(
            text(&run.stderr).contains("warning") && text(&run.stderr).contains("not found"),
            "{src}: {}",
            text(&run.stderr)
        );
        assert!(
            !entries(&out).contains(&"ppt/media/image1.png".to_owned()),
            "{src}: the picture was read"
        );
        fs::remove_file(&deck).unwrap_or_else(|e| panic!("{e}"));
    }
}

#[test]
fn says_what_is_wrong_when_there_is_no_deck_or_the_assets_folder_is_missing() {
    let none = slides(&["export"]);
    assert_eq!(none.status.code(), Some(2));
    let dir = temp("errors");
    let deck = deck_with_picture(&dir, "a.png");
    let bad = slides(&[
        "export",
        deck.to_str().unwrap_or_default(),
        "--assets",
        "/no/such/folder",
    ]);
    assert_eq!(bad.status.code(), Some(1));
    assert!(
        text(&bad.stderr).contains("assets folder"),
        "{}",
        text(&bad.stderr)
    );
    let missing = slides(&["export", dir.join("nope.deck").to_str().unwrap_or_default()]);
    assert_eq!(missing.status.code(), Some(1));
}

/// A deck of a title slide and a slide with two clicks, made through the command.
fn deck_with_steps(dir: &Path) -> PathBuf {
    let deck = dir.join("steps.deck");
    let deck_arg = deck.to_str().unwrap_or_default();
    assert!(
        slides(&["new", deck_arg, "--title", "Steps"])
            .status
            .success()
    );
    let added = slides(&[
        "op",
        deck_arg,
        "add_slide",
        r#"{"layout":"title-only","content":{"title":"ReAct"}}"#,
    ]);
    assert!(added.status.success(), "{}", text(&added.stderr));
    let slide = text(&added.stdout)
        .split('"')
        .skip_while(|s| *s != "slide")
        .nth(2)
        .unwrap_or_default()
        .to_owned();
    let steps = slides(&[
        "op",
        deck_arg,
        "set_slide_steps",
        &format!(r#"{{"slide":"{slide}","steps":2}}"#),
    ]);
    assert!(steps.status.success(), "{}", text(&steps.stderr));
    deck
}

/// The slides of a .pptx, counted by the parts it holds.
fn slide_parts(file: &Path) -> usize {
    let bytes = fs::read(file).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
    let names = String::from_utf8_lossy(&bytes);
    (1..=20)
        .filter(|n| names.contains(&format!("ppt/slides/slide{n}.xml")))
        .count()
}

#[test]
fn a_slide_with_steps_is_a_slide_for_each_state_unless_final_is_asked_for() {
    let dir = temp("steps");
    let deck = deck_with_steps(&dir);
    let deck_arg = deck.to_str().unwrap_or_default();
    let all = dir.join("all.pptx");
    let run = slides(&["export", deck_arg, "-o", all.to_str().unwrap_or_default()]);
    assert!(run.status.success(), "{}", text(&run.stderr));
    assert_eq!(slide_parts(&all), 1 + 3);
    assert!(
        text(&run.stdout).contains("4 slides from 2 in the deck"),
        "says why there are more: {}",
        text(&run.stdout)
    );
    for spelled in [["--steps", "expand"], ["--steps=expand", ""]] {
        let same = dir.join("same.pptx");
        let mut args = vec!["export", deck_arg, "-o", same.to_str().unwrap_or_default()];
        args.extend(spelled.iter().filter(|s| !s.is_empty()));
        assert!(slides(&args).status.success());
        assert_eq!(slide_parts(&same), 4);
    }
    let last = dir.join("last.pptx");
    let run = slides(&[
        "export",
        deck_arg,
        "-o",
        last.to_str().unwrap_or_default(),
        "--steps",
        "final",
    ]);
    assert!(run.status.success(), "{}", text(&run.stderr));
    assert_eq!(slide_parts(&last), 2);
    assert!(
        text(&run.stdout).contains("2 slides,"),
        "{}",
        text(&run.stdout)
    );
}

#[test]
fn any_other_word_for_steps_is_a_usage_error_that_says_the_two() {
    let dir = temp("steps-bad");
    let deck = deck_with_steps(&dir);
    let run = slides(&[
        "export",
        deck.to_str().unwrap_or_default(),
        "--steps",
        "all",
    ]);
    assert_eq!(run.status.code(), Some(2));
    let words = text(&run.stderr);
    assert!(
        words.contains("expand") && words.contains("final") && words.contains("all"),
        "{words}"
    );
    assert!(!dir.join("steps.pptx").exists(), "nothing was written");
}
