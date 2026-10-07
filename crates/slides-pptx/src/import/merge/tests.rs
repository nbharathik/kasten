use serde_json::json;
use slides_core::{Deck, Element, Engine, Slide};

use super::*;

fn engine(seed: u64) -> Engine {
    Engine::create("Talk", "Light", seed).unwrap_or_else(|e| panic!("{e}"))
}

fn add_slide(e: &mut Engine, layout: &str, title: &str) -> String {
    let out = e
        .apply(
            "add_slide",
            json!({ "layout": layout, "content": { "title": title } }),
        )
        .unwrap_or_else(|err| panic!("{err}"));
    out.output["slide"].as_str().unwrap_or_default().to_owned()
}

fn add_box(e: &mut Engine, slide: &str, x: f64, words: &str) -> String {
    let element = json!({ "type": "text", "x": x, "y": 200, "w": 200, "h": 50, "text": { "paragraphs": [{ "runs": [{ "t": words }] }] } });
    let out = e
        .apply(
            "add_elements",
            json!({ "slide": slide, "elements": [element] }),
        )
        .unwrap_or_else(|err| panic!("{err}"));
    out.output["ids"][0].as_str().unwrap_or_default().to_owned()
}

/// The deck as a file would hand it back: the same slides with ids of another program's making,
/// each marked with the slide it came from.
fn as_imported(deck: &Deck) -> Deck {
    let mut copy = deck.clone();
    for (n, slide) in copy.slides.iter_mut().enumerate() {
        let was = slide.id.clone();
        slide.id = format!("s-file{n:04}");
        slide.extra.insert(
            "pptxMarker".into(),
            json!({ "slide": was, "step": null, "backup": false }),
        );
        for (k, e) in slide.elements.iter_mut().enumerate() {
            e.base_mut().id = format!("e-file{n}{k}");
        }
    }
    copy
}

fn words(e: &Element) -> String {
    e.text().map(|t| t.plain_text()).unwrap_or_default()
}

fn slide_ids(deck: &Deck) -> Vec<String> {
    deck.slides.iter().map(|s| s.id.clone()).collect()
}

fn find<'a>(slide: &'a Slide, text: &str) -> &'a Element {
    slide
        .elements
        .iter()
        .find(|e| words(e) == text)
        .unwrap_or_else(|| panic!("no `{text}` on {}", slide.id))
}

#[test]
fn a_file_with_no_change_leaves_every_id_where_it_was() {
    let mut e = engine(1);
    let a = add_slide(&mut e, "title-only", "One");
    add_box(&mut e, &a, 100.0, "hello");
    let b = add_slide(&mut e, "title-body", "Two");
    add_box(&mut e, &b, 300.0, "world");
    let deck = e.deck().clone();
    let merged = merge_version(&deck, as_imported(&deck));
    assert_eq!(slide_ids(&merged), slide_ids(&deck));
    for (m, d) in merged.slides.iter().zip(&deck.slides) {
        let ids = |s: &Slide| {
            s.elements
                .iter()
                .map(|e| e.id().to_owned())
                .collect::<Vec<_>>()
        };
        assert_eq!(ids(m), ids(d), "elements of {}", d.id);
    }
    assert_eq!(
        merged.slides[1].extra.get("pptxMarker"),
        None,
        "the marker is not kept"
    );
}

#[test]
fn a_moved_box_and_a_reworded_box_keep_their_ids_and_take_the_files_content() {
    let mut e = engine(2);
    let a = add_slide(&mut e, "title-only", "One");
    let moved = add_box(&mut e, &a, 100.0, "stays put in words");
    let reworded = add_box(&mut e, &a, 400.0, "old words");
    let far = add_box(&mut e, &a, 700.0, "goes far away");
    let deck = e.deck().clone();
    let mut file = as_imported(&deck);
    for el in &mut file.slides[1].elements {
        match words(el).as_str() {
            "stays put in words" => el.base_mut().x = Some(105.0),
            "old words" => {
                if let Element::Text(t) = el {
                    t.text = slides_core::Text::plain("new words");
                }
            }
            "goes far away" => el.base_mut().y = Some(400.0),
            _ => {}
        }
    }
    let merged = merge_version(&deck, file);
    let slide = &merged.slides[1];
    assert_eq!(find(slide, "stays put in words").id(), moved);
    assert_eq!(
        find(slide, "stays put in words").base().x,
        Some(105.0),
        "the file's place"
    );
    assert_eq!(
        find(slide, "new words").id(),
        reworded,
        "reworded in place: same element"
    );
    assert_ne!(
        find(slide, "goes far away").id(),
        far,
        "moved 200 units: a new element"
    );
    assert!(
        slide.elements.iter().all(|e| e.id() != far),
        "the old one is gone"
    );
}

#[test]
fn what_the_file_adds_is_added_and_what_it_dropped_is_dropped() {
    let mut e = engine(3);
    let a = add_slide(&mut e, "title-only", "One");
    add_box(&mut e, &a, 100.0, "gone in the file");
    add_box(&mut e, &a, 400.0, "kept");
    let deck = e.deck().clone();
    let mut file = as_imported(&deck);
    file.slides[1]
        .elements
        .retain(|el| words(el) != "gone in the file");
    let mut extra = file.slides[1].elements[1].clone();
    extra.base_mut().id = "e-file-new".into();
    if let Element::Text(t) = &mut extra {
        t.text = slides_core::Text::plain("brand new");
    }
    extra.base_mut().y = Some(320.0);
    file.slides[1].elements.push(extra);
    let merged = merge_version(&deck, file);
    let slide = &merged.slides[1];
    let said: Vec<String> = slide.elements.iter().map(words).collect();
    assert!(!said.contains(&"gone in the file".to_owned()), "{said:?}");
    assert!(
        said.contains(&"kept".to_owned()) && said.contains(&"brand new".to_owned()),
        "{said:?}"
    );
    let ids: HashSet<&str> = slide.elements.iter().map(|e| e.id()).collect();
    assert_eq!(ids.len(), slide.elements.len(), "ids are unique");
}

#[test]
fn slides_are_found_by_marker_then_title_then_place_and_order_follows_the_file() {
    let mut e = engine(4);
    let a = add_slide(&mut e, "title-only", "Alpha");
    let b = add_slide(&mut e, "title-only", "Beta");
    let c = add_slide(&mut e, "title-only", "Gamma");
    let deck = e.deck().clone();
    let mut file = as_imported(&deck);
    // The file has them in another order, one without its marker (found by its title), and a new one.
    file.slides.swap(1, 3);
    for s in &mut file.slides {
        if s.elements.iter().any(|e| words(e) == "Gamma") {
            s.extra.remove("pptxMarker");
        }
    }
    let mut new = file.slides[0].clone();
    new.id = "s-newone".into();
    new.extra.remove("pptxMarker");
    for el in &mut new.elements {
        if let Element::Text(t) = el {
            t.text = slides_core::Text::plain("Delta");
        }
    }
    file.slides.push(new);
    let merged = merge_with_report(&deck, file);
    let titles: Vec<String> = merged
        .deck
        .slides
        .iter()
        .map(|s| s.elements.first().map(words).unwrap_or_default())
        .collect();
    assert_eq!(
        titles,
        ["Talk", "Gamma", "Beta", "Alpha", "Delta"],
        "the file's order"
    );
    assert_eq!(merged.deck.slides[1].id, c);
    assert_eq!(merged.deck.slides[2].id, b);
    assert_eq!(merged.deck.slides[3].id, a);
    assert!(
        deck.slide(&merged.deck.slides[4].id).is_none(),
        "Delta is new"
    );
    assert!(
        merged
            .notes
            .iter()
            .any(|n| n.contains("1 slides of the file are new")),
        "{:?}",
        merged.notes
    );
}

#[test]
fn a_slide_the_file_lacks_is_kept_after_the_slide_before_it_and_named_in_the_notes() {
    let mut e = engine(5);
    let a = add_slide(&mut e, "title-only", "Alpha");
    let b = add_slide(&mut e, "title-only", "Beta");
    let c = add_slide(&mut e, "title-only", "Gamma");
    let deck = e.deck().clone();
    let mut file = as_imported(&deck);
    file.slides
        .retain(|s| !s.elements.iter().any(|e| words(e) == "Beta"));
    let merged = merge_with_report(&deck, file);
    assert_eq!(slide_ids(&merged.deck)[1..], [a, b, c]);
    assert!(
        merged
            .notes
            .iter()
            .any(|n| n.contains("1 slides of the deck are not in the file")),
        "{:?}",
        merged.notes
    );
}

#[test]
fn pages_of_a_slide_with_steps_are_one_slide_and_words_the_file_keeps_plainer_are_the_decks() {
    let mut e = engine(6);
    let a = add_slide(&mut e, "title-only", "Steps");
    e.apply(
        "set_notes",
        json!({ "slide": a, "notes": "Say **this** first.\n\n- then [that](https://example.com)" }),
    )
    .unwrap_or_else(|err| panic!("{err}"));
    let deck = e.deck().clone();
    let mut file = as_imported(&deck);
    // The slide came as three pages; the file's notes lost the markup.
    let mut pages = Vec::new();
    for k in 1..=3u32 {
        let mut page = file.slides[1].clone();
        page.id = format!("s-page{k}");
        page.extra.insert(
            "pptxMarker".into(),
            json!({ "slide": a, "step": [k, 3], "backup": false }),
        );
        page.notes = "Say this first.\n\nthen that (https://example.com)".into();
        pages.push(page);
    }
    file.slides.splice(1..2, pages);
    let merged = merge_with_report(&deck, file);
    assert_eq!(merged.deck.slides.len(), 2, "one slide for the three pages");
    assert_eq!(merged.deck.slides[1].id, a);
    assert_eq!(
        merged.deck.slides[1].notes, "Say **this** first.\n\n- then [that](https://example.com)",
        "the deck's markup is kept"
    );
    assert!(
        merged.notes.iter().any(|n| n.contains("2 pages")),
        "{:?}",
        merged.notes
    );
    // Reworded notes are the file's.
    let mut changed = as_imported(&deck);
    changed.slides[1].notes = "Something else entirely.".into();
    assert_eq!(
        merge_version(&deck, changed).slides[1].notes,
        "Something else entirely."
    );
}

#[test]
fn steps_names_and_locks_the_file_cannot_hold_stay_and_connectors_follow_the_ids() {
    let mut e = engine(7);
    let a = add_slide(&mut e, "title-only", "Wire");
    let one = add_box(&mut e, &a, 100.0, "from here");
    let two = add_box(&mut e, &a, 500.0, "to there");
    e.apply("set_slide_steps", json!({ "slide": a, "steps": 2 }))
        .unwrap_or_else(|err| panic!("{err}"));
    e.apply(
        "set_step_states",
        json!({ "slide": a, "id": two, "states": { "0": "hidden", "1": "normal" } }),
    )
    .unwrap_or_else(|err| panic!("{err}"));
    e.apply(
        "add_elements",
        json!({ "slide": a, "elements": [{ "type": "connector", "route": "straight", "x": 0, "y": 0, "w": 1, "h": 1, "from": { "el": one, "side": "right" }, "to": { "el": two, "side": "left" } }] }),
    )
    .unwrap_or_else(|err| panic!("{err}"));
    let deck = e.deck().clone();
    let file = as_imported(&deck);
    // In the file the connector joins the file's own ids.
    let file_ids: Vec<String> = file.slides[1]
        .elements
        .iter()
        .map(|e| e.id().to_owned())
        .collect();
    assert!(file_ids.iter().all(|i| i.starts_with("e-file")));
    let merged = merge_version(&deck, {
        let mut f = file;
        let (x, y) = (
            f.slides[1]
                .elements
                .iter()
                .find(|e| words(e) == "from here")
                .map(|e| e.id().to_owned()),
            f.slides[1]
                .elements
                .iter()
                .find(|e| words(e) == "to there")
                .map(|e| e.id().to_owned()),
        );
        for el in &mut f.slides[1].elements {
            if let Element::Connector(c) = el
                && let (Some(from), Some(to)) = (c.from.as_mut(), c.to.as_mut())
            {
                from.el = x.clone().unwrap_or_default();
                to.el = y.clone().unwrap_or_default();
            }
        }
        f
    });
    let slide = &merged.slides[1];
    assert_eq!(slide.steps, 2, "the slide's steps stay");
    assert_eq!(
        find(slide, "to there").base().step_states,
        deck.slide(&a)
            .and_then(|s| s.element(&two))
            .map(|e| e.base().step_states.clone())
            .unwrap_or_default()
    );
    let Some(Element::Connector(c)) = slide.elements.iter().find(|e| e.kind() == "connector")
    else {
        panic!("the connector")
    };
    assert_eq!(c.from.as_ref().map(|x| x.el.as_str()), Some(one.as_str()));
    assert_eq!(c.to.as_ref().map(|x| x.el.as_str()), Some(two.as_str()));
}

#[test]
fn a_composite_whose_parts_came_back_unchanged_is_still_a_composite() {
    let mut e = engine(8);
    let a = add_slide(&mut e, "title-only", "Code");
    e.apply(
        "add_elements",
        json!({ "slide": a, "elements": [{ "type": "code", "x": 60, "y": 150, "w": 500, "h": 200, "language": "rust", "code": "fn main() {}\n" }] }),
    )
    .unwrap_or_else(|err| panic!("{err}"));
    let deck = e.deck().clone();
    assert!(deck.slides[1].elements.iter().any(|e| e.kind() == "code"));
    // The file has the parts of the code block, as an export writes them.
    let mut file = as_imported(&slides_core::composites::expand_deck(&deck));
    let merged = merge_version(&deck, file.clone());
    assert!(
        merged.slides[1].elements.iter().any(|e| e.kind() == "code"),
        "still a code block: {:?}",
        merged.slides[1]
            .elements
            .iter()
            .map(|e| e.kind())
            .collect::<Vec<_>>()
    );
    // Change a word of it in the file and it is a group of parts, as the file has it.
    fn reword(list: &mut [Element]) {
        for e in list {
            if let Element::Text(t) = e
                && t.text.plain_text().contains("fn")
            {
                t.text = slides_core::Text::plain("fn changed() {}");
                return;
            }
            if let Some(children) = e.children_mut() {
                reword(children);
            }
        }
    }
    reword(&mut file.slides[1].elements);
    let merged = merge_version(&deck, file);
    assert!(merged.slides[1].elements.iter().all(|e| e.kind() != "code"));
}
