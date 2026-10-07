//! The poster of an embedded page or a video fills its box in the file as it does on
//! the slide: cut to the shape of the box, not stretched to it.

mod common;

use common::inspect::package_with;
use common::{Files, samples};
use serde_json::json;
use slides_core::{Crop, Deck, Element};
use slides_pptx::Options;
use slides_pptx::import::{ImportOptions, import};

/// The `a:srcRect` of each picture in the first slide, in order.
fn cuts(slide: &str) -> Vec<String> {
    slide
        .match_indices("<a:srcRect ")
        .map(|(at, _)| {
            let rest = &slide[at..];
            rest[..rest.find("/>").map_or(rest.len(), |end| end + 2)].to_owned()
        })
        .collect()
}

fn deck_with(elements: Vec<serde_json::Value>) -> Deck {
    let mut deck = slides_core::Engine::create("Posters", "Light", 5)
        .unwrap()
        .deck()
        .clone();
    for element in elements {
        deck.slides[0]
            .elements
            .push(serde_json::from_value(element).unwrap());
    }
    deck
}

fn slide_with(elements: Vec<serde_json::Value>, files: &Files) -> String {
    let package = package_with(&deck_with(elements), files, &Options::default());
    String::from_utf8_lossy(&package.parts["ppt/slides/slide1.xml"]).into_owned()
}

fn stills() -> Files {
    let mut files = Files::default();
    files.0.insert(
        "assets/tall.png".into(),
        samples::solid(300, 600, [200, 80, 20]),
    );
    files.0.insert(
        "assets/wide.png".into(),
        samples::solid(400, 200, [20, 80, 200]),
    );
    files
}

#[test]
fn the_poster_of_a_video_is_cut_to_the_shape_of_its_box() {
    // A still twice as tall as it is wide, in a box twice as wide as it is tall.
    let slide = slide_with(
        vec![
            json!({ "type": "video", "id": "e-v", "x": 40, "y": 120, "w": 600, "h": 300,
            "src": "assets/clip.mp4", "poster": "assets/tall.png" }),
        ],
        &stills(),
    );
    assert_eq!(
        cuts(&slide),
        [r#"<a:srcRect l="0" t="37500" r="0" b="37500"/>"#],
        "{slide}"
    );
}

#[test]
fn the_poster_of_a_page_is_cut_to_the_shape_of_its_box() {
    let slide = slide_with(
        vec![
            json!({ "type": "embed", "id": "e-w", "x": 40, "y": 120, "w": 200, "h": 400,
            "url": "https://example.com/demo", "poster": "assets/wide.png" }),
        ],
        &stills(),
    );
    assert_eq!(
        cuts(&slide),
        [r#"<a:srcRect l="37500" t="0" r="37500" b="0"/>"#],
        "{slide}"
    );
}

#[test]
fn a_poster_of_the_shape_of_its_box_and_an_ordinary_picture_are_left_as_they_are() {
    let slide = slide_with(
        vec![
            json!({ "type": "embed", "id": "e-w", "x": 40, "y": 120, "w": 400, "h": 200,
                "url": "https://example.com/demo", "poster": "assets/wide.png" }),
            json!({ "type": "image", "id": "e-i", "x": 500, "y": 120, "w": 400, "h": 200,
                "src": "assets/tall.png" }),
        ],
        &stills(),
    );
    assert!(cuts(&slide).is_empty(), "{slide}");
    assert_eq!(slide.matches("<p:pic>").count(), 2, "{slide}");
}

/// The crop of the first picture that has one, in groups too.
fn first_crop(list: &[Element]) -> Option<Crop> {
    list.iter().find_map(|element| match element {
        Element::Image(picture) => picture.crop.clone(),
        other => first_crop(other.children()),
    })
}

#[test]
fn the_cut_comes_back_as_the_crop_of_the_picture_when_the_file_is_read_again() {
    let deck = deck_with(vec![
        json!({ "type": "video", "id": "e-v", "x": 40, "y": 120, "w": 600, "h": 300,
            "src": "assets/clip.mp4", "poster": "assets/tall.png" }),
    ]);
    let out = slides_pptx::export(&deck, &stills(), &Options::default()).unwrap();
    let back = import(&out.bytes, &ImportOptions::default()).unwrap();
    let crop = first_crop(&back.deck.slides[0].elements).expect("the picture has a crop");
    let near = |got: f64, want: f64| (got - want).abs() < 0.001;
    assert!(
        near(crop.left, 0.0)
            && near(crop.right, 0.0)
            && near(crop.top, 0.375)
            && near(crop.bottom, 0.375),
        "{crop:?}"
    );
}
