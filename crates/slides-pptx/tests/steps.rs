//! A slide with steps in the file: a slide for each state, drawn as the editor draws that
//! step, with its title and notes saying which, and the flags, sections and links that go
//! with its slide.

mod common;

use serde_json::{Value, json};
use slides_core::{Deck, Section};
use slides_pptx::{Options, StepsMode};

use common::inspect::{self, Package, package_with, root_attributes};
use common::{Builder, Files};

/// A rounded box with a label, fill and the theme's text colour.
fn card(label: &str, x: f64) -> Value {
    json!({
        "type": "shape", "shape": "roundRect", "x": x, "y": 200, "w": 240, "h": 120,
        "style": { "fill": { "color": "accent2" } },
        "text": { "paragraphs": [{ "runs": [{ "t": label }] }], "valign": "middle" }
    })
}

/// Four slides: the title slide, a plain one, `ReAct` with three boxes that appear one by one
/// (and notes), and a last one. Its pages are 1, 2, then 3 to 6, then 7.
struct Fixture {
    deck: Deck,
    stepped: String,
    plain: String,
}

fn fixture() -> Fixture {
    let mut b = Builder::new("Light", "Steps", 21);
    let plain = b.slide("title-only", json!({ "title": "Plain" }));
    let stepped = b.slide("title-only", json!({ "title": "ReAct" }));
    b.notes(&stepped.id, "Say hello.");
    let boxes = b.add(
        &stepped.id,
        json!([card("one", 40.0), card("two", 340.0), card("three", 640.0)]),
    );
    b.apply(
        "build_steps",
        json!({ "slide": stepped.id, "ids": boxes, "recipe": "reveal" }),
    );
    b.slide("title-only", json!({ "title": "Tail" }));
    Fixture {
        deck: b.deck(),
        stepped: stepped.id,
        plain: plain.id,
    }
}

fn export(deck: &Deck, options: &Options) -> Package {
    package_with(deck, &Files::default(), options)
}

fn slide_xml(package: &Package, number: usize) -> String {
    String::from_utf8_lossy(&package.parts[&format!("ppt/slides/slide{number}.xml")]).into_owned()
}

fn notes_xml(package: &Package, number: usize) -> Option<String> {
    package
        .parts
        .get(&format!("ppt/notesSlides/notesSlide{number}.xml"))
        .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
}

fn shows(xml: &str, words: &str) -> bool {
    xml.contains(&format!("<a:t>{words}</a:t>"))
}

fn problems(package: &Package) -> Vec<String> {
    inspect::problems(package)
}

#[test]
fn a_slide_with_steps_is_a_slide_for_each_state() {
    let Fixture { deck, .. } = fixture();
    let package = export(&deck, &Options::default());
    // The title slide, the plain one, the four states of the stepped one, and the last.
    assert_eq!(inspect::slide_names(&package).len(), 1 + 1 + 4 + 1);
    let app = String::from_utf8_lossy(&package.parts["docProps/app.xml"]).into_owned();
    assert!(app.contains("<Slides>7</Slides>"), "{app}");
    assert_eq!(problems(&package), Vec::<String>::new());
}

#[test]
fn each_page_draws_the_state_of_its_step() {
    let Fixture { deck, .. } = fixture();
    let package = export(&deck, &Options::default());
    for (step, boxes) in [
        (0, vec![]),
        (1, vec!["one"]),
        (2, vec!["one", "two"]),
        (3, vec!["one", "two", "three"]),
    ] {
        let xml = slide_xml(&package, 3 + step);
        for label in ["one", "two", "three"] {
            assert_eq!(
                shows(&xml, label),
                boxes.contains(&label),
                "{label} on the page for step {step}"
            );
        }
    }
    // The slides around it are as they were.
    assert!(shows(&slide_xml(&package, 2), "Plain"));
    assert!(shows(&slide_xml(&package, 7), "Tail"));
}

#[test]
fn a_title_says_which_page_it_is_in_the_file_only() {
    let Fixture { deck, .. } = fixture();
    let before = slides_core::canonical::write(&deck).unwrap_or_default();
    let package = export(&deck, &Options::default());
    for step in 0..=3 {
        let xml = slide_xml(&package, 3 + step);
        assert!(shows(&xml, "ReAct"), "{xml}");
        assert!(shows(&xml, &format!(" ({}/4)", step + 1)), "{xml}");
    }
    for plain in [1, 2, 7] {
        assert!(
            !slide_xml(&package, plain).contains(" (1/"),
            "slide {plain}"
        );
    }
    assert_eq!(
        slides_core::canonical::write(&deck).unwrap_or_default(),
        before
    );
}

#[test]
fn the_notes_of_each_page_are_the_slides_and_then_a_marker_naming_the_page() {
    let Fixture {
        deck,
        stepped,
        plain,
    } = fixture();
    let package = export(&deck, &Options::default());
    for step in 0..=3 {
        let notes = notes_xml(&package, 3 + step).unwrap_or_default();
        assert!(shows(&notes, "Say hello."), "{notes}");
        assert!(
            shows(&notes, &format!("[kasten {stepped} step {}/4]", step + 1)),
            "{notes}"
        );
        assert!(
            notes.find("Say hello.") < notes.find("[kasten"),
            "the marker comes last"
        );
    }
    // A slide with no notes of its own has a page that holds only the marker naming it.
    let bare = notes_xml(&package, 2).unwrap_or_default();
    assert!(
        shows(&bare, &format!("[kasten {plain}]")) && !bare.contains("step"),
        "{bare}"
    );
    for other in [1, 2, 7] {
        let notes = notes_xml(&package, other).unwrap_or_default();
        assert!(!shows(&notes, "Say hello."), "slide {other}: {notes}");
    }
    let without = export(
        &deck,
        &Options {
            notes: false,
            ..Options::default()
        },
    );
    assert!(without.parts.keys().all(|name| !name.contains("notes")));
    assert_eq!(problems(&without), Vec::<String>::new());
}

#[test]
fn a_slide_with_steps_and_no_notes_still_has_the_marker() {
    let mut b = Builder::new("Light", "Bare", 5);
    let slide = b.slide("title-only", json!({ "title": "Bare" }));
    b.apply("set_slide_steps", json!({ "slide": slide.id, "steps": 1 }));
    let package = export(&b.deck(), &Options::default());
    let notes = notes_xml(&package, 3).unwrap_or_default();
    assert!(
        shows(&notes, &format!("[kasten {} step 2/2]", slide.id)),
        "{notes}"
    );
}

#[test]
fn hidden_and_backup_flags_go_to_every_page_of_a_slide() {
    let Fixture {
        mut deck, stepped, ..
    } = fixture();
    let at = deck.index_of(&stepped).unwrap_or_default();
    deck.slides[at].hidden = true;
    let package = export(&deck, &Options::default());
    let hidden: Vec<bool> = inspect::slide_names(&package)
        .iter()
        .map(|part| {
            root_attributes(&package, part)
                .get("show")
                .is_some_and(|s| s == "0")
        })
        .collect();
    assert_eq!(hidden, [false, false, true, true, true, true, false]);
    let app = String::from_utf8_lossy(&package.parts["docProps/app.xml"]).into_owned();
    assert!(app.contains("<HiddenSlides>4</HiddenSlides>"), "{app}");

    let lean = export(
        &deck,
        &Options {
            include_hidden: false,
            ..Options::default()
        },
    );
    assert_eq!(
        inspect::slide_names(&lean).len(),
        3,
        "all four pages go together"
    );
    assert_eq!(problems(&lean), Vec::<String>::new());
}

#[test]
fn a_section_holds_every_page_of_its_slides_once_and_starts_at_the_first() {
    let Fixture {
        mut deck,
        stepped,
        plain,
    } = fixture();
    let first = deck.slides[0].id.clone();
    let last = deck.slides[3].id.clone();
    deck.sections = [("Opening", &first), ("Middle", &stepped), ("End", &last)]
        .into_iter()
        .map(|(title, at)| Section {
            title: title.to_owned(),
            starts_at: at.clone(),
            extra: slides_core::Extra::new(),
        })
        .collect();
    let _ = plain;
    let package = export(&deck, &Options::default());
    let all = inspect::elements("presentation", &package.parts["ppt/presentation.xml"]);
    let ids: Vec<&str> = all
        .iter()
        .filter(|(n, _)| n == "p:sldId")
        .map(|(_, a)| a["id"].as_str())
        .collect();
    assert_eq!(ids.len(), 7);
    // In the file order, the ids of each section in turn.
    let mut sections: Vec<(String, Vec<&str>)> = Vec::new();
    for (name, attrs) in &all {
        match name.as_str() {
            "p14:section" => sections.push((attrs["name"].clone(), Vec::new())),
            "p14:sldId" => {
                if let Some((_, list)) = sections.last_mut() {
                    list.push(attrs["id"].as_str());
                }
            }
            _ => {}
        }
    }
    assert_eq!(
        sections,
        [
            ("Opening".to_owned(), ids[0..2].to_vec()),
            ("Middle".to_owned(), ids[2..6].to_vec()),
            ("End".to_owned(), ids[6..7].to_vec()),
        ],
        "the middle section starts at the first page of its slide and holds all four"
    );
}

#[test]
fn final_writes_one_slide_for_each_slide_in_the_state_after_the_last_click() {
    let Fixture {
        deck, stepped: id, ..
    } = fixture();
    let package = export(
        &deck,
        &Options {
            steps: StepsMode::Final,
            ..Options::default()
        },
    );
    assert_eq!(inspect::slide_names(&package).len(), 4);
    let stepped = slide_xml(&package, 3);
    for label in ["one", "two", "three"] {
        assert!(shows(&stepped, label));
    }
    assert!(
        shows(&stepped, "ReAct") && !stepped.contains(" (4/4)"),
        "no suffix on the one slide"
    );
    let notes = notes_xml(&package, 3).unwrap_or_default();
    assert!(
        shows(&notes, "Say hello.")
            && shows(&notes, &format!("[kasten {id}]"))
            && !notes.contains("step "),
        "the one slide is named, and no page of it: {notes}"
    );
    assert_eq!(problems(&package), Vec::<String>::new());
}

#[test]
fn a_link_to_a_slide_with_steps_goes_to_its_first_page() {
    let Fixture {
        mut deck,
        stepped,
        plain,
    } = fixture();
    let at = deck.index_of(&plain).unwrap_or_default();
    let mut link: slides_core::Element = serde_json::from_value(json!({
        "type": "text", "id": "jump", "x": 40, "y": 400, "w": 200, "h": 40,
        "link": format!("slide:{stepped}"),
        "text": { "paragraphs": [{ "runs": [{ "t": "go" }] }] }
    }))
    .unwrap_or_else(|e| panic!("{e}"));
    link.base_mut().id = "jump".into();
    deck.slides[at].elements.push(link);
    let package = export(&deck, &Options::default());
    let rels = inspect::relationships(&package, "ppt/slides/_rels/slide2.xml.rels");
    assert!(
        rels.iter().any(|r| r.target == "slide3.xml" && !r.external),
        "the first page of the slide: {:?}",
        rels.iter().map(|r| &r.target).collect::<Vec<_>>()
    );
}

/// Whether `program` runs here at all.
fn have(program: &str, arg: &str) -> bool {
    std::process::Command::new(program)
        .arg(arg)
        .output()
        .is_ok_and(|out| out.status.success())
}

#[test]
#[ignore = "needs LibreOffice and pdfinfo; run by hand: cargo test -p slides-pptx --test steps libreoffice -- --ignored"]
fn libreoffice_reads_every_page_of_a_stepped_deck() {
    if !have("soffice", "--version") || !have("pdfinfo", "-v") {
        eprintln!("soffice or pdfinfo is missing; nothing was checked");
        return;
    }
    let Fixture { deck, .. } = fixture();
    let dir = std::env::temp_dir().join(format!("slides-steps-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    for (name, steps, pages) in [
        ("expanded", StepsMode::Expand, 7),
        ("final", StepsMode::Final, 4),
    ] {
        let file = dir.join(format!("{name}.pptx"));
        let options = Options {
            steps,
            ..Options::default()
        };
        let bytes = slides_pptx::export(&deck, &Files::default(), &options)
            .unwrap_or_else(|e| panic!("{e}"))
            .bytes;
        std::fs::write(&file, bytes).unwrap_or_else(|e| panic!("{e}"));
        let converted = std::process::Command::new("soffice")
            .args(["--headless", "--convert-to", "pdf", "--outdir"])
            .arg(&dir)
            .arg(&file)
            .output()
            .unwrap_or_else(|e| panic!("soffice: {e}"));
        assert!(converted.status.success(), "{name}: {converted:?}");
        let info = std::process::Command::new("pdfinfo")
            .arg(dir.join(format!("{name}.pdf")))
            .output()
            .unwrap_or_else(|e| panic!("pdfinfo: {e}"));
        let text = String::from_utf8_lossy(&info.stdout).into_owned();
        let counted = text
            .lines()
            .find_map(|line| line.strip_prefix("Pages:"))
            .and_then(|n| n.trim().parse::<usize>().ok());
        assert_eq!(counted, Some(pages), "{name}: {text}");
    }
}
