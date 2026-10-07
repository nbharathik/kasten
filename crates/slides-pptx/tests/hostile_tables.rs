//! A table in a file can claim any size and any span. The import keeps a table only within what a
//! table here may be (see `slides_core::MOST_TABLE_COLUMNS`), keeps the rest as it was, and cuts back
//! a span that reaches past the table; and whatever it makes goes out again in milliseconds.

use std::io::{Cursor, Read, Write};
use std::time::Instant;

use serde_json::json;
use slides_core::{Element, Engine, MOST_TABLE_COLUMNS};
use slides_pptx::import::{ImportOptions, Imported, import};
use slides_pptx::{Media, Options, export};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

type Entries = Vec<(String, Vec<u8>)>;

/// A deck without pictures.
struct NoPictures;

impl Media for NoPictures {
    fn read(&self, _: &str) -> Option<Vec<u8>> {
        None
    }
}

fn entries(bytes: &[u8]) -> Entries {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap_or_else(|e| panic!("{e}"));
    (0..archive.len())
        .map(|i| {
            let mut file = archive.by_index(i).unwrap_or_else(|e| panic!("{e}"));
            let mut body = Vec::new();
            file.read_to_end(&mut body)
                .unwrap_or_else(|e| panic!("{e}"));
            (file.name().to_owned(), body)
        })
        .collect()
}

fn zipped(list: &Entries) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, body) in list {
        zip.start_file(name, options)
            .unwrap_or_else(|e| panic!("{e}"));
        zip.write_all(body).unwrap_or_else(|e| panic!("{e}"));
    }
    zip.finish().unwrap_or_else(|e| panic!("{e}")).into_inner()
}

/// A file this crate exports, with a table of two columns and two rows on its second slide.
fn with_a_table() -> Entries {
    let mut engine = Engine::create("Tables", "Light", 3).unwrap_or_else(|e| panic!("{e}"));
    let slide = engine
        .apply(
            "add_slide",
            json!({ "layout": "title-only", "content": { "title": "T" } }),
        )
        .unwrap_or_else(|e| panic!("{e}"))
        .output["slide"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let cell = |t: &str| json!({ "text": { "paragraphs": [{ "runs": [{ "t": t }] }] } });
    engine
        .apply(
            "add_elements",
            json!({ "slide": slide, "elements": [{
                "type": "table", "x": 40, "y": 100, "w": 400, "h": 100, "columns": [200, 200],
                "rows": [{ "cells": [cell("a"), cell("b")] }, { "cells": [cell("c"), cell("d")] }]
            }] }),
        )
        .unwrap_or_else(|e| panic!("{e}"));
    let bytes = export(engine.deck(), &NoPictures, &Options::default())
        .unwrap_or_else(|e| panic!("{e}"))
        .bytes;
    entries(&bytes)
}

/// The slide part that holds the table.
fn table_slide(list: &Entries) -> usize {
    list.iter()
        .position(|(name, body)| {
            name.starts_with("ppt/slides/slide")
                && String::from_utf8_lossy(body).contains("<a:tbl>")
        })
        .unwrap_or_else(|| panic!("a slide with a table"))
}

fn changed(edit: impl Fn(&str) -> String) -> Imported {
    let mut list = with_a_table();
    let at = table_slide(&list);
    let text = String::from_utf8_lossy(&list[at].1).into_owned();
    list[at].1 = edit(&text).into_bytes();
    import(&zipped(&list), &ImportOptions::default()).unwrap_or_else(|e| panic!("{e}"))
}

fn tables_and_raws(imported: &Imported) -> (usize, usize) {
    let mut found = (0, 0);
    for slide in &imported.deck.slides {
        for element in &slide.elements {
            match element {
                Element::Table(_) => found.0 += 1,
                Element::Raw(_) => found.1 += 1,
                _ => {}
            }
        }
    }
    found
}

fn warned(imported: &Imported, words: &str) -> bool {
    imported
        .report
        .warnings
        .iter()
        .any(|w| w.message.contains(words))
}

#[test]
fn the_table_of_our_own_export_comes_back_a_table_without_a_word() {
    let imported = changed(str::to_owned);
    assert_eq!(tables_and_raws(&imported), (1, 0));
    assert!(
        imported
            .report
            .warnings
            .iter()
            .all(|w| !w.message.contains("table")),
        "{:?}",
        imported.report.warnings
    );
}

#[test]
fn a_span_that_reaches_past_the_table_is_cut_back_to_it() {
    let started = Instant::now();
    let imported =
        changed(|xml| xml.replacen("<a:tc>", r#"<a:tc gridSpan="4294967295" rowSpan="9">"#, 1));
    let table = imported
        .deck
        .slides
        .iter()
        .flat_map(|s| &s.elements)
        .find_map(|e| match e {
            Element::Table(t) => Some(t),
            _ => None,
        })
        .unwrap_or_else(|| panic!("the table is a table"));
    assert_eq!(table.problem(), None);
    let first = &table.rows[0].cells[0];
    assert_eq!((first.col_span, first.row_span), (Some(2), Some(2)));
    assert!(
        warned(&imported, "reached past its last column or row"),
        "{:?}",
        imported.report.warnings
    );
    // And it goes out again in no time, as the table it is.
    let out =
        export(&imported.deck, &NoPictures, &Options::default()).unwrap_or_else(|e| panic!("{e}"));
    assert!(
        out.warnings
            .iter()
            .all(|w| !w.message.contains("bigger than an export writes"))
    );
    assert!(started.elapsed().as_secs() < 10, "{:?}", started.elapsed());
}

#[test]
fn a_table_bigger_than_a_table_may_be_is_kept_as_it_was() {
    let grid = |columns: usize| {
        let cols = "<a:gridCol w=\"100\"/>".repeat(columns);
        move |xml: &str| {
            let start = xml.find("<a:tblGrid>").unwrap_or_default();
            let end = xml.find("</a:tblGrid>").unwrap_or_default() + "</a:tblGrid>".len();
            format!(
                "{}<a:tblGrid>{cols}</a:tblGrid>{}",
                &xml[..start],
                &xml[end..]
            )
        }
    };
    let rows = |count: usize| {
        move |xml: &str| {
            let start = xml.find("<a:tr ").unwrap_or_default();
            let end = xml.rfind("</a:tr>").unwrap_or_default() + "</a:tr>".len();
            let row = r#"<a:tr h="100"><a:tc><a:txBody><a:bodyPr/><a:p/></a:txBody><a:tcPr/></a:tc></a:tr>"#;
            format!("{}{}{}", &xml[..start], row.repeat(count), &xml[end..])
        }
    };
    let started = Instant::now();
    for (what, imported) in [
        ("too many columns", changed(grid(MOST_TABLE_COLUMNS + 1))),
        ("too many rows", changed(rows(10_001))),
        ("too many places", changed(|xml| rows(120)(&grid(500)(xml)))),
    ] {
        assert_eq!(tables_and_raws(&imported), (0, 1), "{what}: kept as it was");
        assert!(
            warned(&imported, "bigger than a table here may be"),
            "{what}: {:?}",
            imported.report.warnings
        );
        // Kept as it was: the slide still goes out, and says nothing of a table.
        export(&imported.deck, &NoPictures, &Options::default())
            .unwrap_or_else(|e| panic!("{what}: {e}"));
    }
    assert!(started.elapsed().as_secs() < 30, "{:?}", started.elapsed());
}
