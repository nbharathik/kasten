//! A whole deck at once: the grid, the PDF, the offline web page and the set of pictures.

mod common;

use common::{colours, deck, decode, ink, one_at_a_time, poppler, renderer};
use slides_render::{HtmlOptions, Options, PdfOptions, PngOptions, Scope, Steps};

/// The size of a PDF's pages in points, from what `pdfinfo` printed.
fn page_size(info: &str) -> Option<(f64, f64)> {
    let line = info.lines().find(|l| l.starts_with("Page size:"))?;
    let mut numbers = line
        .split_whitespace()
        .filter_map(|word| word.parse::<f64>().ok());
    Some((numbers.next()?, numbers.next()?))
}

fn near(size: Option<(f64, f64)>, width: f64, height: f64) -> bool {
    size.is_some_and(|(w, h)| (w - width).abs() < 0.6 && (h - height).abs() < 0.6)
}

#[test]
fn every_slide_is_in_one_labelled_picture() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let deck = deck("composites.deck");
    let grid = renderer
        .render_grid(&deck, None)
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(grid.width, 1600);
    assert!(grid.height > 600 && grid.height < 1200, "{}", grid.height);
    let picture = decode(&grid.bytes);
    assert_eq!(picture.dimensions(), (grid.width, grid.height));
    assert!(colours(&picture) > 50 && ink(&picture) > 100_000);
    let narrow = renderer
        .render_grid(&deck, Some(2))
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(narrow.width, 1600);
    assert!(
        narrow.height > grid.height,
        "two columns are taller than four"
    );
}

#[test]
fn the_deck_prints_to_a_pdf_with_a_page_for_each_slide_and_text_that_is_text() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let deck = deck("composites.deck");
    let pdf = renderer
        .pdf(&deck, &PdfOptions::default())
        .unwrap_or_else(|e| panic!("{e}"));
    assert!(pdf.bytes.starts_with(b"%PDF-"));
    assert_eq!(pdf.pages, 12);
    if let Some(info) = poppler("pdfinfo", &["-"], &pdf.bytes).filter(|t| t.contains("Pages")) {
        assert!(info.contains("Pages:           12"), "{info}");
        // 960 x 540 units are 720 x 405 points.
        assert!(near(page_size(&info), 720.0, 405.0), "{info}");
        assert!(
            info.contains("Composite elements"),
            "the title of the deck is the PDF's title: {info}"
        );
    } else {
        eprintln!("NOTE: pdfinfo is not installed; the page count was not read back from the file");
    }
    if let Some(text) =
        poppler("pdftotext", &["-", "-"], &pdf.bytes).filter(|t| !t.trim().is_empty())
    {
        for word in [
            "Composite elements",
            "Formulas",
            "A conversation",
            "Six cards",
        ] {
            assert!(text.contains(word), "{word} is not live text in the PDF");
        }
    } else {
        eprintln!("NOTE: pdftotext is not installed; the text was not read back from the file");
    }
    // A page for every step of the slide that has steps: four more.
    let each = renderer
        .pdf(
            &deck,
            &PdfOptions {
                steps: Steps::Each,
                notes: false,
            },
        )
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(each.pages, 16);
    // Handouts are portrait pages.
    let handout = renderer
        .pdf(
            &deck,
            &PdfOptions {
                steps: Steps::Final,
                notes: true,
            },
        )
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(handout.pages, 12);
    if let Some(info) =
        poppler("pdfinfo", &["-"], &handout.bytes).filter(|t| t.contains("Page size"))
    {
        assert!(
            near(page_size(&info), 595.0, 842.0) || near(page_size(&info), 595.5, 842.0),
            "A4 pages: {info}"
        );
    }
}

#[test]
fn a_four_by_three_deck_prints_on_four_by_three_pages() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let pdf = renderer
        .pdf(&deck("four-three.deck"), &PdfOptions::default())
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(pdf.pages, 2);
    if let Some(info) = poppler("pdfinfo", &["-"], &pdf.bytes).filter(|t| t.contains("Page size")) {
        // 720 x 540 units are 540 x 405 points.
        assert!(near(page_size(&info), 540.0, 405.0), "{info}");
    }
}

#[test]
fn the_offline_web_page_holds_the_slides_and_reaches_for_nothing() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let deck = deck("composites.deck");
    let html = renderer
        .html(&deck, &HtmlOptions::default())
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(html.name, "Composite elements.html");
    assert!(
        html.text.starts_with("<!doctype html>"),
        "{}",
        &html.text[..40.min(html.text.len())]
    );
    assert!(html.text.contains("Composite elements") && html.text.contains("Reveal"));
    for external in ["src=\"http", "href=\"http", "url(http", "@import"] {
        assert!(
            !html.text.contains(external),
            "the page reaches for {external}"
        );
    }
    let named = renderer
        .html(
            &deck,
            &HtmlOptions {
                name: Some("talk.html".into()),
            },
        )
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(named.name, "talk.html");
}

#[test]
fn a_set_of_pictures_is_named_as_the_editor_names_them() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let deck = deck("composites.deck");
    let all = renderer
        .png(
            &deck,
            &PngOptions {
                scale: 1.0,
                ..PngOptions::default()
            },
        )
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(all.len(), 12);
    assert_eq!(all[0].name, "slide-01.png");
    assert_eq!(all[11].name, "slide-12.png");
    assert!(
        all.iter()
            .all(|p| (p.png.width, p.png.height) == (960, 540))
    );
    let steps = renderer
        .png(
            &deck,
            &PngOptions {
                scale: 1.0,
                steps: Steps::Each,
                ..PngOptions::default()
            },
        )
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(steps.len(), 16);
    assert!(
        steps
            .iter()
            .any(|p| p.name == "slide-04-step-2.png" && p.step == Some(2)),
        "{:?}",
        steps.iter().map(|p| &p.name).collect::<Vec<_>>()
    );
    let one = renderer
        .png(
            &deck,
            &PngOptions {
                scope: Scope::Slide(4),
                scale: 2.0,
                steps: Steps::Final,
            },
        )
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(one.len(), 1);
    assert_eq!((one[0].png.width, one[0].png.height), (1920, 1080));
    assert_eq!(one[0].number, 5);
    match renderer.png(
        &deck,
        &PngOptions {
            scope: Scope::Slide(99),
            ..PngOptions::default()
        },
    ) {
        Err(slides_render::Error::Request(message)) => {
            assert!(message.contains("no slide 100"), "{message}")
        }
        other => panic!("a slide that is not there should be refused: {other:?}"),
    }
}
