//! `ppt/presentation.xml`: the size of the slides, their order, the masters
//! and the sections, and the text style everything starts from.

use std::collections::HashMap;

use super::ImportError;
use super::dom::Node;
use super::package::{Package, ReadError};
use super::units::length;

/// A slide as the presentation lists it.
#[derive(Clone, Debug)]
pub struct SlideRef {
    /// Its number in `p:sldId`, which sections name it by.
    pub number: i64,
    pub part: String,
}

/// What the presentation says.
pub struct Presentation {
    pub size: Option<(f64, f64)>,
    pub slides: Vec<SlideRef>,
    pub masters: Vec<String>,
    /// Sections: a name, and the numbers of the slides in it.
    pub sections: Vec<(String, Vec<i64>)>,
    pub default_text: Option<Node>,
}

const SECTION_LIST: &str = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";

/// The part the package calls its main document.
pub fn main_part(pkg: &mut Package) -> String {
    pkg.rels_of("")
        .of_kind("officeDocument")
        .find_map(|rel| pkg.target("", rel))
        .filter(|name| pkg.has(name))
        .unwrap_or_else(|| "ppt/presentation.xml".to_owned())
}

pub fn read(pkg: &mut Package) -> Result<Presentation, ImportError> {
    let part = main_part(pkg);
    let doc = pkg.dom(&part).map_err(|e| match e {
        ReadError::TooLarge(m) => ImportError::TooLarge(m),
        other => ImportError::Damaged(other.message()),
    })?;
    let rels = pkg.rels_of(&part);
    let target = |pkg: &Package, id: &str| rels.get(id).and_then(|rel| pkg.target(&part, rel));
    let root = &doc.root;
    let size = root.child("p:sldSz").and_then(|s| {
        let (w, h) = (length(s.int("cx")?), length(s.int("cy")?));
        (w > 0.0 && h > 0.0).then_some((w, h))
    });
    let slides = root
        .child("p:sldIdLst")
        .map(|list| {
            list.children_named("p:sldId")
                .filter_map(|id| {
                    Some(SlideRef {
                        number: id.int("id")?,
                        part: target(pkg, id.attr("r:id")?)?,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let masters = root
        .child("p:sldMasterIdLst")
        .map(|list| {
            list.children_named("p:sldMasterId")
                .filter_map(|id| target(pkg, id.attr("r:id")?))
                .collect()
        })
        .unwrap_or_default();
    let mut sections = Vec::new();
    for ext in root
        .at(&["p:extLst"])
        .into_iter()
        .flat_map(|l| l.children_named("p:ext"))
    {
        if ext.attr("uri") != Some(SECTION_LIST) {
            continue;
        }
        for list in ext.children_named("p14:sectionLst") {
            for section in list.children_named("p14:section") {
                let numbers = section
                    .child("p14:sldIdLst")
                    .map(|l| {
                        l.children_named("p14:sldId")
                            .filter_map(|i| i.int("id"))
                            .collect()
                    })
                    .unwrap_or_default();
                sections.push((section.attr("name").unwrap_or("").to_owned(), numbers));
            }
        }
    }
    Ok(Presentation {
        default_text: root.child("p:defaultTextStyle").cloned(),
        size,
        slides,
        masters,
        sections,
    })
}

/// Which slide part each `p:sldId` number is.
pub fn numbers(slides: &[SlideRef]) -> HashMap<i64, usize> {
    slides
        .iter()
        .enumerate()
        .map(|(i, s)| (s.number, i))
        .collect()
}

#[cfg(test)]
mod tests;
