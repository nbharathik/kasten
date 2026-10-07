//! `ppt/presentation.xml`: the slide size, the slides in order, the master and
//! notes master, and the sections.

use slides_core::Deck;

use crate::Page;
use crate::cx::guid;
use crate::layouts::open_root;
use crate::units::{SLIDE_MASTER_ID, length};
use crate::xml::Xml;

/// The first number a slide is given; PowerPoint's own.
const FIRST_SLIDE_ID: i64 = 256;

const NS_P14: &str = "http://schemas.microsoft.com/office/powerpoint/2010/main";
const SECTIONS: &str = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";

/// A run of consecutive pages under one heading.
#[derive(Debug, PartialEq)]
pub struct Section {
    pub name: String,
    pub pages: Vec<usize>,
}

/// The sections of the file: the deck's, each running from the slide it starts
/// at to the next section, so backup slides stay in the section of the slide they
/// follow. Slides before the first section go in a section of their own, and a
/// section none of whose slides are in the file is left out.
pub fn sections(deck: &Deck, pages: &[Page]) -> Vec<Section> {
    if deck.sections.is_empty() {
        return Vec::new();
    }
    let mut starts: Vec<(usize, &str)> = deck
        .sections
        .iter()
        .filter_map(|s| deck.index_of(&s.starts_at).map(|i| (i, s.title.as_str())))
        .collect();
    starts.sort_by_key(|(i, _)| *i);
    let key_of = |slide: usize| starts.iter().rposition(|(i, _)| *i <= slide);
    let mut out: Vec<(Option<usize>, Section)> = Vec::new();
    for (at, page) in pages.iter().enumerate() {
        let key = key_of(page.slide);
        match out.last_mut() {
            Some((last, section)) if *last == key => section.pages.push(at),
            _ => out.push((
                key,
                Section {
                    name: key.map_or("Default Section", |k| starts[k].1).to_owned(),
                    pages: vec![at],
                },
            )),
        }
    }
    out.into_iter().map(|(_, section)| section).collect()
}

/// What the presentation part refers to.
pub struct Refs {
    pub master: String,
    pub notes_master: Option<String>,
    /// One per page, in order.
    pub slides: Vec<String>,
}

fn write_text_defaults(x: &mut Xml) {
    x.open("p:defaultTextStyle");
    x.open("a:defPPr");
    x.open("a:defRPr").attr("lang", "en-US").close();
    x.close();
    for level in 1..=9 {
        x.open(&format!("a:lvl{level}pPr"))
            .int("marL", 457_200 * (level - 1))
            .attr("algn", "l")
            .int("defTabSz", 914_400)
            .attr("rtl", "0")
            .attr("eaLnBrk", "1")
            .attr("latinLnBrk", "0")
            .attr("hangingPunct", "1");
        x.open("a:defRPr").int("sz", 1800).int("kern", 1200);
        crate::color::Color::Scheme("tx1").solid_fill(x, None);
        x.leaf("a:latin", &[("typeface", "+mn-lt")]);
        x.leaf("a:ea", &[("typeface", "+mn-ea")]);
        x.leaf("a:cs", &[("typeface", "+mn-cs")]);
        x.close();
        x.close();
    }
    x.close();
}

/// The presentation part.
pub fn write(deck: &Deck, pages: &[Page], refs: &Refs) -> Vec<u8> {
    let mut x = Xml::document();
    open_root(&mut x, "p:presentation");
    x.attr("saveSubsetFonts", "1");
    x.open("p:sldMasterIdLst");
    x.open("p:sldMasterId")
        .int("id", SLIDE_MASTER_ID)
        .attr("r:id", &refs.master)
        .close();
    x.close();
    if let Some(notes) = &refs.notes_master {
        x.open("p:notesMasterIdLst");
        x.open("p:notesMasterId").attr("r:id", notes).close();
        x.close();
    }
    x.open("p:sldIdLst");
    for (n, id) in refs.slides.iter().enumerate() {
        x.open("p:sldId")
            .int("id", FIRST_SLIDE_ID + n as i64)
            .attr("r:id", id)
            .close();
    }
    x.close();
    x.open("p:sldSz")
        .int("cx", length(deck.size.w))
        .int("cy", length(deck.size.h))
        .close();
    x.open("p:notesSz")
        .int("cx", 6_858_000)
        .int("cy", 9_144_000)
        .close();
    write_text_defaults(&mut x);
    let sections = sections(deck, pages);
    if !sections.is_empty() {
        x.open("p:extLst");
        x.open("p:ext").attr("uri", SECTIONS);
        x.open("p14:sectionLst").attr("xmlns:p14", NS_P14);
        for (n, section) in sections.iter().enumerate() {
            x.open("p14:section")
                .attr("name", &section.name)
                .attr("id", &guid(0x5345_4354, n as u32 + 1));
            x.open("p14:sldIdLst");
            for page in &section.pages {
                x.open("p14:sldId")
                    .int("id", FIRST_SLIDE_ID + *page as i64)
                    .close();
            }
            x.close();
            x.close();
        }
        x.close();
        x.close();
        x.close();
    }
    x.close();
    x.finish()
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use slides_core::{Engine, Section as DeckSection};

    use super::*;
    use crate::{Options, pages};

    fn deck(sections: &[(&str, usize)]) -> slides_core::Deck {
        let mut e = Engine::create("t", "Light", 2).unwrap_or_else(|x| panic!("{x}"));
        for _ in 0..5 {
            e.apply("add_slide", json!({ "layout": "blank" }))
                .unwrap_or_else(|x| panic!("{x}"));
        }
        let mut deck = e.into_deck();
        deck.sections = sections
            .iter()
            .map(|(title, at)| DeckSection {
                title: (*title).to_owned(),
                starts_at: deck.slides[*at].id.clone(),
                extra: slides_core::Extra::new(),
            })
            .collect();
        deck
    }

    fn named(deck: &slides_core::Deck) -> Vec<(String, Vec<usize>)> {
        let all = pages(deck, &Options::default());
        sections(deck, &all)
            .into_iter()
            .map(|s| (s.name, s.pages))
            .collect()
    }

    #[test]
    fn sections_run_from_their_slide_to_the_next_section() {
        let d = deck(&[("Intro", 0), ("Part two", 3)]);
        assert_eq!(
            named(&d),
            [
                ("Intro".to_owned(), vec![0, 1, 2]),
                ("Part two".to_owned(), vec![3, 4, 5])
            ]
        );
    }

    #[test]
    fn slides_before_the_first_section_have_a_default_one_and_no_sections_is_no_list() {
        let d = deck(&[("Later", 2)]);
        assert_eq!(
            named(&d),
            [
                ("Default Section".to_owned(), vec![0, 1]),
                ("Later".to_owned(), vec![2, 3, 4, 5])
            ]
        );
        assert!(named(&deck(&[])).is_empty());
    }

    #[test]
    fn a_section_whose_slides_are_all_left_out_is_left_out() {
        let mut d = deck(&[("A", 0), ("B", 2), ("C", 4)]);
        for i in [2, 3] {
            d.slides[i].hidden = true;
        }
        let all = pages(
            &d,
            &Options {
                include_hidden: false,
                ..Options::default()
            },
        );
        let names: Vec<_> = sections(&d, &all)
            .into_iter()
            .map(|s| (s.name, s.pages))
            .collect();
        assert_eq!(
            names,
            [("A".to_owned(), vec![0, 1]), ("C".to_owned(), vec![2, 3])]
        );
    }

    #[test]
    fn the_part_lists_master_slides_size_and_sections_in_schema_order() {
        let d = deck(&[("Intro", 0)]);
        let all = pages(&d, &Options::default());
        let refs = Refs {
            master: "rId1".into(),
            notes_master: Some("rId2".into()),
            slides: (3..3 + all.len()).map(|n| format!("rId{n}")).collect(),
        };
        let out = String::from_utf8(write(&d, &all, &refs)).unwrap_or_default();
        let at = |needle: &str| out.find(needle).unwrap_or(usize::MAX);
        assert!(at("<p:sldMasterIdLst>") < at("<p:notesMasterIdLst>"));
        assert!(at("<p:notesMasterIdLst>") < at("<p:sldIdLst>"));
        assert!(at("<p:sldIdLst>") < at("<p:sldSz"));
        assert!(at("<p:sldSz") < at("<p:notesSz"));
        assert!(at("<p:notesSz") < at("<p:defaultTextStyle>"));
        assert!(at("<p:defaultTextStyle>") < at("<p:extLst>"));
        assert!(
            out.contains(r#"<p:sldMasterId id="2147483648" r:id="rId1"/>"#),
            "{out}"
        );
        assert!(
            out.contains(r#"<p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId4"/>"#),
            "{out}"
        );
        assert!(
            out.contains(r#"<p:sldSz cx="9144000" cy="5143500"/>"#),
            "{out}"
        );
        assert!(out.contains(r#"<p14:section name="Intro" id="{53454354-0000-4000-8000-000000000001}"><p14:sldIdLst><p14:sldId id="256"/>"#), "{out}");
    }

    #[test]
    fn without_sections_or_notes_those_parts_are_left_out() {
        let d = deck(&[]);
        let all = pages(&d, &Options::default());
        let refs = Refs {
            master: "rId1".into(),
            notes_master: None,
            slides: vec!["rId2".into(); all.len()],
        };
        let out = String::from_utf8(write(&d, &all, &refs)).unwrap_or_default();
        assert!(
            !out.contains("notesMasterIdLst")
                && !out.contains("extLst")
                && !out.contains("sectionLst"),
            "{out}"
        );
    }
}
