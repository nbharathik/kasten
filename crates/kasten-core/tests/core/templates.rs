//! Starter templates for vaults made before a template shipped: the app
//! lists the missing ones and adds them on request, in one commit, never
//! touching a template the vault already has.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::Kasten;
use kasten_core::history::Actor;

#[test]
fn adds_only_missing_starter_templates_in_one_commit() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    fs::remove_file(root.join("templates/recipe.md")).unwrap();
    fs::remove_file(root.join("templates/road-trip.md")).unwrap();
    // A template the owner changed stays exactly as it is.
    let own = "---\ntitle: \"{{title}}\"\ntype: page\n---\nMy own travel plan.\n";
    fs::write(root.join("templates/travel.md"), own).unwrap();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();

    assert_eq!(k.missing_templates().unwrap(), ["recipe", "road-trip"]);
    let added = k.add_starter_templates(&Actor::Human, NOW).unwrap();
    assert_eq!(added, ["templates/recipe.md", "templates/road-trip.md"]);
    assert_eq!(
        fs::read_to_string(root.join("templates/travel.md")).unwrap(),
        own
    );
    assert!(k.missing_templates().unwrap().is_empty());
    assert!(
        k.list()
            .unwrap()
            .iter()
            .any(|n| n.path == "templates/recipe.md")
    );

    let log = k.log(None, 5).unwrap();
    assert_eq!(log[0].summary, "templates: add Recipe and Road trip");
    // Nothing missing: no write and no commit.
    assert!(
        k.add_starter_templates(&Actor::Human, NOW)
            .unwrap()
            .is_empty()
    );
    assert_eq!(k.log(None, 5).unwrap()[0].id, log[0].id);
}

#[test]
fn a_new_page_can_start_from_an_added_template() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    fs::remove_file(root.join("templates/packing-list.md")).unwrap();
    let k = Kasten::open(&root).unwrap();
    k.add_starter_templates(&Actor::Human, NOW).unwrap();
    let text = fs::read_to_string(root.join("templates/packing-list.md")).unwrap();
    assert!(text.contains("## Documents"));
}
