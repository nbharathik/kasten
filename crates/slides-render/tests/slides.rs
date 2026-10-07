//! A slide at a step and a scale, with pictures, without them, and with a deck that reaches for the network.

mod common;

use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;

use common::{colours, deck, decode, ink, one_at_a_time, renderer};
use serde_json::json;
use slides_core::Engine;
use slides_render::{Error, FolderMedia, Options};

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-render-{name}-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

/// A deck with one blank slide added to the title slide, holding an image element at (100, 100) of 300 x 200 units.
fn deck_with_picture(src: &str) -> slides_core::Deck {
    let mut engine = Engine::new(deck("minimal.deck"), 11);
    let slide = engine
        .apply("add_slide", json!({ "layout": "blank" }))
        .unwrap_or_else(|e| panic!("{e}"))
        .output["slide"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let element = json!({ "type": "image", "id": "pic", "x": 100, "y": 100, "w": 300, "h": 200, "src": src, "alt": "A picture" });
    engine
        .apply(
            "add_elements",
            json!({ "slide": slide, "elements": [element] }),
        )
        .unwrap_or_else(|e| panic!("{e}"));
    engine.deck().clone()
}

/// A PNG of one colour.
fn solid(width: u32, height: u32, rgb: [u8; 3]) -> Vec<u8> {
    let mut bytes = Vec::new();
    let picture = image::RgbImage::from_pixel(width, height, image::Rgb(rgb));
    picture
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap_or_else(|e| panic!("{e}"));
    bytes
}

fn request_error(result: Result<slides_render::Png, Error>) -> String {
    match result {
        Err(Error::Request(message)) => message,
        Err(other) => panic!("wrong kind of error: {other:?}"),
        Ok(_) => panic!("it should have failed"),
    }
}

#[test]
fn a_slide_is_drawn_at_each_scale_and_at_each_step() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let deck = deck("composites.deck");
    for (scale, size) in [
        (0.5, (480, 270)),
        (1.0, (960, 540)),
        (2.0, (1920, 1080)),
        (4.0, (3840, 2160)),
    ] {
        let png = renderer
            .render_slide(&deck, 0, None, scale)
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!((png.width, png.height), size, "scale {scale}");
    }
    // Slide 4 of the fixture has four steps: it grows.
    let begin = renderer
        .render_slide(&deck, 3, Some(0), 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    let end = renderer
        .render_slide(&deck, 3, Some(4), 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    let last = renderer
        .render_slide(&deck, 3, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    assert_ne!(
        begin.bytes, end.bytes,
        "step 0 and step 4 are not the same picture"
    );
    assert_eq!(
        end.bytes, last.bytes,
        "the last step is what a slide without a step shows"
    );
    assert!(ink(&decode(&end.bytes)) > 2000 && ink(&decode(&begin.bytes)) > 2000);
}

#[test]
fn what_cannot_be_drawn_is_said_in_words_that_say_what_to_do() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let deck = deck("composites.deck");
    let message = request_error(renderer.render_slide(&deck, 99, None, 1.0));
    assert!(
        message.contains("no slide 100") && message.contains("12"),
        "{message}"
    );
    let message = request_error(renderer.render_slide(&deck, 3, Some(9), 1.0));
    assert!(
        message.contains("steps 0 to 4") && message.contains("step 9"),
        "{message}"
    );
    let message = request_error(renderer.render_slide(&deck, 0, Some(2), 1.0));
    assert!(
        message.contains("no steps") && message.contains("Leave the step out"),
        "{message}"
    );
    for scale in [0.0, 9.0, f32::NAN] {
        let message = request_error(renderer.render_slide(&deck, 0, None, scale));
        assert!(
            message.contains("scale") && message.contains("0.25") && message.contains('4'),
            "{message}"
        );
    }
    // The host is still fine after all that.
    assert!(renderer.render_slide(&deck, 0, None, 1.0).is_ok());
}

#[test]
fn a_picture_the_deck_names_is_read_from_the_folder_and_drawn() {
    let _one = one_at_a_time();
    let dir = scratch("pictures");
    fs::create_dir_all(dir.join("assets")).unwrap_or_else(|e| panic!("{e}"));
    fs::write(dir.join("assets/red.png"), solid(30, 20, [230, 30, 30]))
        .unwrap_or_else(|e| panic!("{e}"));
    let media = FolderMedia::new(&dir).unwrap_or_else(|e| panic!("{e}"));
    let Some(renderer) = renderer(Options {
        media: Arc::new(media),
        ..Options::default()
    }) else {
        let _ = fs::remove_dir_all(&dir);
        return;
    };
    let with = deck_with_picture("assets/red.png");
    let png = renderer
        .render_slide(&with, 1, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    assert!(png.warnings.is_empty(), "{:?}", png.warnings);
    let picture = decode(&png.bytes);
    let middle = picture.get_pixel(250, 200).0;
    assert!(
        middle[0] > 200 && middle[1] < 80 && middle[2] < 80,
        "the picture's place is not red: {middle:?}"
    );

    // A picture the folder does not have is a hole and a warning, every time the slide is drawn.
    let missing = deck_with_picture("assets/gone.png");
    for _ in 0..2 {
        let png = renderer
            .render_slide(&missing, 1, None, 1.0)
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(png.warnings.len(), 1, "{:?}", png.warnings);
        assert!(
            png.warnings[0].contains("assets/gone.png")
                && png.warnings[0].contains("could not be found"),
            "{:?}",
            png.warnings
        );
    }
    // A path that tries to leave the folder is never asked for: the slide is drawn without the picture.
    let escaping = deck_with_picture("../secret.png");
    let png = renderer
        .render_slide(&escaping, 1, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    let middle = decode(&png.bytes).get_pixel(250, 200).0;
    assert!(
        !(middle[0] > 200 && middle[1] < 80),
        "something was drawn from outside the folder"
    );
    drop(renderer);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_deck_cannot_make_the_browser_fetch_anything() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    // Something is listening on this computer; a deck that names it must not reach it.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap_or_else(|e| panic!("{e}"));
    listener
        .set_nonblocking(true)
        .unwrap_or_else(|e| panic!("{e}"));
    let port = listener.local_addr().map(|a| a.port()).unwrap_or_default();
    for src in [
        format!("http://127.0.0.1:{port}/tracker.png"),
        format!("http://localhost:{port}/tracker.png"),
        "https://example.com/tracker.png".to_owned(),
        "file:///etc/hostname".to_owned(),
    ] {
        let png = renderer
            .render_slide(&deck_with_picture(&src), 1, None, 1.0)
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!((png.width, png.height), (960, 540), "{src}");
        assert!(colours(&decode(&png.bytes)) >= 1);
    }
    match listener.accept() {
        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
        other => panic!("the browser connected to something: {other:?}"),
    }
}
