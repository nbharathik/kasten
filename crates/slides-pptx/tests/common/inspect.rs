//! Reading a finished package the way a strict consumer does: every part is
//! parsed as XML, every relationship followed, every content type looked up.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{Cursor, Read};

use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use zip::ZipArchive;

/// The parts of a package by name.
pub struct Package {
    pub parts: BTreeMap<String, Vec<u8>>,
    /// The order the entries are in the zip.
    pub order: Vec<String>,
}

pub fn open(bytes: &[u8]) -> Package {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).unwrap_or_else(|e| panic!("not a zip: {e}"));
    let mut parts = BTreeMap::new();
    let mut order = Vec::new();
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .unwrap_or_else(|e| panic!("entry {i}: {e}"));
        let mut body = Vec::new();
        file.read_to_end(&mut body)
            .unwrap_or_else(|e| panic!("{}: {e}", file.name()));
        order.push(file.name().to_owned());
        assert!(
            parts.insert(file.name().to_owned(), body).is_none(),
            "{} appears twice",
            file.name()
        );
    }
    Package { parts, order }
}

pub fn attrs(e: &BytesStart) -> BTreeMap<String, String> {
    e.attributes()
        .filter_map(Result::ok)
        .map(|a| {
            let value = a
                .normalized_value(XmlVersion::Implicit1_0)
                .map(|v| v.into_owned());
            (a.key.into_inner().to_owned(), value.unwrap_or_default())
        })
        .collect()
}

/// Every start and empty element of an XML part, in order, as its name and attributes.
/// Panics if the part is not well-formed, with the part's name.
pub fn elements(name: &str, bytes: &[u8]) -> Vec<(String, BTreeMap<String, String>)> {
    let mut reader = Reader::from_reader(bytes);
    let mut buf = Vec::new();
    let mut out = Vec::new();
    let mut depth = 0_i32;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                depth += 1;
                out.push((e.name().into_inner().to_owned(), attrs(&e)));
            }
            Ok(Event::Empty(e)) => out.push((e.name().into_inner().to_owned(), attrs(&e))),
            Ok(Event::End(_)) => depth -= 1,
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(e) => panic!("{name} is not well-formed XML: {e}"),
        }
        buf.clear();
    }
    assert_eq!(depth, 0, "{name} has unbalanced elements");
    assert!(!out.is_empty(), "{name} is empty");
    out
}

pub fn is_xml(name: &str) -> bool {
    name.ends_with(".xml") || name.ends_with(".rels")
}

/// The part a relationship of `owner` points at, as a name in the package.
pub fn resolve(owner: &str, target: &str) -> String {
    if let Some(absolute) = target.strip_prefix('/') {
        return absolute.to_owned();
    }
    let mut path: Vec<&str> = owner
        .rsplit_once('/')
        .map_or(Vec::new(), |(dir, _)| dir.split('/').collect());
    for part in target.split('/') {
        match part {
            ".." => {
                path.pop();
            }
            "." | "" => {}
            other => path.push(other),
        }
    }
    path.join("/")
}

/// The part a `.rels` part belongs to (`""` for the package's).
pub fn owner_of(rels: &str) -> String {
    let (dir, file) = rels.rsplit_once('/').unwrap_or(("", rels));
    let dir = dir
        .strip_suffix("_rels")
        .unwrap_or(dir)
        .trim_end_matches('/');
    let file = file.strip_suffix(".rels").unwrap_or(file);
    if file.is_empty() {
        String::new()
    } else if dir.is_empty() {
        file.to_owned()
    } else {
        format!("{dir}/{file}")
    }
}

/// A relationship: its id, type, target, and whether the target is outside the file.
pub struct Rel {
    pub id: String,
    pub kind: String,
    pub target: String,
    pub external: bool,
}

pub fn relationships(package: &Package, rels: &str) -> Vec<Rel> {
    elements(rels, &package.parts[rels])
        .into_iter()
        .filter(|(name, _)| name == "Relationship")
        .map(|(_, a)| Rel {
            id: a["Id"].clone(),
            kind: a["Type"].clone(),
            target: a["Target"].clone(),
            external: a.get("TargetMode").is_some_and(|m| m == "External"),
        })
        .collect()
}

/// The numbers the schemas bound, as (element, attribute, least, most). A value outside them
/// is a file PowerPoint may refuse or repair, whatever the deck it came from held.
const LIMITS: &[(&str, &str, i64, i64)] = &[
    ("a:ln", "w", 0, 20_116_800),
    ("a:spcPts", "val", 0, 158_400),
    ("a:rPr", "sz", 100, 400_000),
    ("a:endParaRPr", "sz", 100, 400_000),
    ("a:defRPr", "sz", 100, 400_000),
    ("a:pPr", "marL", 0, 51_206_400),
    ("a:pPr", "indent", -51_206_400, 51_206_400),
    ("a:pPr", "lvl", 0, 8),
    ("a:alpha", "val", 0, 100_000),
    ("a:off", "x", -27_273_042_329_600, 27_273_042_316_900),
    ("a:off", "y", -27_273_042_329_600, 27_273_042_316_900),
    ("a:ext", "cx", 0, 27_273_042_316_900),
    ("a:ext", "cy", 0, 27_273_042_316_900),
    ("a:chOff", "x", -27_273_042_329_600, 27_273_042_316_900),
    ("a:chOff", "y", -27_273_042_329_600, 27_273_042_316_900),
    ("a:chExt", "cx", 0, 27_273_042_316_900),
    ("a:chExt", "cy", 0, 27_273_042_316_900),
    ("a:gridCol", "w", 0, 27_273_042_316_900),
    ("a:tr", "h", 0, 27_273_042_316_900),
    ("a:tc", "gridSpan", 1, 1_000_000),
    ("a:tc", "rowSpan", 1, 1_000_000),
    ("a:outerShdw", "blurRad", 0, 27_273_042_316_900),
    ("a:outerShdw", "dist", 0, 27_273_042_316_900),
    ("a:outerShdw", "dir", 0, 21_599_999),
    ("a:bodyPr", "lIns", i32::MIN as i64, i32::MAX as i64),
    ("a:bodyPr", "tIns", i32::MIN as i64, i32::MAX as i64),
    ("a:bodyPr", "rIns", i32::MIN as i64, i32::MAX as i64),
    ("a:bodyPr", "bIns", i32::MIN as i64, i32::MAX as i64),
    ("a:tcPr", "marL", i32::MIN as i64, i32::MAX as i64),
    ("a:tcPr", "marR", i32::MIN as i64, i32::MAX as i64),
    ("a:tcPr", "marT", i32::MIN as i64, i32::MAX as i64),
    ("a:tcPr", "marB", i32::MIN as i64, i32::MAX as i64),
    ("p:sldSz", "cx", 914_400, 51_206_400),
    ("p:sldSz", "cy", 914_400, 51_206_400),
    ("p:sldId", "id", 256, 2_147_483_647),
    ("p:cNvPr", "id", 1, 4_294_967_295),
    ("a:srcRect", "l", -2_147_483_648, 2_147_483_647),
];

/// Numbers outside the limits the schemas set, in any part.
fn out_of_range(package: &Package) -> Vec<String> {
    let mut out = Vec::new();
    for (name, bytes) in package.parts.iter().filter(|(n, _)| is_xml(n)) {
        for (element, attrs) in elements(name, bytes) {
            for (tag, attribute, least, most) in LIMITS {
                if element != *tag {
                    continue;
                }
                let Some(text) = attrs.get(*attribute) else {
                    continue;
                };
                match text.parse::<i64>() {
                    Ok(value) if (*least..=*most).contains(&value) => {}
                    _ => out.push(format!(
                        "{name}: <{tag} {attribute}=\"{text}\"> is outside {least} to {most}"
                    )),
                }
            }
        }
    }
    out
}

/// Everything a strict reader would complain about. Empty when the package holds together.
pub fn problems(package: &Package) -> Vec<String> {
    let mut out = Vec::new();
    // Every XML part parses, and the content types come first.
    if package.order.first().map(String::as_str) != Some("[Content_Types].xml") {
        out.push("[Content_Types].xml is not the first entry".to_owned());
    }
    let mut defaults = BTreeSet::new();
    let mut overrides = BTreeMap::new();
    for (name, a) in elements("[Content_Types].xml", &package.parts["[Content_Types].xml"]) {
        match name.as_str() {
            "Default" => {
                defaults.insert(a["Extension"].to_ascii_lowercase());
            }
            "Override" => {
                overrides.insert(
                    a["PartName"].trim_start_matches('/').to_owned(),
                    a["ContentType"].clone(),
                );
            }
            _ => {}
        }
    }
    for (name, bytes) in &package.parts {
        if is_xml(name) {
            elements(name, bytes);
        }
        if name == "[Content_Types].xml" {
            continue;
        }
        let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        if !overrides.contains_key(name) && !defaults.contains(&ext) {
            out.push(format!("{name} has no content type"));
        }
    }
    for name in overrides.keys() {
        if !package.parts.contains_key(name) {
            out.push(format!(
                "[Content_Types].xml lists {name}, which is not in the package"
            ));
        }
    }
    // Every relationship has an unused id, a target that exists, and no part is left unreached.
    let mut reached = BTreeSet::new();
    for name in package.parts.keys().filter(|n| n.ends_with(".rels")) {
        let owner = owner_of(name);
        if !owner.is_empty() && !package.parts.contains_key(&owner) {
            out.push(format!(
                "{name} belongs to {owner}, which is not in the package"
            ));
        }
        let mut ids = BTreeSet::new();
        for rel in relationships(package, name) {
            if !ids.insert(rel.id.clone()) {
                out.push(format!("{name}: id {} is used twice", rel.id));
            }
            if rel.external {
                continue;
            }
            let target = resolve(&owner, &rel.target);
            if !package.parts.contains_key(&target) {
                out.push(format!(
                    "{name}: {} points at {target}, which is not in the package",
                    rel.id
                ));
            }
            reached.insert(target);
        }
    }
    for name in package.parts.keys() {
        if !name.ends_with(".rels") && name != "[Content_Types].xml" && !reached.contains(name) {
            out.push(format!("{name} is in the package but nothing points at it"));
        }
    }
    out.extend(out_of_range(package));
    out
}

/// The `r:id` attributes a part uses, which must all be relationships of that part.
pub fn used_ids(package: &Package, part: &str) -> Vec<String> {
    elements(part, &package.parts[part])
        .into_iter()
        .flat_map(|(_, a)| {
            a.into_iter()
                .filter(|(k, _)| k.starts_with("r:"))
                .map(|(_, v)| v)
        })
        .collect()
}

/// The numbers `p:cNvPr` gives the shapes of a slide.
pub fn shape_ids(package: &Package, part: &str) -> Vec<u32> {
    elements(part, &package.parts[part])
        .into_iter()
        .filter(|(name, _)| name == "p:cNvPr")
        .filter_map(|(_, a)| a.get("id").and_then(|v| v.parse().ok()))
        .collect()
}

/// How many elements of this name a part has.
pub fn count(package: &Package, part: &str, element: &str) -> usize {
    elements(part, &package.parts[part])
        .iter()
        .filter(|(name, _)| name == element)
        .count()
}

pub fn slide_names(package: &Package) -> Vec<String> {
    let mut names: Vec<String> = package
        .parts
        .keys()
        .filter(|n| n.starts_with("ppt/slides/slide") && n.ends_with(".xml"))
        .cloned()
        .collect();
    names.sort_by_key(|n| {
        n.trim_start_matches("ppt/slides/slide")
            .trim_end_matches(".xml")
            .parse::<u32>()
            .unwrap_or(0)
    });
    names
}

/// Exports a deck and opens what comes out; any refusal is a bug of the test.
pub fn package_with(
    deck: &slides_core::Deck,
    files: &super::Files,
    options: &slides_pptx::Options,
) -> Package {
    let out =
        slides_pptx::export(deck, files, options).unwrap_or_else(|e| panic!("{}: {e}", deck.title));
    open(&out.bytes)
}

/// The attributes of the root element of a part.
pub fn root_attributes(
    package: &Package,
    part: &str,
) -> std::collections::BTreeMap<String, String> {
    elements(part, &package.parts[part]).remove(0).1
}
