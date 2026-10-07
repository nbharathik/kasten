use std::io::Write;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use super::*;

pub(crate) fn zip_of(parts: &[(&str, &[u8])]) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, bytes) in parts {
        zip.start_file(
            *name,
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .unwrap_or_else(|e| panic!("{e}"));
        zip.write_all(bytes).unwrap_or_else(|e| panic!("{e}"));
    }
    zip.finish().unwrap_or_else(|e| panic!("{e}")).into_inner()
}

/// Every entry of a zip file, by name.
pub(crate) fn entries_of(bytes: &[u8]) -> Vec<(String, Vec<u8>)> {
    use std::io::Read;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap_or_else(|e| panic!("{e}"));
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

const TYPES: &[u8] = br#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="PNG" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="pres"/></Types>"#;

fn open(parts: &[(&str, &[u8])], limits: Limits) -> Result<Package<'static>, ImportError> {
    let bytes: &'static [u8] = Box::leak(zip_of(parts).into_boxed_slice());
    Package::open(bytes, limits)
}

#[test]
fn parts_are_found_by_name_whatever_the_case_and_read_whole() {
    let mut p = open(
        &[
            ("[Content_Types].xml", TYPES),
            ("PPT/Slides/Slide1.xml", b"<a/>"),
        ],
        Limits::default(),
    )
    .unwrap_or_else(|e| panic!("{e}"));
    assert!(p.has("ppt/slides/slide1.xml"));
    assert_eq!(
        p.real_name("ppt/slides/slide1.xml"),
        Some("PPT/Slides/Slide1.xml")
    );
    assert_eq!(p.read("ppt/slides/slide1.xml").unwrap_or_default(), b"<a/>");
    assert!(matches!(p.read("nope.xml"), Err(ReadError::Missing(_))));
}

#[test]
fn content_types_come_from_overrides_first_then_the_extension() {
    let p = open(&[("[Content_Types].xml", TYPES)], Limits::default())
        .unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(
        p.content_type("ppt/presentation.xml").as_deref(),
        Some("pres")
    );
    assert_eq!(
        p.content_type("ppt/media/image1.png").as_deref(),
        Some("image/png")
    );
    assert_eq!(p.content_type("ppt/media/x.bin"), None);
}

#[test]
fn a_name_that_could_leave_the_package_is_ignored_and_listed() {
    let p = open(
        &[
            ("[Content_Types].xml", TYPES),
            ("../evil.xml", b"<a/>"),
            ("/abs.xml", b"<a/>"),
            ("a/../../b.xml", b"<a/>"),
            ("c\\d.xml", b"<a/>"),
            ("ok/../fine.xml", b"<a/>"),
        ],
        Limits::default(),
    )
    .unwrap_or_else(|e| panic!("{e}"));
    assert!(!p.has("../evil.xml") && !p.has("abs.xml") && !p.has("b.xml"));
    assert_eq!(p.ignored.len(), 5, "{:?}", p.ignored);
}

#[test]
fn a_part_over_the_limit_and_a_total_over_the_limit_are_refused() {
    let big = vec![b'x'; 2000];
    let limits = Limits {
        part: 1000,
        total: 2500,
        entries: 10,
    };
    let mut p = open(&[("[Content_Types].xml", TYPES), ("big.bin", &big)], limits)
        .unwrap_or_else(|e| panic!("{e}"));
    assert!(matches!(p.read("big.bin"), Err(ReadError::TooLarge(_))));

    let each = vec![b'y'; 900];
    let mut p = open(
        &[
            ("[Content_Types].xml", TYPES),
            ("a.bin", &each),
            ("b.bin", &each),
            ("c.bin", &each),
        ],
        limits,
    )
    .unwrap_or_else(|e| panic!("{e}"));
    assert!(p.read("a.bin").is_ok());
    assert!(p.read("b.bin").is_ok());
    assert!(
        matches!(p.read("c.bin"), Err(ReadError::TooLarge(_))),
        "{}",
        p.total_read()
    );
}

#[test]
fn too_many_entries_and_things_that_are_not_presentations_are_errors_that_say_so() {
    let limits = Limits {
        entries: 2,
        ..Limits::default()
    };
    let many = zip_of(&[("[Content_Types].xml", TYPES), ("a", b""), ("b", b"")]);
    assert!(matches!(
        Package::open(&many, limits),
        Err(ImportError::TooLarge(_))
    ));
    assert!(matches!(
        Package::open(b"plain text", Limits::default()),
        Err(ImportError::NotAPresentation(_))
    ));
    assert!(matches!(
        Package::open(&zip_of(&[("a.txt", b"x")]), Limits::default()),
        Err(ImportError::NotAPresentation(_))
    ));
    let old = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    let Err(ImportError::Unsupported(m)) = Package::open(&old, Limits::default()) else {
        panic!("an old file")
    };
    assert!(m.contains(".ppt"), "{m}");
}

#[test]
fn relationships_are_read_by_id_kind_and_target() {
    let rels = br#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a%20b" TargetMode="External"/>
    </Relationships>"#;
    let mut p = open(
        &[
            ("[Content_Types].xml", TYPES),
            ("ppt/slides/_rels/slide1.xml.rels", rels),
            ("ppt/slides/slide1.xml", b"<a/>"),
            ("ppt/slideLayouts/slideLayout2.xml", b"<a/>"),
        ],
        Limits::default(),
    )
    .unwrap_or_else(|e| panic!("{e}"));
    let rels = p.rels_of("ppt/slides/slide1.xml");
    assert_eq!(rels.items.len(), 2);
    let layout = rels.get("rId1").unwrap_or_else(|| panic!("rId1"));
    assert_eq!(layout.kind, "slideLayout");
    assert_eq!(
        p.target("ppt/slides/slide1.xml", layout).as_deref(),
        Some("ppt/slideLayouts/slideLayout2.xml")
    );
    let link = rels.get("rId2").unwrap_or_else(|| panic!("rId2"));
    assert!(link.external);
    assert_eq!(p.target("ppt/slides/slide1.xml", link), None);
    assert!(p.rels_of("ppt/slides/none.xml").items.is_empty());
}

#[test]
fn targets_resolve_against_the_owner_and_cannot_climb_out() {
    assert_eq!(
        resolve("ppt/slides/slide1.xml", "../media/image1.png").as_deref(),
        Some("ppt/media/image1.png")
    );
    assert_eq!(
        resolve("ppt/slides/slide1.xml", "/ppt/theme/theme1.xml").as_deref(),
        Some("ppt/theme/theme1.xml")
    );
    assert_eq!(
        resolve("ppt/presentation.xml", "slides/slide%201.xml").as_deref(),
        Some("ppt/slides/slide 1.xml")
    );
    assert_eq!(resolve("ppt/slides/slide1.xml", "../../../x.xml"), None);
    assert_eq!(
        resolve("slide1.xml", "./a/./b.xml").as_deref(),
        Some("a/b.xml")
    );
}
