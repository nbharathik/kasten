use std::fs;

use super::*;
use crate::bundle::Page;
use crate::media::NoMedia;

/// A page folder with an index, a script and a style sheet, and a picture source holding one picture.
struct Kit {
    dir: std::path::PathBuf,
    page: Page,
}

impl Kit {
    fn new(name: &str) -> Kit {
        let dir =
            std::env::temp_dir().join(format!("slides-render-route-{name}-{}", std::process::id()));
        fs::create_dir_all(dir.join("assets")).unwrap_or_else(|e| panic!("{e}"));
        fs::write(dir.join("index.html"), "<html>").unwrap_or_else(|e| panic!("{e}"));
        fs::write(dir.join("assets/app.js"), "let x").unwrap_or_else(|e| panic!("{e}"));
        let page = Page::Folder(dir.clone());
        Kit { dir, page }
    }
}

impl Drop for Kit {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

struct One;

impl Media for One {
    fn read(&self, path: &str) -> Option<Vec<u8>> {
        (path == "assets/a b.png").then(|| b"\x89PNG\r\n\x1a\nxxxx".to_vec())
    }
}

fn sent(answer: Answer) -> Response {
    match answer {
        Answer::Send(response) => response,
        Answer::Block => panic!("the request was blocked"),
    }
}

fn header<'a>(response: &'a Response, name: &str) -> Option<&'a str> {
    response
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

#[test]
fn the_pages_own_addresses_are_routed_and_no_others() {
    assert_eq!(
        route("http://slides-render.localhost/"),
        Route::Page("/".into())
    );
    assert_eq!(
        route("http://slides-render.localhost/index.html"),
        Route::Page("/index.html".into())
    );
    assert_eq!(
        route("http://slides-render.localhost/assets/app.js?v=3#x"),
        Route::Page("/assets/app.js".into())
    );
    assert_eq!(
        route("HTTP://Slides-Render.LocalHost/assets/app.js"),
        Route::Page("/assets/app.js".into())
    );
    assert_eq!(
        route("http://slides-render.localhost"),
        Route::Page("/".into())
    );
    for other in [
        "https://slides-render.localhost/",
        "http://slides-render.localhost.evil.example/",
        "http://evil.example/slides-render.localhost/",
        "http://slides-render.localhost:8080/",
        "http://127.0.0.1/",
        "https://example.com/x.png",
        "file:///etc/passwd",
        "ws://slides-render.localhost/",
        "not a url",
        "",
    ] {
        assert_eq!(route(other), Route::Refused, "{other}");
    }
}

#[test]
fn a_picture_is_asked_for_by_its_decoded_path_and_cannot_leave_the_folder() {
    assert_eq!(
        route("http://slides-render.localhost/media/assets/a%20b.png"),
        Route::Media("assets/a b.png".into())
    );
    assert_eq!(
        route("http://slides-render.localhost/media/caf%C3%A9.png?x"),
        Route::Media("café.png".into())
    );
    for bad in [
        "/media/../secret",
        "/media/%2e%2e/secret",
        "/media/a/%2E%2E/b",
        "/media/",
        "/media/%zz",
        "/media/%ff",
        "/media/a%5Cb",
        "/media/a%00b",
        "/media/%2Fetc/passwd",
    ] {
        assert_eq!(
            route(&format!("http://slides-render.localhost{bad}")),
            Route::Refused,
            "{bad}"
        );
    }
}

#[test]
fn page_paths_cannot_leave_the_page_either() {
    for bad in ["/../x", "/%2e%2e/x", "/a/%2e%2e/b", "/a%5Cb"] {
        assert_eq!(
            route(&format!("http://slides-render.localhost{bad}")),
            Route::Refused,
            "{bad}"
        );
    }
}

#[test]
fn percent_decoding_is_strict() {
    assert_eq!(percent_decode("a%20b").as_deref(), Some("a b"));
    assert_eq!(percent_decode("plain").as_deref(), Some("plain"));
    assert_eq!(percent_decode("%e2%82%ac").as_deref(), Some("€"));
    assert_eq!(percent_decode("%e2%82"), None, "not text");
    assert_eq!(percent_decode("%4"), None);
    assert_eq!(percent_decode("%4g"), None);
}

#[test]
fn files_of_the_page_are_sent_with_their_type_and_the_index_with_its_policy() {
    let kit = Kit::new("page");
    let mut notes = Vec::new();
    let index = sent(respond(
        "http://slides-render.localhost/",
        &kit.page,
        &NoMedia,
        &mut notes,
    ));
    assert_eq!(index.status, 200);
    assert_eq!(&*index.body, b"<html>");
    assert_eq!(
        header(&index, "content-type"),
        Some("text/html; charset=utf-8")
    );
    let policy = header(&index, "content-security-policy").unwrap_or_default();
    assert!(
        policy.contains("default-src 'none'")
            && policy.contains("connect-src 'self'")
            && !policy.contains("http:")
            && !policy.contains("https:"),
        "{policy}"
    );
    assert_eq!(header(&index, "x-content-type-options"), Some("nosniff"));

    let script = sent(respond(
        "http://slides-render.localhost/assets/app.js",
        &kit.page,
        &NoMedia,
        &mut notes,
    ));
    assert_eq!(
        header(&script, "content-type"),
        Some("text/javascript; charset=utf-8")
    );
    assert!(header(&script, "content-security-policy").is_none());

    let missing = sent(respond(
        "http://slides-render.localhost/assets/nope.js",
        &kit.page,
        &NoMedia,
        &mut notes,
    ));
    assert_eq!(missing.status, 404);
    assert!(
        notes.is_empty(),
        "a file of the page that is missing is not the deck's fault: {notes:?}"
    );
}

#[test]
fn a_picture_is_sent_as_what_it_is_and_never_kept() {
    let kit = Kit::new("media");
    let mut notes = Vec::new();
    let picture = sent(respond(
        "http://slides-render.localhost/media/assets/a%20b.png",
        &kit.page,
        &One,
        &mut notes,
    ));
    assert_eq!(picture.status, 200);
    assert_eq!(header(&picture, "content-type"), Some("image/png"));
    assert_eq!(header(&picture, "cache-control"), Some("no-store"));
    assert!(
        header(&picture, "content-security-policy")
            .unwrap_or_default()
            .contains("sandbox")
    );
    assert!(notes.is_empty());
}

#[test]
fn a_missing_picture_is_told_of_once() {
    let kit = Kit::new("missing");
    let mut notes = Vec::new();
    for _ in 0..3 {
        let answer = sent(respond(
            "http://slides-render.localhost/media/assets/gone.png",
            &kit.page,
            &One,
            &mut notes,
        ));
        assert_eq!(answer.status, 404);
    }
    assert_eq!(notes.len(), 1);
    assert!(
        notes[0].contains("assets/gone.png") && notes[0].contains("could not be found"),
        "{notes:?}"
    );
}

#[test]
fn addresses_on_the_web_are_blocked_and_told_of() {
    let kit = Kit::new("web");
    let mut notes = Vec::new();
    assert!(matches!(
        respond(
            "https://example.com/tracker.png",
            &kit.page,
            &One,
            &mut notes
        ),
        Answer::Block
    ));
    assert!(matches!(
        respond("http://127.0.0.1:9/", &kit.page, &One, &mut notes),
        Answer::Block
    ));
    assert_eq!(notes.len(), 2);
    assert!(
        notes[0].contains("https://example.com/tracker.png")
            && notes[0].contains("without a network"),
        "{notes:?}"
    );
}

#[test]
fn a_deck_that_names_many_missing_pictures_does_not_flood_the_warnings() {
    let kit = Kit::new("flood");
    let mut notes = Vec::new();
    for n in 0..100 {
        let _ = respond(
            &format!("http://slides-render.localhost/media/p{n}.png"),
            &kit.page,
            &One,
            &mut notes,
        );
    }
    assert_eq!(notes.len(), MOST_NOTES);
}
