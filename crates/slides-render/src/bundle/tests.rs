use std::ffi::OsString;
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

fn env(vars: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
    let vars: Vec<(String, OsString)> = vars
        .iter()
        .map(|(k, v)| ((*k).to_owned(), OsString::from(v)))
        .collect();
    move |name| vars.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone())
}

#[test]
fn request_paths_become_page_paths_and_cannot_leave_the_page() {
    assert_eq!(page_path("/").as_deref(), Some("index.html"));
    assert_eq!(page_path("").as_deref(), Some("index.html"));
    assert_eq!(
        page_path("/assets/app-1.js").as_deref(),
        Some("assets/app-1.js")
    );
    for bad in ["/../secret", "/a/../b", "/a//b", "/a/./b", "/a\\b", "/a\0b"] {
        assert_eq!(page_path(bad), None, "{bad:?}");
    }
}

#[test]
fn files_are_sent_as_what_they_are() {
    assert_eq!(content_type("index.html"), "text/html; charset=utf-8");
    assert_eq!(
        content_type("assets/app.js"),
        "text/javascript; charset=utf-8"
    );
    assert_eq!(content_type("assets/style.css"), "text/css; charset=utf-8");
    assert_eq!(content_type("assets/engine.wasm"), "application/wasm");
    assert_eq!(content_type("assets/inter.woff2"), "font/woff2");
    assert_eq!(
        content_type("assets/unknown.bin"),
        "application/octet-stream"
    );
}

#[test]
fn a_folder_is_a_page_when_it_has_an_index() {
    let dir = scratch("page");
    fs::create_dir_all(dir.join("assets")).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(
        Page::locate_with(
            env(&[("SLIDES_RENDER_PAGE", dir.to_str().unwrap_or_default())]),
            None
        ),
        None,
        "no index, no page"
    );
    fs::write(dir.join("index.html"), "<html>").unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("assets/app.js"), "let x").unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("secret.txt"), "no").unwrap_or_else(|e| panic!("{e}"));
    let page = Page::locate_with(
        env(&[("SLIDES_RENDER_PAGE", dir.to_str().unwrap_or_default())]),
        None,
    )
    .unwrap_or_else(|| panic!("a page"));
    assert_eq!(page, Page::Folder(dir.clone()));
    let index = page.get("/").unwrap_or_else(|| panic!("the index"));
    assert_eq!(&*index.bytes, b"<html>");
    assert_eq!(index.content_type, "text/html; charset=utf-8");
    assert_eq!(
        page.get("/assets/app.js").map(|f| f.bytes.to_vec()),
        Some(b"let x".to_vec())
    );
    assert!(page.get("/assets/missing.js").is_none());
    assert!(page.get("/assets").is_none(), "a folder is not a file");
    assert!(page.get("/../index.html").is_none());
    assert!(page.describe().contains("folder"));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_folder_that_is_named_but_has_no_page_is_not_silently_replaced() {
    let dir = scratch("named");
    assert_eq!(
        Page::locate_with(
            env(&[("SLIDES_RENDER_PAGE", dir.to_str().unwrap_or_default())]),
            None
        ),
        None
    );
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn the_folder_beside_the_program_is_used_when_nothing_is_built_in() {
    let dir = scratch("beside");
    fs::write(dir.join("index.html"), "<html>").unwrap_or_else(|e| panic!("{e}"));
    let located = Page::locate_with(env(&[]), Some(dir.clone()));
    if embedded_files()
        .iter()
        .any(|(path, _)| *path == "index.html")
    {
        assert_eq!(
            located,
            Some(Page::Embedded),
            "what is built in comes first"
        );
    } else {
        assert_eq!(located, Some(Page::Folder(dir.clone())));
    }
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn the_built_in_page_is_whole_when_there_is_one() {
    let files = embedded_files();
    if files.is_empty() {
        eprintln!(
            "SKIPPED: this build embeds no render page (run `node scripts/build-render-page.mjs`, then build again)"
        );
        return;
    }
    let page = Page::Embedded;
    let index = page
        .get("/")
        .unwrap_or_else(|| panic!("the built-in page has an index"));
    let text = String::from_utf8_lossy(&index.bytes).into_owned();
    // Every file the index names is in the page.
    let mut named = 0;
    for part in text.split(['"', '\'']) {
        if let Some(path) = part.strip_prefix("/assets/") {
            named += 1;
            assert!(
                page.get(&format!("/assets/{path}")).is_some(),
                "the index names /assets/{path}, which is not in the page"
            );
        }
    }
    assert!(
        named >= 2,
        "the index should name a script and a style sheet"
    );
    assert!(
        files.iter().any(|(path, _)| path.ends_with(".wasm")),
        "the engine is in the page"
    );
    assert!(embedded_size() > 100_000);
}
