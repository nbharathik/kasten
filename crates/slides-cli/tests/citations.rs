//! Citations in a PowerPoint file: `slides export` writes each work the way the editor draws it
//! (its label, its number, the list of references) from the `.bib` files beside the deck, and
//! keeps the keys where there is no bibliography to write them from.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde_json::{Value, json};
use slides_pptx::import::{ImportOptions, import};

const BIB: &str = "\
@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}
@article{lecun2015deep, title={Deep learning}, author={LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey}, journal={Nature}, year={2015}}
";

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
    let dir = std::env::temp_dir().join(format!("slides-cited-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// Runs an operation on the deck and returns what it answered.
fn op(deck: &Path, name: &str, input: &Value) -> Value {
    let done = slides(&["op", deck.to_str().unwrap(), name, &input.to_string()]);
    assert!(done.status.success(), "{name}: {}", text(&done.stderr));
    serde_json::from_slice(&done.stdout).unwrap()
}

/// A deck whose first blank slide cites a work by its number, and whose second cites two works
/// and lists every work the deck cites.
fn cited_deck(dir: &Path) -> PathBuf {
    let deck = dir.join("talk.deck");
    let made = slides(&["new", deck.to_str().unwrap(), "--title", "Cited"]);
    assert!(made.status.success(), "{}", text(&made.stderr));
    let put = |element: Value| {
        let added = op(&deck, "add_slide", &json!({ "layout": "blank" }));
        op(
            &deck,
            "add_elements",
            &json!({ "slide": added["slide"], "elements": [element] }),
        );
    };
    put(
        json!({ "type": "citation", "id": "c1", "x": 64, "y": 480, "w": 700, "h": 30, "keys": ["lecun2015deep"], "format": "numbered" }),
    );
    put(
        json!({ "type": "citation", "id": "c2", "x": 64, "y": 480, "w": 700, "h": 30, "keys": ["vaswani2017attention", "lecun2015deep"] }),
    );
    // The list goes on the slide of the second citation, as a slide of a paper would have it.
    let file: Value = serde_json::from_str(&fs::read_to_string(&deck).unwrap()).unwrap();
    let last = file["slides"].as_array().unwrap().last().unwrap()["id"].clone();
    op(
        &deck,
        "add_elements",
        &json!({ "slide": last, "elements": [
            { "type": "citation", "id": "refs", "x": 64, "y": 100, "w": 800, "h": 300, "keys": [], "format": "list" }
        ] }),
    );
    deck
}

/// Every paragraph of every text in a PowerPoint file, read back as a person opening it would.
fn paragraphs(file: &Path) -> Vec<String> {
    fn collect(value: &Value, found: &mut Vec<String>) {
        match value {
            Value::Object(map) => {
                for paragraph in map
                    .get("paragraphs")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    let runs = paragraph["runs"].as_array().into_iter().flatten();
                    found.push(runs.filter_map(|r| r["t"].as_str()).collect());
                }
                map.values().for_each(|v| collect(v, found));
            }
            Value::Array(list) => list.iter().for_each(|v| collect(v, found)),
            _ => {}
        }
    }
    let bytes = fs::read(file).unwrap();
    let back = import(&bytes, &ImportOptions::default()).unwrap_or_else(|e| panic!("{e}"));
    let mut found = Vec::new();
    collect(&serde_json::to_value(&back.deck).unwrap(), &mut found);
    found
}

fn export(deck: &Path, out: &Path) {
    let run = slides(&[
        "export",
        deck.to_str().unwrap(),
        "-o",
        out.to_str().unwrap(),
    ]);
    assert!(run.status.success(), "{}", text(&run.stderr));
}

#[test]
fn a_numbered_citation_and_a_list_come_out_as_numbers_and_works_from_the_bibliography_beside_the_deck()
 {
    let dir = temp("beside");
    let deck = cited_deck(&dir);
    fs::write(dir.join("refs.bib"), BIB).unwrap();
    let out = dir.join("talk.pptx");
    export(&deck, &out);

    let found = paragraphs(&out);
    assert!(found.contains(&"[1]".to_owned()), "{found:?}");
    assert!(
        found.contains(&"Vaswani et al., 2017 (NeurIPS); LeCun et al., 2015 (Nature)".to_owned()),
        "{found:?}"
    );
    let list: Vec<&String> = found.iter().filter(|p| p.starts_with("[2] ")).collect();
    assert_eq!(list.len(), 1, "{found:?}");
    assert!(
        list[0].starts_with("[2] A. Vaswani et al. Attention is all you need."),
        "{}",
        list[0]
    );
    assert!(
        found.iter().any(|p| p
            .starts_with("[1] Y. LeCun, Y. Bengio, and G. Hinton. Deep learning. Nature, 2015.")),
        "{found:?}"
    );
    assert!(
        found.iter().all(|p| !p.contains("vaswani2017attention")),
        "no key is left where a work could be written: {found:?}"
    );
}

#[test]
fn without_a_bibliography_beside_the_deck_the_file_keeps_the_keys_and_the_same_numbers() {
    let dir = temp("none");
    let deck = cited_deck(&dir);
    let out = dir.join("talk.pptx");
    export(&deck, &out);

    let found = paragraphs(&out);
    assert!(found.contains(&"[1]".to_owned()), "{found:?}");
    assert!(
        found.contains(&"(vaswani2017attention; lecun2015deep)".to_owned()),
        "{found:?}"
    );
    assert!(
        found.contains(&"[1] lecun2015deep".to_owned())
            && found.contains(&"[2] vaswani2017attention".to_owned()),
        "{found:?}"
    );
}

#[test]
fn the_bibliography_is_the_decks_own_folder_even_when_the_pictures_come_from_another() {
    let dir = temp("assets");
    let deck = cited_deck(&dir);
    fs::write(dir.join("refs.bib"), BIB).unwrap();
    let store = dir.join("store");
    fs::create_dir_all(&store).unwrap();
    let out = dir.join("talk.pptx");
    let run = slides(&[
        "export",
        deck.to_str().unwrap(),
        "-o",
        out.to_str().unwrap(),
        "--assets",
        store.to_str().unwrap(),
    ]);
    assert!(run.status.success(), "{}", text(&run.stderr));
    assert!(
        paragraphs(&out)
            .contains(&"Vaswani et al., 2017 (NeurIPS); LeCun et al., 2015 (Nature)".to_owned())
    );
}
