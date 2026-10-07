//! What the slides of an export carry: hidden and backup slides, sections,
//! notes, the settings of the layouts, and links.

mod common;

use slides_pptx::Options;

use common::inspect::{self, package_with, root_attributes};
use common::{decks, variety};

#[test]
fn hidden_and_backup_slides_are_hidden_in_the_file_and_can_be_left_out() {
    let (deck, files) = variety::sectioned();
    let package = package_with(&deck, &files, &Options::default());
    let hidden_in_file: Vec<bool> = inspect::slide_names(&package)
        .iter()
        .map(|part| {
            root_attributes(&package, part)
                .get("show")
                .is_some_and(|show| show == "0")
        })
        .collect();
    let hidden_in_deck: Vec<bool> = deck.slides.iter().map(|s| s.hidden || s.backup).collect();
    assert_eq!(hidden_in_file, hidden_in_deck);
    assert_eq!(hidden_in_file.iter().filter(|h| **h).count(), 3);

    let trimmed = package_with(
        &deck,
        &files,
        &Options {
            include_hidden: false,
            ..Options::default()
        },
    );
    assert_eq!(inspect::slide_names(&trimmed).len(), 4);
    // The count in the properties is of the slides in the file.
    let hidden_count = |package: &inspect::Package| {
        let app = String::from_utf8_lossy(&package.parts["docProps/app.xml"]).into_owned();
        app.split("<HiddenSlides>")
            .nth(1)
            .and_then(|rest| rest.split('<').next())
            .unwrap_or_default()
            .to_owned()
    };
    assert_eq!(hidden_count(&package), "3");
    assert_eq!(hidden_count(&trimmed), "0");
    assert!(
        inspect::problems(&trimmed).is_empty(),
        "{:?}",
        inspect::problems(&trimmed)
    );
}

#[test]
fn sections_list_every_slide_once_backup_slides_included() {
    let (deck, files) = variety::sectioned();
    let package = package_with(&deck, &files, &Options::default());
    let all = inspect::elements("presentation", &package.parts["ppt/presentation.xml"]);
    let named: Vec<&str> = all
        .iter()
        .filter(|(n, _)| n == "p14:section")
        .map(|(_, a)| a["name"].as_str())
        .collect();
    assert_eq!(named, ["Opening", "The middle", "Wrap up"]);
    let listed: Vec<&String> = all
        .iter()
        .filter(|(n, _)| n == "p14:sldId")
        .map(|(_, a)| &a["id"])
        .collect();
    let slides: Vec<&String> = all
        .iter()
        .filter(|(n, _)| n == "p:sldId")
        .map(|(_, a)| &a["id"])
        .collect();
    assert_eq!(
        listed, slides,
        "the sections hold every slide, once, in order"
    );
}

#[test]
fn notes_are_written_for_the_slides_that_have_them_and_can_be_left_out() {
    let (deck, files) = variety::sectioned();
    let with = package_with(
        &deck,
        &files,
        &Options {
            markers: false,
            ..Options::default()
        },
    );
    let notes: Vec<&String> = with
        .parts
        .keys()
        .filter(|n| n.starts_with("ppt/notesSlides/notesSlide"))
        .collect();
    assert_eq!(notes.len(), 2, "{notes:?}");
    let text = String::from_utf8_lossy(&with.parts["ppt/notesSlides/notesSlide2.xml"]).into_owned();
    assert!(text.contains("Notes on slide two"), "{text}");

    let without = package_with(
        &deck,
        &files,
        &Options {
            notes: false,
            ..Options::default()
        },
    );
    assert!(
        without.parts.keys().all(|n| !n.contains("notes")),
        "no notes parts"
    );
    assert!(
        inspect::problems(&without).is_empty(),
        "{:?}",
        inspect::problems(&without)
    );
}

#[test]
fn layouts_that_hide_the_master_say_so() {
    let (_, deck, files) = variety::every_theme()
        .into_iter()
        .find(|(n, ..)| n == "Lecture")
        .unwrap_or_else(|| panic!("the Lecture deck"));
    assert!(deck.theme.layouts.iter().any(|l| l.hide_master));
    let package = package_with(&deck, &files, &Options::default());
    for (n, layout) in deck.theme.layouts.iter().enumerate() {
        let part = format!("ppt/slideLayouts/slideLayout{}.xml", n + 1);
        let shows = root_attributes(&package, &part)
            .get("showMasterSp")
            .cloned();
        assert_eq!(
            shows.as_deref(),
            layout.hide_master.then_some("0"),
            "{}",
            layout.name
        );
    }
}

#[test]
fn a_link_on_an_element_is_a_relationship_of_its_slide() {
    let (deck, files) = decks::every_element("Light");
    let package = package_with(&deck, &files, &Options::default());
    // The slide with the star is the one that links; the jump goes to the last slide.
    let number = deck
        .slides
        .iter()
        .position(|s| s.elements.iter().any(|e| e.id() == "star"))
        .map_or(0, |n| n + 1);
    let slide = format!("ppt/slides/slide{number}.xml");
    let rels = inspect::relationships(
        &package,
        &format!("ppt/slides/_rels/slide{number}.xml.rels"),
    );
    let clicks: Vec<_> = inspect::elements(&slide, &package.parts[&slide])
        .into_iter()
        .filter(|(name, _)| name == "a:hlinkClick")
        .map(|(_, attrs)| attrs)
        .collect();
    assert_eq!(clicks.len(), 2, "one to the web and one to a slide");
    let target_of = |click: Option<&std::collections::BTreeMap<String, String>>| {
        let id = click.map(|c| c["r:id"].as_str()).unwrap_or_default();
        rels.iter()
            .find(|r| r.id == id)
            .map(|r| (r.target.clone(), r.external))
    };
    let web = clicks.iter().find(|c| !c.contains_key("action"));
    let jump = clicks.iter().find(|c| {
        c.get("action")
            .is_some_and(|a| a == "ppaction://hlinksldjump")
    });
    assert_eq!(
        target_of(web),
        Some(("https://example.com/docs?a=1&b=2".to_owned(), true))
    );
    assert_eq!(
        target_of(jump),
        Some((format!("slide{}.xml", deck.slides.len()), false))
    );
    let text = String::from_utf8_lossy(&package.parts[&slide]);
    assert!(text.contains(r#"descr="A star that links out""#));
}

#[test]
fn sections_of_a_trimmed_file_hold_only_the_slides_in_it() {
    let (deck, files) = variety::sectioned();
    let options = Options {
        include_hidden: false,
        ..Options::default()
    };
    let package = package_with(&deck, &files, &options);
    let all = inspect::elements("presentation", &package.parts["ppt/presentation.xml"]);
    let named: Vec<&str> = all
        .iter()
        .filter(|(n, _)| n == "p14:section")
        .map(|(_, a)| a["name"].as_str())
        .collect();
    assert_eq!(
        named,
        ["Opening", "Wrap up"],
        "the section of hidden slides is gone"
    );
    let ids = |element: &str| -> Vec<String> {
        all.iter()
            .filter(|(n, _)| n == element)
            .map(|(_, a)| a["id"].clone())
            .collect()
    };
    assert_eq!(ids("p14:sldId"), ids("p:sldId"));
    assert_eq!(ids("p:sldId").len(), 4);
}

#[test]
fn a_deck_whose_slides_are_all_left_out_is_still_a_package() {
    let (mut deck, files) = decks::demo();
    for slide in &mut deck.slides {
        slide.hidden = true;
    }
    let options = Options {
        include_hidden: false,
        ..Options::default()
    };
    let package = package_with(&deck, &files, &options);
    assert!(inspect::slide_names(&package).is_empty());
    assert!(
        inspect::problems(&package).is_empty(),
        "{:?}",
        inspect::problems(&package)
    );
}

#[test]
fn a_composite_is_written_as_the_primitives_it_expands_to() {
    let mut deck = slides_core::Engine::create("Composites", "Light", 5)
        .unwrap()
        .deck()
        .clone();
    let element: slides_core::Element = serde_json::from_value(serde_json::json!({
        "type": "code", "id": "e-code", "x": 40, "y": 120, "w": 400, "h": 200,
        "language": "python", "code": "print(1)"
    }))
    .unwrap();
    deck.slides[0].elements.push(element);
    let package = package_with(
        &deck,
        &common::Files(Default::default()),
        &Options::default(),
    );
    let slide = String::from_utf8_lossy(&package.parts["ppt/slides/slide1.xml"]).into_owned();
    assert!(
        slide.contains("<p:grpSp>"),
        "the composite stands where it was, as a group: {slide}"
    );
    assert!(
        !slide.contains("e-code\"") || slide.contains("name=\"e-code"),
        "no raw composite leaks into the file"
    );
}
