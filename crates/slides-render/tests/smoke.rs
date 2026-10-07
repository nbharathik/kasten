//! The render host with a real browser: the first slide of a fixture deck comes back as a picture.

mod common;

use common::{colours, deck, decode, ink, one_at_a_time, renderer};
use slides_render::Options;

#[test]
fn a_slide_comes_back_as_a_picture_of_the_right_size() {
    let _one = one_at_a_time();
    let launching = std::time::Instant::now();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    eprintln!(
        "launch (browser started, page loaded, engine ready): {:?}",
        launching.elapsed()
    );
    let deck = deck("text-heavy.deck");
    let started = std::time::Instant::now();
    let png = renderer
        .render_slide(&deck, 1, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    eprintln!("first render: {:?}", started.elapsed());
    assert_eq!((png.width, png.height), (960, 540));
    let picture = decode(&png.bytes);
    assert_eq!(picture.dimensions(), (960, 540));
    assert!(colours(&picture) > 8, "the slide is blank");
    assert!(ink(&picture) > 2000, "hardly anything is on the slide");
    let started = std::time::Instant::now();
    let twice = renderer
        .render_slide(&deck, 1, None, 2.0)
        .unwrap_or_else(|e| panic!("{e}"));
    eprintln!("second render at 2x: {:?}", started.elapsed());
    assert_eq!((twice.width, twice.height), (1920, 1080));
}

#[test]
fn a_page_from_a_folder_can_stand_in_for_the_built_in_one() {
    let _one = one_at_a_time();
    let dist = common::fixtures().join("../packages/slides-render-page/dist");
    if !dist.join("index.html").is_file() {
        eprintln!(
            "SKIPPED: the render page is not built in {}",
            dist.display()
        );
        return;
    }
    let options = Options {
        page: Some(slides_render::bundle::Page::Folder(dist)),
        ..Options::default()
    };
    let Some(renderer) = renderer(options) else {
        return;
    };
    let png = renderer
        .render_slide(&deck("minimal.deck"), 0, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!((png.width, png.height), (960, 540));
    assert!(ink(&decode(&png.bytes)) > 1000);
}
