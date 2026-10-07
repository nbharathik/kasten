//! The parts that `raw` elements keep, written back into an export.
//!
//! An element made by an import carries the XML of the object it stands for and the parts that XML
//! points at (see `rawpart`). Writing it back means a relationship number on the slide for each
//! thing it points at, part names that do not clash with the export's own, and each kept part with
//! the relationships it had among the others.

use std::collections::{HashMap, HashSet};

use crate::allow;
use crate::package::Package;
use crate::rawpart::{Kept as Record, Target};
use crate::rels::Rels;

/// Directories and files the export writes itself; a kept part is never put on top of one.
const OWN: &[&str] = &[
    "ppt/media/",
    "ppt/slides/",
    "ppt/slideLayouts/",
    "ppt/slideMasters/",
    "ppt/theme/",
    "ppt/notesSlides/",
    "ppt/notesMasters/",
    "docProps/",
    "_rels/",
    "[Content_Types].xml",
    "ppt/presentation.xml",
    "ppt/presProps.xml",
    "ppt/viewProps.xml",
    "ppt/tableStyles.xml",
];

/// Where a kept part goes when its own name is taken.
const SPARE: &str = "ppt/kept/";

struct Out {
    name: String,
    content_type: String,
    bytes: Vec<u8>,
    rels: Rels,
}

/// The kept parts of a whole export.
#[derive(Default)]
pub struct Kept {
    parts: Vec<Out>,
    names: HashSet<String>,
}

/// A name without the parts that could leave the package or hide in it.
fn tidy(name: &str) -> String {
    let parts: Vec<&str> = name
        .split('/')
        .map(str::trim)
        .filter(|p| !p.is_empty() && *p != "." && *p != ".." && !p.chars().any(char::is_control))
        .collect();
    if parts.is_empty() {
        format!("{SPARE}part")
    } else {
        parts.join("/")
    }
}

/// `name` with `-n` before its extension.
fn numbered(name: &str, n: usize) -> String {
    let (dir, file) = name.rsplit_once('/').map_or(("", name), |(d, f)| (d, f));
    let (stem, ext) = file.rsplit_once('.').map_or((file, ""), |(s, e)| (s, e));
    let dot = if ext.is_empty() { "" } else { "." };
    let slash = if dir.is_empty() { "" } else { "/" };
    format!("{dir}{slash}{stem}-{n}{dot}{ext}")
}

/// The path from the directory of the part `from` to the part `to`, as a relationship writes it.
pub fn relative(from: &str, to: &str) -> String {
    let from_dir: Vec<&str> = from.split('/').collect();
    let from_dir = &from_dir[..from_dir.len().saturating_sub(1)];
    let to_parts: Vec<&str> = to.split('/').collect();
    let common = from_dir
        .iter()
        .zip(&to_parts[..to_parts.len().saturating_sub(1)])
        .take_while(|(a, b)| a == b)
        .count();
    let mut out = "../".repeat(from_dir.len() - common);
    out.push_str(&to_parts[common..].join("/"));
    out
}

/// A data part of a SmartArt diagram names its drawing by the id the slide has for it. Written
/// under the ids the slide has now.
fn renumbered(data: &[u8], ids: &HashMap<String, String>) -> Vec<u8> {
    const MARK: &str = "dataModelExt";
    let Ok(text) = std::str::from_utf8(data) else {
        return data.to_vec();
    };
    if ids.is_empty() || !text.contains(MARK) {
        return data.to_vec();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find(MARK) {
        let (before, after) = rest.split_at(at);
        out.push_str(before);
        let end = after.find('>').map_or(after.len(), |e| e + 1);
        let (tag, tail) = after.split_at(end);
        let mut done = tag.to_owned();
        for quote in ['"', '\''] {
            let key = format!("relId={quote}");
            if let Some(from) = done.find(&key) {
                let start = from + key.len();
                if let Some(len) = done[start..].find(quote) {
                    let old = done[start..start + len].to_owned();
                    if let Some(new) = ids.get(&old) {
                        done.replace_range(start..start + len, new);
                    }
                }
                break;
            }
        }
        out.push_str(&done);
        rest = tail;
    }
    out.push_str(rest);
    out.into_bytes()
}

impl Kept {
    fn name_for(&mut self, original: &str) -> String {
        let clean = tidy(original);
        let mut name = if OWN.iter().any(|own| clean.starts_with(own)) {
            let file = clean.rsplit('/').next().unwrap_or("part");
            format!("{SPARE}{file}")
        } else {
            clean
        };
        let base = name.clone();
        let mut n = 1;
        while self.names.contains(&name) {
            n += 1;
            name = numbered(&base, n);
        }
        self.names.insert(name.clone());
        name
    }

    /// The names the parts of a record get in the export, part for part. A part that may not be
    /// written (see `allow::judge`, whose verdicts these are) gets None.
    pub fn reserve(&mut self, record: &Record, verdicts: &[Option<String>]) -> Vec<Option<String>> {
        record
            .parts
            .iter()
            .zip(verdicts)
            .map(|(p, refused)| refused.is_none().then(|| self.name_for(&p.name)))
            .collect()
    }

    /// Writes the parts of one record. `slide_ids` maps the relationship ids the object's XML used
    /// to the ones the slide has now.
    pub fn commit(
        &mut self,
        record: &Record,
        names: &[Option<String>],
        slide_ids: &HashMap<String, String>,
    ) {
        for (at, part) in record.parts.iter().enumerate() {
            let Some(Some(name)) = names.get(at) else {
                continue;
            };
            let mut rels = Rels::new();
            for link in &part.links {
                match &link.to {
                    Target::Part(to) => {
                        if let Some(Some(target)) = names.get(*to) {
                            rels.add_kept(
                                Some(&link.id),
                                &link.kind,
                                &relative(name, target),
                                false,
                            );
                        }
                    }
                    Target::External(address) => {
                        if allow::refuse_address(&link.kind, address).is_none() {
                            rels.add_kept(Some(&link.id), &link.kind, address.trim(), true);
                        }
                    }
                }
            }
            self.parts.push(Out {
                name: name.clone(),
                content_type: part.content_type.clone(),
                bytes: renumbered(&part.data, slide_ids),
                rels,
            });
        }
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.parts.is_empty()
    }

    /// Adds the parts to the package.
    pub fn add_to(self, package: &mut Package) {
        for part in self.parts {
            package.add_kept(&part.name, &part.content_type, part.bytes);
            package.add_rels(&part.name, &part.rels);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rawpart::{Link, Part};

    #[test]
    fn a_relationship_path_goes_from_the_directory_of_the_part() {
        assert_eq!(
            relative("ppt/slides/slide1.xml", "ppt/charts/chart1.xml"),
            "../charts/chart1.xml"
        );
        assert_eq!(
            relative("ppt/charts/chart1.xml", "ppt/embeddings/book.xlsx"),
            "../embeddings/book.xlsx"
        );
        assert_eq!(
            relative("ppt/slides/slide1.xml", "ppt/slides/slide2.xml"),
            "slide2.xml"
        );
        assert_eq!(relative("ppt/a.xml", "ppt/b/c.xml"), "b/c.xml");
    }

    #[test]
    fn a_name_cannot_leave_the_package_or_land_on_the_exports_own_parts() {
        let mut kept = Kept::default();
        assert_eq!(
            kept.name_for("ppt/charts/chart1.xml"),
            "ppt/charts/chart1.xml"
        );
        assert_eq!(
            kept.name_for("ppt/charts/chart1.xml"),
            "ppt/charts/chart1-2.xml"
        );
        assert_eq!(kept.name_for("../../etc/passwd"), "etc/passwd");
        assert_eq!(kept.name_for("ppt/media/image1.png"), "ppt/kept/image1.png");
        assert_eq!(
            kept.name_for("ppt/slides/slide1.xml"),
            "ppt/kept/slide1.xml"
        );
        assert_eq!(kept.name_for("///"), "ppt/kept/part");
    }

    #[test]
    fn a_diagrams_data_names_its_drawing_by_the_slides_new_id() {
        let data = br#"<dgm:dataModel><dgm:extLst><a:ext><dsp:dataModelExt xmlns:dsp="x" relId="rId2" minVer="y"/></a:ext></dgm:extLst><a:t relId="rId2"/></dgm:dataModel>"#;
        let ids = HashMap::from([("rId2".to_owned(), "rId9".to_owned())]);
        let out = String::from_utf8(renumbered(data, &ids)).unwrap_or_default();
        assert!(
            out.contains(r#"dataModelExt xmlns:dsp="x" relId="rId9" minVer="y""#),
            "{out}"
        );
        // Only the one tag is touched.
        assert!(out.contains(r#"<a:t relId="rId2"/>"#), "{out}");
        assert_eq!(renumbered(b"<x/>", &ids), b"<x/>");
    }

    #[test]
    fn parts_are_written_with_the_relationships_they_had_and_without_what_is_refused() {
        let rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
        let record = Record {
            links: vec![Link {
                id: "rId1".to_owned(),
                kind: format!("{rel}chart"),
                to: Target::Part(0),
            }],
            parts: vec![
                Part {
                    name: "ppt/charts/chart1.xml".to_owned(),
                    content_type:
                        "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"
                            .to_owned(),
                    data: b"<c/>".to_vec(),
                    links: vec![
                        Link {
                            id: "rId1".to_owned(),
                            kind: format!("{rel}package"),
                            to: Target::Part(1),
                        },
                        Link {
                            id: "rId2".to_owned(),
                            kind: format!("{rel}hyperlink"),
                            to: Target::External("file:///secret".to_owned()),
                        },
                        Link {
                            id: "rId3".to_owned(),
                            kind: format!("{rel}oleObject"),
                            to: Target::Part(2),
                        },
                        Link {
                            id: "rId4".to_owned(),
                            kind: format!("{rel}hyperlink"),
                            to: Target::External("https://example.com/data".to_owned()),
                        },
                    ],
                },
                Part {
                    name: "ppt/embeddings/book.xlsx".to_owned(),
                    content_type:
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            .to_owned(),
                    data: vec![1, 2, 3],
                    links: Vec::new(),
                },
                Part {
                    name: "ppt/embeddings/oleObject1.bin".to_owned(),
                    content_type: "application/vnd.openxmlformats-officedocument.oleObject"
                        .to_owned(),
                    data: vec![9, 9, 9],
                    links: Vec::new(),
                },
            ],
        };
        let mut kept = Kept::default();
        let verdicts = allow::judge(&record);
        let names = kept.reserve(&record, &verdicts);
        assert_eq!(
            names[2], None,
            "the embedded object gets no place in the file"
        );
        kept.commit(&record, &names, &HashMap::new());
        assert_eq!(kept.parts.len(), 2);
        let rels = String::from_utf8(kept.parts[0].rels.to_xml()).unwrap_or_default();
        assert!(
            rels.contains(r#"Id="rId1""#) && rels.contains(r#"Target="../embeddings/book.xlsx""#),
            "{rels}"
        );
        assert!(
            rels.contains(r#"Target="https://example.com/data""#),
            "{rels}"
        );
        assert!(
            !rels.contains("secret") && !rels.contains("oleObject1"),
            "{rels}"
        );
    }
}
