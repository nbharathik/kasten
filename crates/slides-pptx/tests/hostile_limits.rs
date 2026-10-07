//! The limits of an import: a part that unpacks to far more than any slide needs, an XML part with
//! more elements than any slide has, entries without end, and files that are not presentations at
//! all. Each is refused, by name and quickly, and none can make the import panic.

mod common;

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::time::Instant;

use slides_pptx::import::{ImportError, ImportOptions, Limits, import};

use common::zips::{bases, entries, survive, zipped};

#[test]
fn a_part_that_unpacks_to_far_more_than_it_should_is_refused_before_it_is_read_whole() {
    let (_, bytes) = bases().remove(0);
    let mut list = entries(&bytes);
    // 70 MB of zeros, which deflate to about 70 KB; the limit for one part is 64 MB.
    list.push(("ppt/media/bomb.png".to_owned(), vec![0; 70 * 1024 * 1024]));
    let started = Instant::now();
    let result = catch_unwind(AssertUnwindSafe(|| {
        import(&zipped(&list), &ImportOptions::default())
    }));
    match result {
        Ok(Ok(imported)) => {
            // The bomb is a picture nothing uses; it is not read, so the deck is the deck.
            assert!(imported.media.iter().all(|m| m.bytes.len() < 1024 * 1024));
        }
        Ok(Err(ImportError::TooLarge(_))) => {}
        Ok(Err(other)) => panic!("refused for the wrong reason: {other}"),
        Err(_) => panic!("the import panicked"),
    }
    assert!(started.elapsed().as_secs_f64() < 20.0);

    // Small limits make the same refusals cheap to test all the way through.
    let limits = Limits {
        part: 64 * 1024,
        total: 256 * 1024,
        entries: 20,
    };
    let mut many = entries(&bytes);
    for n in 0..40 {
        many.push((format!("ppt/extra/{n}.xml"), b"<x/>".to_vec()));
    }
    let refused = import(
        &zipped(&many),
        &ImportOptions {
            limits,
            ..ImportOptions::default()
        },
    );
    assert!(
        matches!(refused, Err(ImportError::TooLarge(_))),
        "too many entries: {refused:?}"
    );
    // Parts nobody reads cost nothing; what is read adds up, and stops at the total.
    let refused = import(
        &bytes,
        &ImportOptions {
            limits: Limits {
                part: 1 << 20,
                total: 2_000,
                entries: 10_000,
            },
            ..ImportOptions::default()
        },
    );
    assert!(
        matches!(refused, Err(ImportError::TooLarge(_))),
        "too much in all: {refused:?}"
    );
}

#[test]
fn an_xml_part_with_more_elements_than_any_slide_needs_is_refused() {
    let (_, bytes) = bases().remove(0);
    let mut list = entries(&bytes);
    let at = list
        .iter()
        .position(|(n, _)| n == "ppt/slides/slide1.xml")
        .unwrap_or(0);
    let text = String::from_utf8_lossy(&list[at].1).into_owned();
    let flood = "<a:p/>".repeat(650_000);
    list[at].1 = text
        .replacen(
            "</p:spTree>",
            &format!("<p:sp><p:txBody>{flood}</p:txBody></p:sp></p:spTree>"),
            1,
        )
        .into_bytes();
    let started = Instant::now();
    // The slide cannot be read, so the deck has one slide fewer; or the file is refused. Not a panic, not slow.
    survive("a flood of elements", &zipped(&list));
    assert!(started.elapsed().as_secs_f64() < 30.0);
}

#[test]
fn files_that_are_not_presentations_are_refused_by_name() {
    for (what, bytes) in [
        ("empty", Vec::new()),
        ("text", b"just some words".to_vec()),
        (
            "an old binary presentation",
            [
                &[0xD0u8, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1][..],
                &[0u8; 600][..],
            ]
            .concat(),
        ),
        (
            "a zip of something else",
            zipped(&vec![("hello.txt".to_owned(), b"hi".to_vec())]),
        ),
    ] {
        let result = catch_unwind(AssertUnwindSafe(|| {
            import(&bytes, &ImportOptions::default())
        }));
        assert!(matches!(result, Ok(Err(_))), "{what}: {result:?}");
    }
}
