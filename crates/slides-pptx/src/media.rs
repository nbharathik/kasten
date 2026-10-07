//! Pictures. The host hands over bytes by the path a deck names; this keeps
//! each distinct picture once, whichever paths and elements use it, reads its
//! size from the file's header (never decoding the pixels) and decides what
//! PowerPoint can hold.

use std::collections::HashMap;
use std::io::Cursor;

use image::{ImageFormat, ImageReader};

use crate::package::Package;

/// Where a deck's pictures come from.
pub trait Media {
    /// The bytes of the picture a deck names by `path`, such as `assets/figure.png`.
    fn read(&self, path: &str) -> Option<Vec<u8>>;
}

/// One picture in the package.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Stored {
    index: usize,
    pub ext: &'static str,
    pub width: u32,
    pub height: u32,
}

impl Stored {
    #[cfg(test)]
    pub fn for_test(width: u32, height: u32) -> Stored {
        Stored {
            index: 0,
            ext: "png",
            width,
            height,
        }
    }

    /// Where the part lives in the package.
    pub fn part_name(&self) -> String {
        format!("ppt/media/image{}.{}", self.index + 1, self.ext)
    }

    /// The address of the part from a part in `ppt/slides`, `ppt/slideMasters` or `ppt/slideLayouts`.
    pub fn target(&self) -> String {
        format!("../media/image{}.{}", self.index + 1, self.ext)
    }
}

/// A picture a deck named, ready to be put on a slide.
#[derive(Clone, Debug, PartialEq)]
pub struct Picture {
    /// What every program can show.
    pub raster: Stored,
    /// The drawing behind a raster stand-in, kept so PowerPoint can draw it sharp.
    pub svg: Option<Stored>,
    /// Something to tell the person about the picture.
    pub caution: Option<String>,
}

struct Entry {
    bytes: Vec<u8>,
    stored: Stored,
    content_type: &'static str,
}

/// The pictures of one export.
#[derive(Default)]
pub struct Images {
    entries: Vec<Entry>,
    by_hash: HashMap<u64, Vec<usize>>,
    by_path: HashMap<String, Result<Picture, String>>,
}

/// What the bytes are.
enum Kind {
    Raster(&'static str, &'static str),
    Svg,
    Other(String),
}

fn kind_of(bytes: &[u8]) -> Kind {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Kind::Raster("png", "image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Kind::Raster("jpeg", "image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Kind::Raster("gif", "image/gif")
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Kind::Raster("webp", "image/webp")
    } else if is_svg(bytes) {
        Kind::Svg
    } else {
        Kind::Other(match image::guess_format(bytes) {
            Ok(format) => format_name(format),
            Err(_) => "an unknown format".to_owned(),
        })
    }
}

fn format_name(format: ImageFormat) -> String {
    format!("{format:?}").to_uppercase()
}

fn is_svg(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(2048)];
    String::from_utf8_lossy(head).contains("<svg")
}

/// The size of a raster picture, read from its header.
fn dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let (w, h) = reader.into_dimensions().ok()?;
    (w > 0 && h > 0).then_some((w, h))
}

/// FNV-1a: cheap, and the same on every machine.
fn hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    })
}

impl Images {
    pub fn new() -> Images {
        Images::default()
    }

    /// The picture a deck names by `path`, or why it cannot be used.
    pub fn load(&mut self, media: &dyn Media, path: &str) -> Result<Picture, String> {
        if let Some(known) = self.by_path.get(path) {
            return known.clone();
        }
        let result = self.read(media, path);
        self.by_path.insert(path.to_owned(), result.clone());
        result
    }

    fn read(&mut self, media: &dyn Media, path: &str) -> Result<Picture, String> {
        let bytes = media
            .read(path)
            .ok_or_else(|| format!("the picture `{path}` was not found"))?;
        match kind_of(&bytes) {
            Kind::Raster(ext, content_type) => {
                let raster = self.raster(path, bytes, ext, content_type)?;
                let caution = (ext == "webp").then(|| {
                    format!("`{path}` is a WebP picture, which PowerPoint before Microsoft 365 cannot show")
                });
                Ok(Picture {
                    raster,
                    svg: None,
                    caution,
                })
            }
            Kind::Svg => self.svg(media, path, bytes),
            Kind::Other(name) => Err(format!(
                "the picture `{path}` is {name}, which a presentation cannot hold; use PNG or JPEG"
            )),
        }
    }

    fn raster(
        &mut self,
        path: &str,
        bytes: Vec<u8>,
        ext: &'static str,
        content_type: &'static str,
    ) -> Result<Stored, String> {
        let (width, height) = dimensions(&bytes)
            .ok_or_else(|| format!("the picture `{path}` is damaged: its size cannot be read"))?;
        Ok(self.store(bytes, ext, content_type, width, height))
    }

    /// An SVG needs a PNG beside it for the programs that cannot draw one:
    /// `figure.svg.png` or `figure.png`.
    fn svg(&mut self, media: &dyn Media, path: &str, bytes: Vec<u8>) -> Result<Picture, String> {
        let stem = path
            .strip_suffix(".svg")
            .or_else(|| path.strip_suffix(".SVG"))
            .unwrap_or(path);
        let twins = [format!("{path}.png"), format!("{stem}.png")];
        for twin in twins {
            let Some(png) = media.read(&twin) else {
                continue;
            };
            if let Kind::Raster("png", content_type) = kind_of(&png) {
                let raster = self.raster(&twin, png, "png", content_type)?;
                let svg = self.store(bytes, "svg", "image/svg+xml", raster.width, raster.height);
                return Ok(Picture {
                    raster,
                    svg: Some(svg),
                    caution: None,
                });
            }
        }
        Err(format!(
            "the picture `{path}` is an SVG with no PNG beside it (`{stem}.png`); \
             programs other than PowerPoint cannot draw an SVG"
        ))
    }

    fn store(
        &mut self,
        bytes: Vec<u8>,
        ext: &'static str,
        content_type: &'static str,
        width: u32,
        height: u32,
    ) -> Stored {
        let key = hash(&bytes);
        if let Some(found) = self
            .by_hash
            .get(&key)
            .into_iter()
            .flatten()
            .find(|i| self.entries[**i].bytes == bytes && self.entries[**i].stored.ext == ext)
        {
            return self.entries[*found].stored;
        }
        let index = self.entries.len();
        let stored = Stored {
            index,
            ext,
            width,
            height,
        };
        self.entries.push(Entry {
            bytes,
            stored,
            content_type,
        });
        self.by_hash.entry(key).or_default().push(index);
        stored
    }

    /// Adds the pictures to the package.
    pub fn add_to(self, package: &mut Package) {
        for entry in self.entries {
            package.add_media(
                &entry.stored.part_name(),
                entry.stored.ext,
                entry.content_type,
                entry.bytes,
            );
        }
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::collections::BTreeMap;

    use super::*;
    use crate::samples;

    #[derive(Default)]
    struct Files {
        files: BTreeMap<String, Vec<u8>>,
        reads: Cell<usize>,
    }

    impl Files {
        fn with(mut self, path: &str, bytes: &[u8]) -> Files {
            self.files.insert(path.to_owned(), bytes.to_vec());
            self
        }
    }

    impl Media for Files {
        fn read(&self, path: &str) -> Option<Vec<u8>> {
            self.reads.set(self.reads.get() + 1);
            self.files.get(path).cloned()
        }
    }

    #[test]
    fn the_four_raster_formats_are_told_apart_by_their_bytes_and_measured() {
        let png = samples::solid(7, 5, [1, 2, 3]);
        let files = Files::default()
            .with("a.png", &png)
            .with("b.dat", samples::JPEG_3X2)
            .with("c.gif", samples::GIF_4X3)
            .with("d.webp", samples::WEBP_3X2);
        let mut images = Images::new();
        let got: Vec<_> = ["a.png", "b.dat", "c.gif", "d.webp"]
            .iter()
            .map(|p| {
                images
                    .load(&files, p)
                    .map(|p| (p.raster.ext, p.raster.width, p.raster.height))
            })
            .collect();
        assert_eq!(
            got,
            [
                Ok(("png", 7, 5)),
                Ok(("jpeg", 3, 2)),
                Ok(("gif", 4, 3)),
                Ok(("webp", 3, 2))
            ]
        );
    }

    #[test]
    fn a_picture_used_twice_is_stored_once_and_read_once_per_path() {
        let png = samples::solid(2, 2, [9, 9, 9]);
        let files = Files::default().with("one.png", &png).with("two.png", &png);
        let mut images = Images::new();
        let a = images.load(&files, "one.png").unwrap();
        let b = images.load(&files, "two.png").unwrap();
        let again = images.load(&files, "one.png").unwrap();
        assert_eq!(a.raster, b.raster);
        assert_eq!(a, again);
        assert_eq!(images.len(), 1);
        assert_eq!(files.reads.get(), 2, "a path is read once");
        assert_eq!(a.raster.part_name(), "ppt/media/image1.png");
        assert_eq!(a.raster.target(), "../media/image1.png");
    }

    #[test]
    fn different_pictures_get_numbers_in_the_order_they_are_first_used() {
        let files = Files::default()
            .with("a.png", &samples::solid(2, 2, [1, 1, 1]))
            .with("b.png", &samples::solid(2, 2, [2, 2, 2]));
        let mut images = Images::new();
        let b = images.load(&files, "b.png").unwrap();
        let a = images.load(&files, "a.png").unwrap();
        assert_eq!(b.raster.part_name(), "ppt/media/image1.png");
        assert_eq!(a.raster.part_name(), "ppt/media/image2.png");
    }

    #[test]
    fn a_missing_picture_and_a_format_a_deck_cannot_hold_say_what_is_wrong() {
        let files = Files::default()
            .with("x.bmp", samples::BMP_5X7)
            .with("y.png", b"not a picture");
        let mut images = Images::new();
        let missing = images.load(&files, "nope.png").unwrap_err();
        assert!(
            missing.contains("nope.png") && missing.contains("not found"),
            "{missing}"
        );
        let bmp = images.load(&files, "x.bmp").unwrap_err();
        assert!(bmp.contains("BMP") && bmp.contains("PNG or JPEG"), "{bmp}");
        let junk = images.load(&files, "y.png").unwrap_err();
        assert!(junk.contains("unknown format"), "{junk}");
    }

    #[test]
    fn a_damaged_header_is_refused_instead_of_written() {
        let mut png = samples::solid(4, 4, [1, 1, 1]);
        png.truncate(20);
        let files = Files::default().with("cut.png", &png);
        let err = Images::new().load(&files, "cut.png").unwrap_err();
        assert!(err.contains("damaged"), "{err}");
    }

    #[test]
    fn an_svg_travels_with_the_png_beside_it() {
        let svg = br#"<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>"#;
        let png = samples::solid(20, 10, [5, 5, 5]);
        let files = Files::default().with("fig.svg", svg).with("fig.png", &png);
        let mut images = Images::new();
        let picture = images.load(&files, "fig.svg").unwrap();
        assert_eq!(
            (
                picture.raster.ext,
                picture.raster.width,
                picture.raster.height
            ),
            ("png", 20, 10)
        );
        assert_eq!(picture.svg.map(|s| s.ext), Some("svg"));
        assert_eq!(images.len(), 2);
    }

    #[test]
    fn an_svg_alone_cannot_be_used() {
        let files = Files::default().with("fig.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>");
        let err = Images::new().load(&files, "fig.svg").unwrap_err();
        assert!(err.contains("SVG") && err.contains("fig.png"), "{err}");
    }

    #[test]
    fn webp_is_kept_with_a_caution() {
        let files = Files::default().with("w.webp", samples::WEBP_3X2);
        let picture = Images::new().load(&files, "w.webp").unwrap();
        assert!(picture.caution.is_some_and(|c| c.contains("WebP")));
    }
}
