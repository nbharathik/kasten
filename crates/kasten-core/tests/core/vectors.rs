//! Search by meaning: which notes need a vector from the embedding model,
//! keeping the vectors beside the index, and the notes nearest a question.

use crate::common;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::vectors::Embedded;
use kasten_core::{Instant, Kasten, Kind, NewNote};

const MODEL: &str = "text-embedding-3-small";

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    (t, k)
}

fn card(k: &Kasten, title: &str, body: &str) -> String {
    let new = NewNote {
        kind: Kind::Card,
        title: title.into(),
        date: "2026-09-25".into(),
        project: None,
        parent: None,
        template: None,
        icon: None,
    };
    let empty = serde_json::Map::new();
    k.create_with_body(&Actor::Human, &new, body, &[], &empty, "create", NOW)
        .unwrap()
        .meta
        .path
}

/// A made-up vector for every note waiting: what the model would give.
fn embed_all(k: &Kasten, vector: impl Fn(&str) -> Vec<f32>) -> usize {
    let mut kept = 0;
    loop {
        let todo = k.to_embed(MODEL, 16).unwrap();
        if todo.is_empty() {
            return kept;
        }
        let made: Vec<Embedded> = todo
            .into_iter()
            .map(|t| Embedded {
                vector: vector(&t.text),
                path: t.path,
                stamp: t.stamp,
                hash: t.hash,
            })
            .collect();
        kept += k.keep_vectors(MODEL, &made).unwrap();
    }
}

#[test]
fn lists_each_note_to_embed_once_with_its_title_and_text() {
    let (_t, k) = open();
    let path = card(
        &k,
        "Sourdough starter",
        "Feed it rye flour every morning.\n",
    );
    let status = k.embed_status(MODEL).unwrap();
    assert_eq!(status.done, 0);
    let todo = k.to_embed(MODEL, 1000).unwrap();
    assert_eq!(todo.len(), status.total);
    assert!(
        todo.iter().all(|t| !t.path.starts_with("templates/")),
        "templates are not searched"
    );
    let item = todo.iter().find(|t| t.path == path).unwrap();
    assert!(
        item.text.starts_with("Sourdough starter\n\n"),
        "{:?}",
        item.text
    );
    assert!(item.text.contains("rye flour"));
    assert_eq!(k.to_embed(MODEL, 3).unwrap().len(), 3);

    let kept = embed_all(&k, |_| vec![1.0, 0.0, 0.0]);
    assert_eq!(kept, status.total);
    assert_eq!(k.embed_status(MODEL).unwrap().done, status.total);
    assert!(k.to_embed(MODEL, 10).unwrap().is_empty());
    // Another model starts from nothing.
    assert_eq!(k.to_embed("other-model", 1000).unwrap().len(), status.total);
}

#[test]
fn a_note_is_embedded_again_only_when_its_words_change() {
    let (t, k) = open();
    let path = card(&k, "Kiln firing", "Cone six.\n");
    embed_all(&k, |_| vec![0.0, 1.0]);
    let file = k.read(&path).unwrap();
    k.save_body(&Actor::Human, &path, "Cone six, slowly.\n", &file.hash, NOW)
        .unwrap();
    let todo = k.to_embed(MODEL, 10).unwrap();
    assert_eq!(
        todo.iter().map(|t| t.path.as_str()).collect::<Vec<_>>(),
        [path.as_str()]
    );
    embed_all(&k, |_| vec![0.0, 1.0]);

    // A file touched without a change (a sync, a checkout) is not.
    let full = t.vault.root().join(&path);
    let text = std::fs::read_to_string(&full).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(20));
    std::fs::write(&full, &text).unwrap();
    k.outside_changes(std::slice::from_ref(&path), Instant::now().millis);
    assert!(k.to_embed(MODEL, 10).unwrap().is_empty());
}

#[test]
fn finds_the_notes_nearest_a_question() {
    let (t, k) = open();
    let bread = card(&k, "Baking bread", "Sourdough and a long proof.\n");
    let kiln = card(&k, "Kiln firing", "Stoneware to cone six.\n");
    let garden = card(&k, "Garden plan", "Tomatoes in spring.\n");
    embed_all(&k, |text| {
        if text.starts_with("Baking bread") {
            vec![0.9, 0.1, 0.0]
        } else if text.starts_with("Kiln firing") {
            vec![0.0, 3.0, 0.1]
        } else if text.starts_with("Garden plan") {
            vec![0.2, 0.0, 0.9]
        } else {
            vec![-1.0, -1.0, -1.0]
        }
    });
    let near = k.nearest(MODEL, &[1.0, 0.5, 0.0], 3).unwrap();
    let paths: Vec<&str> = near.iter().map(|n| n.path.as_str()).collect();
    assert_eq!(paths, [bread.as_str(), kiln.as_str(), garden.as_str()]);
    assert_eq!(near[0].title, "Baking bread");
    assert!(near[0].excerpt.contains("Sourdough"));
    // Cosine similarity, whatever the vectors' lengths.
    // (1, 0.5, 0) against (0.9, 0.1, 0): 0.95 / (1.118 × 0.9055).
    assert!((near[0].score - 0.9383).abs() < 1e-3, "{}", near[0].score);
    assert!(near.windows(2).all(|w| w[0].score >= w[1].score));
    assert_eq!(k.nearest(MODEL, &[0.0, 1.0, 0.0], 1).unwrap()[0].path, kiln);

    // Trashed notes drop out; the vectors survive reopening.
    k.trash(&Actor::Human, &kiln, NOW).unwrap();
    assert!(
        k.nearest(MODEL, &[0.0, 1.0, 0.0], 5)
            .unwrap()
            .iter()
            .all(|n| n.path != kiln)
    );
    drop(k);
    let k = Kasten::open(t.vault.root()).unwrap();
    assert_eq!(
        k.nearest(MODEL, &[1.0, 0.0, 0.0], 1).unwrap()[0].path,
        bread
    );
    assert!(k.to_embed(MODEL, 10).unwrap().is_empty());
    // A question of the wrong size, or for a model with no vectors, finds nothing.
    assert!(k.nearest(MODEL, &[1.0, 0.0], 3).unwrap().is_empty());
    assert!(
        k.nearest("other-model", &[1.0, 0.0, 0.0], 3)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn refuses_vectors_that_are_not_vectors() {
    let (_t, k) = open();
    let item = k.to_embed(MODEL, 1).unwrap().remove(0);
    for bad in [vec![], vec![0.0, 0.0], vec![f32::NAN, 1.0]] {
        let made = Embedded {
            path: item.path.clone(),
            stamp: item.stamp.clone(),
            hash: item.hash.clone(),
            vector: bad,
        };
        assert!(k.keep_vectors(MODEL, &[made]).is_err());
    }
    assert!(
        k.nearest(MODEL, &[0.0, 0.0], 3).is_err(),
        "an empty question"
    );
}
