//! The pictures of a presentation, kept once each and named by what they
//! hold, so importing the same picture twice (or the same deck again) gives
//! the same file name and never a copy.

use std::collections::HashMap;
use std::io::Cursor;

use image::ImageReader;

use super::package::Package;

/// A picture returned with the deck: the path the deck names it by, and its bytes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaFile {
    /// `assets/<name>`.
    pub path: String,
    pub bytes: Vec<u8>,
}

/// A picture as an element refers to it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Picture {
    pub src: String,
    pub width: u32,
    pub height: u32,
}

/// What a set of bytes is, as far as a deck can hold it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Png,
    Jpeg,
    Gif,
    Webp,
    Svg,
    /// A picture format a deck cannot hold, by name.
    Other(&'static str),
}

impl Kind {
    pub fn sniff(bytes: &[u8]) -> Kind {
        if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
            Kind::Png
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            Kind::Jpeg
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            Kind::Gif
        } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            Kind::Webp
        } else if String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]).contains("<svg") {
            Kind::Svg
        } else if bytes.len() > 44 && bytes[..4] == [1, 0, 0, 0] && &bytes[40..44] == b" EMF" {
            Kind::Other("EMF")
        } else if bytes.starts_with(&[0xd7, 0xcd, 0xc6, 0x9a]) {
            Kind::Other("WMF")
        } else if bytes.starts_with(b"BM") {
            Kind::Other("BMP")
        } else if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") {
            Kind::Other("TIFF")
        } else {
            Kind::Other("an unknown format")
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Kind::Png => "png",
            Kind::Jpeg => "jpg",
            Kind::Gif => "gif",
            Kind::Webp => "webp",
            Kind::Svg => "svg",
            Kind::Other(_) => "bin",
        }
    }
}

/// FNV-1a: cheap, and the same on every machine.
fn hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    })
}

/// A file stem safe to use in a path: letters, digits, `-` and `_`.
fn stem_of(part: &str) -> String {
    let file = part.rsplit('/').next().unwrap_or(part);
    let stem = file.rsplit_once('.').map_or(file, |(s, _)| s);
    let clean: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' {
                c
            } else {
                '-'
            }
        })
        .take(40)
        .collect();
    if clean.is_empty() {
        "picture".to_owned()
    } else {
        clean
    }
}

/// The name a picture made here gets: `assets/<stem>-<hash>.<extension>`, the same for the same bytes.
pub(crate) fn named(stem: &str, bytes: &[u8], extension: &str) -> String {
    let key = hash(bytes);
    format!(
        "assets/{stem}-{:08x}.{extension}",
        (key ^ (key >> 32)) as u32
    )
}

/// The pictures read so far.
#[derive(Default)]
pub struct MediaStore {
    files: Vec<MediaFile>,
    by_part: HashMap<String, Result<Picture, String>>,
    by_hash: HashMap<u64, Vec<usize>>,
}

impl MediaStore {
    /// The picture in a part, or why it cannot be one.
    pub fn picture(&mut self, pkg: &mut Package, part: &str) -> Result<Picture, String> {
        if let Some(known) = self.by_part.get(part) {
            return known.clone();
        }
        let result = self.read(pkg, part);
        self.by_part.insert(part.to_owned(), result.clone());
        result
    }

    fn read(&mut self, pkg: &mut Package, part: &str) -> Result<Picture, String> {
        let bytes = pkg.read(part).map_err(|e| e.message())?;
        let kind = Kind::sniff(&bytes);
        let (width, height) = match kind {
            Kind::Other(name) => {
                return Err(format!("`{part}` is {name}, which a deck cannot hold"));
            }
            Kind::Svg => (0, 0),
            _ => ImageReader::new(Cursor::new(&bytes))
                .with_guessed_format()
                .ok()
                .and_then(|r| r.into_dimensions().ok())
                .filter(|(w, h)| *w > 0 && *h > 0)
                .ok_or_else(|| {
                    format!("the picture `{part}` is damaged: its size cannot be read")
                })?,
        };
        let src = self.store(part, kind, bytes);
        Ok(Picture { src, width, height })
    }

    /// Keeps the bytes under a name made from the part and the bytes, the same each time.
    pub fn store(&mut self, part: &str, kind: Kind, bytes: Vec<u8>) -> String {
        let key = hash(&bytes);
        if let Some(found) = self.by_hash.get(&key).into_iter().flatten().find(|i| {
            self.files[**i].bytes == bytes && self.files[**i].path.ends_with(kind.extension())
        }) {
            return self.files[*found].path.clone();
        }
        let base = format!(
            "assets/{}-{:08x}",
            stem_of(part),
            (key ^ (key >> 32)) as u32
        );
        let mut path = format!("{base}.{}", kind.extension());
        for n in 2.. {
            if !self.files.iter().any(|f| f.path == path) {
                break;
            }
            path = format!("{base}-{n}.{}", kind.extension());
        }
        self.by_hash.entry(key).or_default().push(self.files.len());
        self.files.push(MediaFile {
            path: path.clone(),
            bytes,
        });
        path
    }

    pub fn into_files(self) -> Vec<MediaFile> {
        self.files
    }

    pub fn len(&self) -> usize {
        self.files.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::package::tests::zip_of;
    use crate::import::package::{Limits, Package};

    const TYPES: &[u8] =
        br#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>"#;

    fn png(w: u32, h: u32) -> Vec<u8> {
        crate::samples::solid(w, h, [10, 20, 30])
    }

    #[test]
    fn a_picture_is_measured_named_by_its_contents_and_kept_once() {
        let one = png(30, 20);
        let bytes = zip_of(&[
            ("[Content_Types].xml", TYPES),
            ("ppt/media/image1.png", &one),
            ("ppt/media/copy.png", &one),
            ("ppt/media/other.png", &png(5, 5)),
        ]);
        let mut pkg = Package::open(&bytes, Limits::default()).unwrap_or_else(|e| panic!("{e}"));
        let mut store = MediaStore::default();
        let a = store
            .picture(&mut pkg, "ppt/media/image1.png")
            .unwrap_or_else(|e| panic!("{e}"));
        let b = store
            .picture(&mut pkg, "ppt/media/copy.png")
            .unwrap_or_else(|e| panic!("{e}"));
        let c = store
            .picture(&mut pkg, "ppt/media/other.png")
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!((a.width, a.height), (30, 20));
        assert_eq!(a.src, b.src, "the same bytes are the same file");
        assert_ne!(a.src, c.src);
        assert!(
            a.src.starts_with("assets/image1-") && a.src.ends_with(".png"),
            "{}",
            a.src
        );
        assert_eq!(store.len(), 2);
        // The name is the same every time.
        let mut again = MediaStore::default();
        let a2 = again
            .picture(&mut pkg, "ppt/media/image1.png")
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(a.src, a2.src);
    }

    #[test]
    fn formats_a_deck_cannot_hold_and_damaged_pictures_say_why() {
        let mut emf = vec![0u8; 60];
        emf[0] = 1;
        emf[40..44].copy_from_slice(b" EMF");
        let bytes = zip_of(&[
            ("[Content_Types].xml", TYPES),
            ("a.emf", &emf),
            ("b.png", &png(4, 4)[..20]),
            ("c.bin", b"junk"),
        ]);
        let mut pkg = Package::open(&bytes, Limits::default()).unwrap_or_else(|e| panic!("{e}"));
        let mut store = MediaStore::default();
        assert!(
            store
                .picture(&mut pkg, "a.emf")
                .unwrap_err()
                .contains("EMF")
        );
        assert!(
            store
                .picture(&mut pkg, "b.png")
                .unwrap_err()
                .contains("damaged")
        );
        assert!(
            store
                .picture(&mut pkg, "c.bin")
                .unwrap_err()
                .contains("unknown format")
        );
        assert!(
            store
                .picture(&mut pkg, "missing.png")
                .unwrap_err()
                .contains("not in the file")
        );
        assert_eq!(store.len(), 0);
    }

    #[test]
    fn a_stem_is_made_safe() {
        assert_eq!(stem_of("ppt/media/image 1 (a).png"), "image-1--a-");
        assert_eq!(stem_of("ppt/media/.png"), "picture");
        assert_eq!(stem_of("ppt/media/日本.png"), "--");
    }
}
