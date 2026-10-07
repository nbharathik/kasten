//! Pictures without decoding them: what kind a file is and how many pixels
//! wide and high, read from its first bytes. A picture that is not what its
//! name says, or is cut short, has no size rather than a wrong one.

/// The kinds of picture whose size can be read.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Png,
    Jpeg,
    Gif,
    Webp,
    Avif,
    Bmp,
    Svg,
}

impl Kind {
    pub fn mime(self) -> &'static str {
        match self {
            Kind::Png => "image/png",
            Kind::Jpeg => "image/jpeg",
            Kind::Gif => "image/gif",
            Kind::Webp => "image/webp",
            Kind::Avif => "image/avif",
            Kind::Bmp => "image/bmp",
            Kind::Svg => "image/svg+xml",
        }
    }

    /// Whether the thumbnail maker can decode it.
    pub fn is_raster(self) -> bool {
        matches!(self, Kind::Png | Kind::Jpeg | Kind::Gif | Kind::Webp)
    }
}

/// The file extensions of pictures a page or a slide shows.
pub const PICTURE_EXTENSIONS: [&str; 8] =
    ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp"];

/// Whether a file of this name is a picture, by its extension.
pub fn is_picture_name(name: &str) -> bool {
    name.rsplit_once('.').is_some_and(|(stem, extension)| {
        !stem.is_empty() && PICTURE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
    })
}

/// The type a picture of this name is sent as; plain bytes for others.
pub fn mime_of(name: &str) -> &'static str {
    match name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// The kind of picture the bytes are, by their first bytes.
pub fn sniff(bytes: &[u8]) -> Option<Kind> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(Kind::Png)
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(Kind::Jpeg)
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(Kind::Gif)
    } else if bytes.len() >= 16 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(Kind::Webp)
    } else if bytes.len() >= 16
        && &bytes[4..8] == b"ftyp"
        && matches!(&bytes[8..12], b"avif" | b"avis")
    {
        Some(Kind::Avif)
    } else if bytes.starts_with(b"BM") && bytes.len() >= 26 {
        Some(Kind::Bmp)
    } else {
        // An SVG is text with an `<svg` tag near the start (after a prolog and comments).
        let head = &bytes[..bytes.len().min(SVG_HEAD)];
        let text = String::from_utf8_lossy(head).to_ascii_lowercase();
        text.contains("<svg").then_some(Kind::Svg)
    }
}

/// How far into an SVG its opening tag is looked for.
const SVG_HEAD: usize = 16 * 1024;

/// How much of a file its size can need: a JPEG's may follow a long block of
/// metadata.
pub const HEAD_BYTES: usize = 128 * 1024;

fn be16(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from(u16::from_be_bytes(
        b.get(at..at + 2)?.try_into().ok()?,
    )))
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn le16(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from(u16::from_le_bytes(
        b.get(at..at + 2)?.try_into().ok()?,
    )))
}

fn le24(b: &[u8], at: usize) -> Option<u32> {
    let s = b.get(at..at + 3)?;
    Some(u32::from(s[0]) | u32::from(s[1]) << 8 | u32::from(s[2]) << 16)
}

fn le32(b: &[u8], at: usize) -> Option<i64> {
    Some(i64::from(i32::from_le_bytes(
        b.get(at..at + 4)?.try_into().ok()?,
    )))
}

/// The orientation an Exif block asks for (1 to 8), from a JPEG's APP1 data.
fn exif_orientation(app1: &[u8]) -> Option<u32> {
    let tiff = app1.strip_prefix(b"Exif\0\0")?;
    let little = match tiff.get(..2)? {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let read16 = |at: usize| -> Option<u32> {
        let two: [u8; 2] = tiff.get(at..at + 2)?.try_into().ok()?;
        Some(u32::from(if little {
            u16::from_le_bytes(two)
        } else {
            u16::from_be_bytes(two)
        }))
    };
    let read32 = |at: usize| -> Option<u32> {
        let four: [u8; 4] = tiff.get(at..at + 4)?.try_into().ok()?;
        Some(if little {
            u32::from_le_bytes(four)
        } else {
            u32::from_be_bytes(four)
        })
    };
    let first = usize::try_from(read32(4)?).ok()?;
    let count = read16(first)? as usize;
    (0..count.min(64)).find_map(|entry| {
        let at = first + 2 + entry * 12;
        (read16(at)? == 0x0112).then(|| read16(at + 8)).flatten()
    })
}

fn jpeg(b: &[u8]) -> Option<(u32, u32)> {
    let mut at = 2;
    let mut turned = false;
    while at + 4 <= b.len() {
        if b[at] != 0xFF {
            at += 1;
            continue;
        }
        let marker = b[at + 1];
        match marker {
            // Fill bytes before a marker.
            0xFF => at += 1,
            // Markers with no length: the start, restarts, and stuffed zeros.
            0x00 | 0x01 | 0xD0..=0xD8 => at += 2,
            // The end, or the scan: no frame header came first.
            0xD9 | 0xDA => return None,
            _ => {
                let length = be16(b, at + 2)? as usize;
                let data = b.get(at + 4..(at + 2 + length).min(b.len()))?;
                if marker == 0xE1 {
                    turned = matches!(exif_orientation(data), Some(5..=8));
                }
                // The start-of-frame markers; not the tables between them.
                if (0xC0..=0xCF).contains(&marker) && !matches!(marker, 0xC4 | 0xC8 | 0xCC) {
                    let (h, w) = (be16(data, 1)?, be16(data, 3)?);
                    return Some(if turned { (h, w) } else { (w, h) });
                }
                at += 2 + length;
            }
        }
    }
    None
}

fn webp(b: &[u8]) -> Option<(u32, u32)> {
    match b.get(12..16)? {
        b"VP8 " => {
            if b.get(23..26)? != [0x9D, 0x01, 0x2A] {
                return None;
            }
            Some((le16(b, 26)? & 0x3FFF, le16(b, 28)? & 0x3FFF))
        }
        b"VP8L" => {
            if *b.get(20)? != 0x2F {
                return None;
            }
            let bits = u32::from_le_bytes(b.get(21..25)?.try_into().ok()?);
            Some(((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1))
        }
        b"VP8X" => Some((le24(b, 24)? + 1, le24(b, 27)? + 1)),
        _ => None,
    }
}

/// An AVIF's size is in its `ispe` (image spatial extents) box.
fn avif(b: &[u8]) -> Option<(u32, u32)> {
    let at = b.windows(4).position(|w| w == b"ispe")?;
    Some((be32(b, at + 8)?, be32(b, at + 12)?))
}

fn bmp(b: &[u8]) -> Option<(u32, u32)> {
    let header = le32(b, 14)?;
    let (w, h) = if header == 12 {
        (i64::from(le16(b, 18)?), i64::from(le16(b, 20)?))
    } else {
        (le32(b, 18)?, le32(b, 22)?)
    };
    Some((u32::try_from(w).ok()?, u32::try_from(h.abs()).ok()?))
}

/// The value of attribute `name` in an opening tag's text, quoted either way.
fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let mut from = 0;
    while let Some(found) = tag[from..].find(name) {
        let at = from + found;
        from = at + name.len();
        let before_ok = at == 0 || tag.as_bytes()[at - 1].is_ascii_whitespace();
        let rest = tag[from..].trim_start();
        let Some(rest) = rest.strip_prefix('=') else {
            continue;
        };
        let rest = rest.trim_start();
        let quote = rest.chars().next().filter(|q| *q == '"' || *q == '\'')?;
        let inner = &rest[1..];
        let end = inner.find(quote)?;
        if before_ok {
            return Some(&inner[..end]);
        }
    }
    None
}

/// A length in an SVG as pixels: plain numbers and CSS absolute units; a
/// percentage or a font-relative length says nothing about the size.
fn svg_length(text: &str) -> Option<f64> {
    let text = text.trim();
    let end = text
        .find(|c: char| !(c.is_ascii_digit() || matches!(c, '.' | '-' | '+' | 'e' | 'E')))
        .unwrap_or(text.len());
    let (number, unit) = text.split_at(end);
    let value: f64 = number.parse().ok()?;
    let per = match unit.trim().to_ascii_lowercase().as_str() {
        "" | "px" => 1.0,
        "pt" => 96.0 / 72.0,
        "pc" => 16.0,
        "mm" => 96.0 / 25.4,
        "cm" => 96.0 / 2.54,
        "in" => 96.0,
        _ => return None,
    };
    (value.is_finite() && value > 0.0).then_some(value * per)
}

fn svg(b: &[u8]) -> Option<(u32, u32)> {
    let text = String::from_utf8_lossy(&b[..b.len().min(SVG_HEAD)]).into_owned();
    let start = text.to_ascii_lowercase().find("<svg")?;
    let end = text[start..].find('>').map_or(text.len(), |e| start + e);
    let tag = &text[start..end];
    let width = attribute(tag, "width").and_then(svg_length);
    let height = attribute(tag, "height").and_then(svg_length);
    let view: Option<Vec<f64>> = attribute(tag, "viewBox").map(|v| {
        v.split([' ', ',', '\t', '\n', '\r'])
            .filter(|part| !part.is_empty())
            .filter_map(|part| part.parse().ok())
            .collect()
    });
    let view = view.filter(|n| n.len() == 4 && n[2] > 0.0 && n[3] > 0.0);
    let (w, h) = match (width, height, view) {
        (Some(w), Some(h), _) => (w, h),
        (Some(w), None, Some(v)) => (w, w * v[3] / v[2]),
        (None, Some(h), Some(v)) => (h * v[2] / v[3], h),
        (None, None, Some(v)) => (v[2], v[3]),
        _ => return None,
    };
    Some((w.round() as u32, h.round() as u32))
}

/// The width and height in pixels, from the first bytes of a picture. Only
/// [`HEAD_BYTES`] of a file are ever needed.
pub fn dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let size = match sniff(bytes)? {
        Kind::Png => {
            if bytes.get(12..16)? != b"IHDR" {
                return None;
            }
            (be32(bytes, 16)?, be32(bytes, 20)?)
        }
        Kind::Gif => (le16(bytes, 6)?, le16(bytes, 8)?),
        Kind::Jpeg => jpeg(bytes)?,
        Kind::Webp => webp(bytes)?,
        Kind::Avif => avif(bytes)?,
        Kind::Bmp => bmp(bytes)?,
        Kind::Svg => svg(bytes)?,
    };
    // A size no picture has is a header that is not one.
    let sane = |n: u32| (1..=i32::MAX as u32).contains(&n);
    (sane(size.0) && sane(size.1)).then_some(size)
}

#[cfg(test)]
mod tests;
