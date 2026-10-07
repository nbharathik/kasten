//! A PowerPoint file comes from anywhere, so the import must not trust it: a file cut short, with
//! parts missing, XML that is broken or absurd, numbers far out of range, names that climb out of
//! the package. None of it may panic, run long or leave a deck that the format refuses. The
//! mutations are deterministic, so a failure can be run again.

mod common;

use std::panic::{AssertUnwindSafe, catch_unwind};

use slides_pptx::Options;
use slides_pptx::export;

use common::Files;
use common::zips::{Change, Dice, bases, entries, survive, zipped};

const ABSURD: [&str; 9] = [
    "0",
    "-1",
    "99999999999999999999",
    "-9223372036854775808",
    "9223372036854775807",
    "4294967296",
    "2147483648",
    "-2147483649",
    "1e999",
];

#[test]
fn a_file_cut_short_or_with_bytes_changed_never_panics() {
    let mut dice = Dice(0x1e57_0001);
    let (mut opened, mut refused) = (0, 0);
    for (name, bytes) in bases() {
        for cut in [
            0,
            1,
            4,
            30,
            bytes.len() / 10,
            bytes.len() / 2,
            bytes.len() * 9 / 10,
            bytes.len() - 22,
            bytes.len() - 1,
        ] {
            survive(
                &format!("{name} cut at {cut}"),
                &bytes[..cut.min(bytes.len())],
            );
        }
        for n in 0..120 {
            let mut changed = bytes.clone();
            for _ in 0..=dice.below(6) {
                let at = dice.below(changed.len());
                changed[at] ^= 1 << dice.below(8);
            }
            match survive(&format!("{name} with bytes changed ({n})"), &changed) {
                Some(_) => opened += 1,
                None => refused += 1,
            }
        }
    }
    println!("changed bytes: {opened} files opened, {refused} refused");
    assert!(opened + refused >= 360);
}

#[test]
fn a_package_missing_any_one_part_still_opens_or_is_refused_kindly() {
    for (name, bytes) in bases() {
        let list = entries(&bytes);
        for (i, (part, _)) in list.iter().enumerate() {
            let mut fewer = list.clone();
            fewer.remove(i);
            let result = survive(&format!("{name} without {part}"), &zipped(&fewer));
            // Losing a slide, a picture or the notes costs that thing; the deck still opens.
            if part.starts_with("ppt/media/")
                || part.starts_with("ppt/notes")
                || part.starts_with("docProps/")
            {
                assert!(result.is_some(), "{name} without {part} opens");
            }
        }
    }
}

#[test]
fn broken_and_absurd_xml_in_any_part_never_panics() {
    let mut dice = Dice(0x1e57_0002);
    let hostile: [(&str, Change); 6] = [
        (
            "cut in the middle",
            Box::new(|x: &str| x[..x.len() / 2].to_owned()),
        ),
        (
            "a tag never closed",
            Box::new(|x: &str| x.replacen("</p:sp>", "", 1)),
        ),
        (
            "a document type with entities",
            Box::new(|x: &str| {
                let (decl, rest) = x.split_once("?>").unwrap_or(("", x));
                format!(
                    "{decl}?><!DOCTYPE x [<!ENTITY a \"aaaaaaaaaa\"><!ENTITY b \"&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;\">]>{rest}"
                )
            }),
        ),
        (
            "nested far too deep",
            Box::new(|x: &str| {
                x.replacen(
                    "<p:spTree>",
                    &format!("<p:spTree>{}", "<p:grpSp>".repeat(300)),
                    1,
                )
            }),
        ),
        (
            "an unknown entity",
            Box::new(|x: &str| x.replacen("<a:t>", "<a:t>&nope;&#0;&#xD800;", 1)),
        ),
        (
            "control characters",
            Box::new(|x: &str| x.replacen("<a:t>", "<a:t>\u{1}\u{8}\u{b}", 1)),
        ),
    ];
    let mut tried = 0;
    for (name, bytes) in bases() {
        let list = entries(&bytes);
        let xml_parts: Vec<usize> = (0..list.len())
            .filter(|i| list[*i].0.ends_with(".xml") || list[*i].0.ends_with(".rels"))
            .collect();
        for (how, change) in &hostile {
            for _ in 0..12 {
                let at = xml_parts[dice.below(xml_parts.len())];
                let mut changed = list.clone();
                let text = String::from_utf8_lossy(&changed[at].1).into_owned();
                changed[at].1 = change(&text).into_bytes();
                survive(
                    &format!("{name}: {how} in {}", changed[at].0),
                    &zipped(&changed),
                );
                tried += 1;
            }
        }
    }
    assert!(tried >= 200);
}

#[test]
fn numbers_far_out_of_range_are_held_and_nothing_overflows() {
    let mut dice = Dice(0x1e57_0003);
    let mut tried = 0;
    for (name, bytes) in bases() {
        let list = entries(&bytes);
        let slides: Vec<usize> = (0..list.len())
            .filter(|i| {
                list[*i].0.starts_with("ppt/slides/slide")
                    || list[*i].0.contains("slideLayout")
                    || list[*i].0.contains("slideMaster")
                    || list[*i].0 == "ppt/presentation.xml"
            })
            .filter(|i| list[*i].0.ends_with(".xml"))
            .collect();
        for _ in 0..60 {
            let at = slides[dice.below(slides.len())];
            let mut text = String::from_utf8_lossy(&list[at].1).into_owned();
            // Every number in an attribute is a place to change; change a few.
            let spots: Vec<(usize, usize)> = text
                .match_indices("=\"")
                .filter_map(|(i, _)| {
                    let rest = &text[i + 2..];
                    let end = rest.find('"')?;
                    let value = &rest[..end];
                    (!value.is_empty()
                        && value
                            .trim_start_matches('-')
                            .chars()
                            .all(|c| c.is_ascii_digit()))
                    .then_some((i + 2, i + 2 + end))
                })
                .collect();
            if spots.is_empty() {
                continue;
            }
            // Change a few, last first, so the places before them stay where they were.
            let mut picked: Vec<(usize, usize)> = (0..=dice.below(3))
                .map(|_| spots[dice.below(spots.len())])
                .collect();
            picked.sort_unstable();
            picked.dedup();
            for (from, to) in picked.into_iter().rev() {
                text.replace_range(from..to, ABSURD[dice.below(ABSURD.len())]);
            }
            let mut changed = list.clone();
            changed[at].1 = text.into_bytes();
            let name = format!("{name}: numbers in {}", changed[at].0);
            if let Some(imported) = survive(&name, &zipped(&changed)) {
                // A deck made from absurd numbers still exports.
                let files = Files(
                    imported
                        .media
                        .iter()
                        .map(|m| (m.path.clone(), m.bytes.clone()))
                        .collect(),
                );
                let out = catch_unwind(AssertUnwindSafe(|| {
                    export(&imported.deck, &files, &Options::default())
                }));
                assert!(
                    out.is_ok(),
                    "{name}: the export of the imported deck panicked"
                );
            }
            tried += 1;
        }
    }
    assert!(tried >= 100);
}

#[test]
fn names_that_climb_out_of_the_package_are_ignored() {
    for (name, bytes) in bases() {
        let mut list = entries(&bytes);
        for evil in [
            "../../evil.xml",
            "/etc/passwd",
            "ppt/../../x.xml",
            "C:\\windows\\x.xml",
            "ppt\\slides\\..\\..\\y.xml",
            "ppt/slides/slide1.xml/../../../z",
        ] {
            list.push((evil.to_owned(), b"<x/>".to_vec()));
        }
        let plain = survive(&format!("{name} plain"), &bytes);
        let with = survive(&format!("{name} with names that climb"), &zipped(&list));
        let (Some(plain), Some(with)) = (plain, with) else {
            panic!("{name}: a package with extra entries opens");
        };
        assert_eq!(plain.deck.slides.len(), with.deck.slides.len());
        assert!(
            with.report
                .warnings
                .iter()
                .any(|w| w.message.contains("names a place outside the file")),
            "{name}: the ignored names are listed: {:?}",
            with.report.warnings
        );
    }
}
