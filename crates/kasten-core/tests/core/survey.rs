//! What a folder holds, before anyone opens it: a Kasten vault (its name and
//! format), an Obsidian vault, or plain Markdown in folders. Read only.

use std::fs;
use std::path::{Path, PathBuf};

use kasten_core::{Instant, Kasten, survey, ulid_at};

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "kasten-survey-{name}-{}",
        ulid_at(Instant::now().millis)
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write(dir: &Path, rel: &str, text: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

#[test]
fn knows_a_kasten_vault_by_its_config() {
    let dir = scratch("kasten");
    Kasten::init(&dir, "My notes").unwrap();
    let found = survey(&dir).unwrap();
    let vault = found.kasten.expect("a Kasten vault");
    assert_eq!(
        (vault.name.as_str(), vault.format, vault.readable),
        ("My notes", 1, true)
    );
    assert!(!found.obsidian);
    // One from a newer Kasten says so, so the chooser can explain.
    let config = dir.join(".kasten/config.yaml");
    let text = fs::read_to_string(&config).unwrap();
    fs::write(&config, text.replace("format: 1", "format: 9")).unwrap();
    let newer = survey(&dir).unwrap().kasten.unwrap();
    assert_eq!((newer.format, newer.readable), (9, false));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn counts_the_notes_and_folders_of_another_app_s_vault() {
    let dir = scratch("obsidian");
    write(&dir, ".obsidian/app.json", "{}");
    write(&dir, "Welcome.md", "# Welcome\n");
    write(&dir, "Areas/Health/Sleep.md", "Eight hours.\n");
    write(&dir, "Areas/Work.md", "Plans.\n");
    write(&dir, "Daily/2026-09-25.md", "A day.\n");
    write(&dir, "Attachments/photo.png", "not text");
    // Hidden folders are not notes.
    write(&dir, ".trash/old.md", "gone\n");
    let found = survey(&dir).unwrap();
    assert!(found.kasten.is_none());
    assert!(found.obsidian);
    assert_eq!(found.notes, 4);
    assert!(!found.more);
    assert_eq!(found.folders, ["Areas", "Daily"]);
    // Surveying writes nothing.
    assert!(!dir.join(".kasten").exists());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn an_empty_folder_holds_nothing_and_a_missing_one_is_an_error() {
    let dir = scratch("empty");
    let found = survey(&dir).unwrap();
    assert!(
        found.kasten.is_none() && !found.obsidian && found.notes == 0 && found.folders.is_empty()
    );
    assert!(survey(dir.join("missing")).is_err());
    let _ = fs::remove_dir_all(&dir);
}
