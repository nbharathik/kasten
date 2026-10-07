use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::*;

fn scratch(name: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "slides-render-{name}-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

#[test]
fn a_picture_path_inside_the_folder_is_kept() {
    assert_eq!(
        inside("assets/figure.png"),
        Some(PathBuf::from("assets/figure.png"))
    );
    assert_eq!(inside("./a/./b.png"), Some(PathBuf::from("a/b.png")));
}

#[test]
fn a_path_that_leaves_the_folder_is_refused() {
    for bad in [
        "",
        ".",
        "../secret.png",
        "a/../../secret.png",
        "a/..",
        "/etc/passwd",
        "C:\\x.png",
        "a\\b.png",
        "a\0b",
    ] {
        assert_eq!(inside(bad), None, "{bad:?}");
    }
}

#[test]
fn a_folder_gives_its_pictures_and_only_those() {
    let dir = scratch("media");
    fs::create_dir_all(dir.join("assets")).unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("assets/a.png"), b"picture").unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("secret.txt"), b"secret").unwrap_or_else(|e| panic!("{e}"));
    let media = FolderMedia::new(dir.join("assets")).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(media.read("a.png"), Some(b"picture".to_vec()));
    assert_eq!(media.read("missing.png"), None);
    assert_eq!(media.read("../secret.txt"), None);
    assert_eq!(media.read(""), None);
    // A folder is not a picture.
    fs::create_dir_all(dir.join("assets/folder")).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(media.read("folder"), None);
    let _ = fs::remove_dir_all(&dir);
}

#[cfg(unix)]
#[test]
fn a_link_out_of_the_folder_is_not_followed() {
    let dir = scratch("media-link");
    let inner = dir.join("assets");
    fs::create_dir_all(&inner).unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("secret.txt"), b"secret").unwrap_or_else(|e| panic!("{e}"));
    std::os::unix::fs::symlink(dir.join("secret.txt"), inner.join("link.png"))
        .unwrap_or_else(|e| panic!("{e}"));
    let media = FolderMedia::new(&inner).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(media.read("link.png"), None);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn there_is_no_folder_to_read_from_when_it_is_missing() {
    assert!(FolderMedia::new("/definitely/not/here").is_err());
    assert_eq!(NoMedia.read("a.png"), None);
}

#[test]
fn the_kind_of_picture_comes_from_its_bytes_then_its_name() {
    let png = b"\x89PNG\r\n\x1a\nrest";
    assert_eq!(
        media_type(png, "x.jpg"),
        "image/png",
        "bytes win over the name"
    );
    assert_eq!(
        media_type(b"<svg xmlns='http://www.w3.org/2000/svg'/>", "x"),
        "image/svg+xml"
    );
    assert_eq!(media_type(b"....", "photo.AVIF"), "image/avif");
    assert_eq!(media_type(b"....", "thing"), "application/octet-stream");
}
