//! Helpers for the tests of the readers: a context with a theme and no file.

use std::collections::HashMap;

use super::color::ColorMap;
use super::cx::{Cx, Env, Importer, PartCx};
use super::package::tests::zip_of;
use super::package::{Limits, Package, Rel, Rels};
use super::styles::StyleBook;
use super::tablestyle::TableStyles;
use super::text::levels::{FontNames, Levels};
use super::themefile::{FormatScheme, ThemeFile};

const TYPES: &[u8] =
    br#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>"#;

pub const NS: &str = r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#;

/// A file with the given parts, opened.
pub fn package(parts: &[(&str, &[u8])]) -> Package<'static> {
    let mut all = vec![("[Content_Types].xml", TYPES)];
    all.extend_from_slice(parts);
    let bytes: &'static [u8] = Box::leak(zip_of(&all).into_boxed_slice());
    Package::open(bytes, Limits::default()).unwrap_or_else(|e| panic!("{e}"))
}

/// An environment with Office's colours and the given format styles.
pub fn env(format: FormatScheme) -> Env {
    let theme = ThemeFile {
        format,
        ..ThemeFile::default()
    };
    Env {
        fonts: FontNames {
            heading: theme.heading.clone(),
            body: theme.body.clone(),
        },
        theme,
        deck_map: ColorMap::standard(),
        styles: StyleBook::new(),
        masters: Vec::new(),
        layouts: Vec::new(),
        layout_names: Vec::new(),
        layout_index: HashMap::new(),
        slide_ids: HashMap::new(),
        slide_parts: Vec::new(),
        default_text: Levels::empty(),
        table_styles: TableStyles::default(),
    }
}

pub fn part() -> PartCx {
    PartCx {
        name: "ppt/slides/slide1.xml".to_owned(),
        rels: Rels::default(),
        declarations: Vec::new(),
        map: ColorMap::standard(),
        slide: Some("s-test".to_owned()),
        layout: None,
        in_master: false,
    }
}

/// Runs `f` with a context over a file with the given parts.
pub fn with_parts<T>(
    parts: &[(&str, &[u8])],
    format: FormatScheme,
    f: impl FnOnce(&mut Cx) -> T,
) -> T {
    let mut importer = Importer::new(package(parts), 7);
    let env = env(format);
    let part = part();
    let mut cx = Cx::new(&mut importer, &env, &part);
    f(&mut cx)
}

/// The XML given, read, and its first element inside a wrapper that declares the namespaces.
pub fn xml(inner: &str) -> super::dom::Node {
    super::dom::parse(format!("<x {NS}>{inner}</x>").as_bytes())
        .unwrap_or_else(|e| panic!("{e}"))
        .root
        .elements()
        .next()
        .cloned()
        .unwrap_or_default()
}

/// Runs `f` with a context whose slide has the given relationships: `(id, kind, target)`.
pub fn with_rels<T>(
    parts: &[(&str, &[u8])],
    rels: &[(&str, &str, &str)],
    f: impl FnOnce(&mut Cx) -> T,
) -> T {
    let mut importer = Importer::new(package(parts), 7);
    let env = env(FormatScheme::default());
    let mut part = part();
    part.rels = Rels {
        items: rels
            .iter()
            .map(|(id, kind, target)| Rel {
                id: (*id).to_owned(),
                kind: (*kind).to_owned(),
                type_uri: format!(
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}"
                ),
                target: (*target).to_owned(),
                external: target.starts_with("http"),
            })
            .collect(),
    };
    let mut cx = Cx::new(&mut importer, &env, &part);
    f(&mut cx)
}
