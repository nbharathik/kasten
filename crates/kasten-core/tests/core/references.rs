//! The bibliography of a vault: the text of its `.bib` files, which the
//! citations of decks are looked up in.

use crate::common;

use std::fs;

use common::dev_vault;
use kasten_core::Kasten;
use kasten_core::MAX_BIB_BYTES;

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    (t, k)
}

fn at(text: &str, needle: &str) -> usize {
    text.find(needle)
        .unwrap_or_else(|| panic!("`{needle}` is not in the bibliography"))
}

#[test]
fn is_the_text_of_every_bib_file_one_after_another_in_the_order_of_their_paths() {
    let (t, k) = open();
    let root = t.vault.root();
    fs::create_dir_all(root.join("papers/deep")).unwrap();
    fs::write(root.join("papers/deep/c.bib"), "@article{third, title={C}}").unwrap();
    fs::write(root.join("papers/b.bib"), "@article{second, title={B}}").unwrap();
    fs::write(root.join("0-first.bib"), "@article{first, title={A}}").unwrap();
    let text = k.references().unwrap();
    assert!(at(&text, "@article{first") < at(&text, "@article{second"));
    assert!(at(&text, "@article{second") < at(&text, "@article{third"));
}

#[test]
fn leaves_out_what_is_hidden_or_private_and_what_is_not_a_bib_file() {
    let (t, k) = open();
    let root = t.vault.root();
    for dir in [".kasten", ".trash", ".git", ".hidden"] {
        fs::create_dir_all(root.join(dir)).unwrap();
        fs::write(
            root.join(dir).join("x.bib"),
            "@article{zz-private, title={No}}",
        )
        .unwrap();
    }
    fs::write(root.join(".dot.bib"), "@article{zz-dotfile, title={No}}").unwrap();
    fs::write(root.join("notes.bib.txt"), "@article{zz-text, title={No}}").unwrap();
    fs::write(root.join("kept.bib"), "@article{kept, title={Yes}}").unwrap();
    let text = k.references().unwrap();
    assert!(text.contains("@article{kept"));
    for left_out in ["zz-private", "zz-dotfile", "zz-text"] {
        assert!(!text.contains(left_out), "{left_out} should not be read");
    }
}

#[cfg(unix)]
#[test]
fn does_not_follow_a_link_out_of_the_vault() {
    let (t, k) = open();
    let outside = t.vault.root().parent().unwrap().join(format!(
        "outside-{}.bib",
        t.vault.root().file_name().unwrap().to_string_lossy()
    ));
    fs::write(&outside, "@article{zz-outside, title={No}}").unwrap();
    std::os::unix::fs::symlink(&outside, t.vault.root().join("link.bib")).unwrap();
    assert!(!k.references().unwrap().contains("zz-outside"));
}

#[test]
fn a_file_that_is_too_big_is_left_out_and_the_rest_are_read() {
    let (t, k) = open();
    let root = t.vault.root();
    let big = format!(
        "@article{{zz-huge, title={{{}}}}}",
        "x".repeat(MAX_BIB_BYTES as usize)
    );
    fs::write(root.join("a-huge.bib"), big).unwrap();
    fs::write(root.join("b-small.bib"), "@article{small, title={Yes}}").unwrap();
    let text = k.references().unwrap();
    assert!(!text.contains("zz-huge"));
    assert!(text.contains("@article{small"));
}

#[test]
fn text_that_is_not_utf8_is_read_as_far_as_it_makes_sense() {
    let (t, k) = open();
    fs::write(
        t.vault.root().join("latin1.bib"),
        b"@article{latin1, title={Caf\xe9}}\n@article{after, title={Fine}}".as_slice(),
    )
    .unwrap();
    let text = k.references().unwrap();
    assert!(text.contains("@article{latin1") && text.contains("@article{after"));
}

#[test]
fn the_dev_vault_has_a_small_bibliography_of_real_looking_works() {
    let (_t, k) = open();
    let text = k.references().unwrap();
    for key in [
        "vaswani2017attention",
        "devlin2019bert",
        "he2016resnet",
        "brown2020language",
        "lecun2015deep",
        "goodfellow2016deep",
    ] {
        assert!(text.contains(&format!("{{{key},")), "{key}");
    }
}
