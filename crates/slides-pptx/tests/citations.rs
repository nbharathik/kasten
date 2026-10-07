//! A citation in the file says what the editor shows: the works written from the
//! bibliography and numbered as the whole deck numbers them, as text that stays editable.

mod common;

use common::inspect::open;
use serde_json::json;
use slides_core::Deck;
use slides_core::citations::Refs;
use slides_pptx::{Media, Options, export, export_with};

struct NoPictures;

impl Media for NoPictures {
    fn read(&self, _: &str) -> Option<Vec<u8>> {
        None
    }
}

const BIB: &str = "\
@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}
@article{lecun2015deep, title={Deep learning}, author={LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey}, journal={Nature}, year={2015}}
";

/// A deck whose second slide cites two works, numbered, and whose last has the list.
fn deck() -> Deck {
    let mut engine = slides_core::Engine::create("Cited", "Light", 9).unwrap();
    let mut slide = || {
        engine
            .apply("add_slide", json!({ "layout": "blank" }))
            .unwrap()
            .output["slide"]
            .as_str()
            .unwrap()
            .to_owned()
    };
    let (one, two) = (slide(), slide());
    let mut put = |slide: &str, element: serde_json::Value| {
        engine
            .apply(
                "add_elements",
                json!({ "slide": slide, "elements": [element] }),
            )
            .unwrap();
    };
    put(
        &one,
        json!({ "type": "citation", "id": "c1", "x": 64, "y": 480, "w": 700, "h": 30, "keys": ["lecun2015deep"], "format": "numbered" }),
    );
    put(
        &two,
        json!({ "type": "citation", "id": "c2", "x": 64, "y": 480, "w": 700, "h": 30, "keys": ["vaswani2017attention", "lecun2015deep"] }),
    );
    put(
        &two,
        json!({ "type": "citation", "id": "refs", "x": 64, "y": 100, "w": 800, "h": 300, "keys": [], "format": "list" }),
    );
    engine.deck().clone()
}

/// The words of a slide in the file: what is inside its `a:t` elements.
fn words(bytes: &[u8], slide: usize) -> Vec<String> {
    let package = open(bytes);
    let xml = String::from_utf8_lossy(&package.parts[&format!("ppt/slides/slide{slide}.xml")])
        .into_owned();
    xml.match_indices("<a:t>")
        .map(|(at, _)| {
            let rest = &xml[at + 5..];
            rest[..rest.find("</a:t>").unwrap()]
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
        })
        .collect()
}

#[test]
fn the_file_says_who_wrote_each_work_and_numbers_them_as_the_deck_does() {
    let refs = Refs::from_bibtex(BIB);
    let written = export_with(&deck(), &NoPictures, &Options::default(), Some(&refs)).unwrap();
    assert!(written.warnings.is_empty(), "{:?}", written.warnings);
    // The title slide is the first page.
    let first = words(&written.bytes, 2);
    assert!(first.contains(&"[1]".to_owned()), "{first:?}");
    let second = words(&written.bytes, 3);
    assert!(
        second.contains(&"Vaswani et al., 2017 (NeurIPS); LeCun et al., 2015 (Nature)".to_owned()),
        "{second:?}"
    );
    let list: Vec<&String> = second.iter().filter(|w| w.starts_with('[')).collect();
    assert_eq!(list.len(), 2, "{second:?}");
    assert!(
        list[0].starts_with("[1] Y. LeCun, Y. Bengio, and G. Hinton. Deep learning. Nature, 2015."),
        "{}",
        list[0]
    );
    assert!(
        list[1].starts_with("[2] A. Vaswani et al. Attention is all you need."),
        "{}",
        list[1]
    );
}

#[test]
fn without_a_bibliography_the_file_has_the_keys_and_the_same_numbers() {
    let written = export(&deck(), &NoPictures, &Options::default()).unwrap();
    let second = words(&written.bytes, 3);
    assert!(
        second.contains(&"(vaswani2017attention; lecun2015deep)".to_owned()),
        "{second:?}"
    );
    assert!(
        second.contains(&"[1] lecun2015deep".to_owned()),
        "{second:?}"
    );
    assert!(
        second.contains(&"[2] vaswani2017attention".to_owned()),
        "{second:?}"
    );
}
