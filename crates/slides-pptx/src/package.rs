//! The package: the parts of the file, their content types and the zip they
//! are written to. The zip is the same bytes for the same parts: entries go
//! in the order they were added, with one fixed time.

use std::borrow::Cow;
use std::io::{Cursor, Write};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime, ZipWriter};

use crate::error::Error;
use crate::rels::Rels;
use crate::xml::Xml;

const NS_TYPES: &str = "http://schemas.openxmlformats.org/package/2006/content-types";

pub const CT_RELS: &str = "application/vnd.openxmlformats-package.relationships+xml";
pub const CT_CORE: &str = "application/vnd.openxmlformats-package.core-properties+xml";
pub const CT_APP: &str = "application/vnd.openxmlformats-officedocument.extended-properties+xml";
pub const CT_PRESENTATION: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
pub const CT_SLIDE: &str = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
pub const CT_LAYOUT: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml";
pub const CT_MASTER: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml";
pub const CT_NOTES_MASTER: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml";
pub const CT_NOTES_SLIDE: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml";
pub const CT_PRES_PROPS: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml";
pub const CT_VIEW_PROPS: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml";
pub const CT_TABLE_STYLES: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml";
pub const CT_THEME: &str = "application/vnd.openxmlformats-officedocument.theme+xml";

struct Part {
    name: String,
    /// The content type it is listed under, or None when its extension's default covers it.
    content_type: Option<Cow<'static, str>>,
    bytes: Vec<u8>,
    /// Whether deflating it is worth the time: not for a picture, which is already compressed.
    compress: bool,
}

/// The parts of a presentation, before they are zipped.
#[derive(Default)]
pub struct Package {
    parts: Vec<Part>,
    /// Extensions of media parts and the type each is served as, in the order first seen.
    media_types: Vec<(String, &'static str)>,
}

impl Package {
    pub fn new() -> Package {
        Package::default()
    }

    /// An XML part listed under its own content type.
    pub fn add(&mut self, name: &str, content_type: &'static str, bytes: Vec<u8>) {
        self.parts.push(Part {
            name: name.to_owned(),
            content_type: Some(Cow::Borrowed(content_type)),
            bytes,
            compress: true,
        });
    }

    /// A part an imported file had, listed under the content type it had there.
    pub fn add_kept(&mut self, name: &str, content_type: &str, bytes: Vec<u8>) {
        self.parts.push(Part {
            name: name.to_owned(),
            content_type: Some(Cow::Owned(content_type.to_owned())),
            bytes,
            compress: true,
        });
    }

    /// The relationships of the part `owner` (`""` for the package itself).
    pub fn add_rels(&mut self, owner: &str, rels: &Rels) {
        if rels.is_empty() {
            return;
        }
        let path = match owner.rsplit_once('/') {
            Some((dir, file)) => format!("{dir}/_rels/{file}.rels"),
            None if owner.is_empty() => "_rels/.rels".to_owned(),
            None => format!("_rels/{owner}.rels"),
        };
        self.parts.push(Part {
            name: path,
            content_type: None,
            bytes: rels.to_xml(),
            compress: true,
        });
    }

    /// A picture, whose extension is listed with its type.
    pub fn add_media(
        &mut self,
        name: &str,
        extension: &str,
        content_type: &'static str,
        bytes: Vec<u8>,
    ) {
        if !self.media_types.iter().any(|(e, _)| e == extension) {
            self.media_types.push((extension.to_owned(), content_type));
        }
        self.parts.push(Part {
            name: name.to_owned(),
            content_type: None,
            bytes,
            compress: extension == "svg",
        });
    }

    /// The names of the parts, in the order they will be written.
    #[cfg(test)]
    pub fn names(&self) -> Vec<&str> {
        self.parts.iter().map(|p| p.name.as_str()).collect()
    }

    fn content_types(&self) -> Vec<u8> {
        let mut x = Xml::document();
        x.open("Types").attr("xmlns", NS_TYPES);
        x.leaf(
            "Default",
            &[("Extension", "rels"), ("ContentType", CT_RELS)],
        );
        x.leaf(
            "Default",
            &[("Extension", "xml"), ("ContentType", "application/xml")],
        );
        for (extension, content_type) in &self.media_types {
            x.leaf(
                "Default",
                &[("Extension", extension), ("ContentType", content_type)],
            );
        }
        for part in &self.parts {
            if let Some(content_type) = &part.content_type {
                x.leaf(
                    "Override",
                    &[
                        ("PartName", &format!("/{}", part.name)),
                        ("ContentType", content_type),
                    ],
                );
            }
        }
        x.close();
        x.finish()
    }

    /// The zip file. The content types come first, then the package's own
    /// relationships, then the rest as added.
    pub fn finish(self) -> Result<Vec<u8>, Error> {
        let types = self.content_types();
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        let stamp = DateTime::default();
        let options = |compress: bool| {
            SimpleFileOptions::default()
                .compression_method(if compress {
                    CompressionMethod::Deflated
                } else {
                    CompressionMethod::Stored
                })
                .last_modified_time(stamp)
                .unix_permissions(0o644)
        };
        zip.start_file("[Content_Types].xml", options(true))?;
        zip.write_all(&types)?;
        let (root, rest): (Vec<Part>, Vec<Part>) = self
            .parts
            .into_iter()
            .partition(|p| p.name == "_rels/.rels");
        for part in root.into_iter().chain(rest) {
            zip.start_file(&part.name, options(part.compress))?;
            zip.write_all(&part.bytes)?;
        }
        Ok(zip.finish()?.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use std::io::Read;

    use zip::ZipArchive;

    use super::*;
    use crate::rels;

    fn small() -> Package {
        let mut package = Package::new();
        let mut root = Rels::new();
        root.add(rels::OFFICE_DOCUMENT, "ppt/presentation.xml");
        package.add("ppt/presentation.xml", CT_PRESENTATION, b"<p/>".to_vec());
        package.add_rels("", &root);
        package.add_media("ppt/media/image1.png", "png", "image/png", vec![1, 2, 3]);
        package.add_media("ppt/media/image2.png", "png", "image/png", vec![4]);
        package.add_media("ppt/media/image3.jpeg", "jpeg", "image/jpeg", vec![5]);
        package
    }

    #[test]
    fn a_part_s_relationships_live_beside_it() {
        let mut package = Package::new();
        let mut rels = Rels::new();
        rels.add(rels::SLIDE_LAYOUT, "../slideLayouts/slideLayout1.xml");
        package.add_rels("ppt/slides/slide1.xml", &rels);
        package.add_rels("", &rels);
        package.add_rels("ppt/presentation.xml", &Rels::new());
        assert_eq!(
            package.names(),
            ["ppt/slides/_rels/slide1.xml.rels", "_rels/.rels"]
        );
    }

    #[test]
    fn content_types_list_each_extension_once_and_each_xml_part_by_name() {
        let bytes = small().content_types();
        let text = String::from_utf8(bytes).unwrap_or_default();
        assert_eq!(text.matches(r#"Extension="png""#).count(), 1);
        assert!(
            text.contains(r#"<Default Extension="jpeg" ContentType="image/jpeg"/>"#),
            "{text}"
        );
        assert!(
            text.contains(&format!(
                r#"<Override PartName="/ppt/presentation.xml" ContentType="{CT_PRESENTATION}"/>"#
            )),
            "{text}"
        );
        assert!(!text.contains("image1.png"), "{text}");
    }

    #[test]
    fn the_zip_starts_with_the_content_types_and_the_root_relationships() {
        let bytes = small().finish().unwrap_or_default();
        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let names: Vec<String> = archive.file_names().map(str::to_owned).collect();
        assert_eq!(
            names,
            [
                "[Content_Types].xml",
                "_rels/.rels",
                "ppt/presentation.xml",
                "ppt/media/image1.png",
                "ppt/media/image2.png",
                "ppt/media/image3.jpeg"
            ]
        );
        let mut body = Vec::new();
        archive
            .by_name("ppt/media/image1.png")
            .unwrap()
            .read_to_end(&mut body)
            .unwrap();
        assert_eq!(body, [1, 2, 3]);
    }

    #[test]
    fn the_same_parts_make_the_same_bytes() {
        assert_eq!(
            small().finish().unwrap_or_default(),
            small().finish().unwrap_or_default()
        );
    }

    #[test]
    fn every_entry_has_the_fixed_time_and_pictures_are_stored() {
        let bytes = small().finish().unwrap_or_default();
        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        for i in 0..archive.len() {
            let file = archive.by_index(i).unwrap();
            let time = file.last_modified().unwrap();
            assert_eq!(
                (time.year(), time.month(), time.day()),
                (1980, 1, 1),
                "{}",
                file.name()
            );
            let stored = file.compression() == CompressionMethod::Stored;
            assert_eq!(stored, file.name().contains("/media/"), "{}", file.name());
        }
    }
}
