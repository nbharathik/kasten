//! Pictures without decoding them: what kind a file is and how big, from its header.

/// A kind of picture file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Png,
    Jpeg,
    Gif,
    Webp,
    Svg,
}

impl Kind {
    pub fn mime(self) -> &'static str {
        match self {
            Kind::Png => "image/png",
            Kind::Jpeg => "image/jpeg",
            Kind::Gif => "image/gif",
            Kind::Webp => "image/webp",
            Kind::Svg => "image/svg+xml",
        }
    }

    /// The file extensions that fit the kind.
    pub fn extensions(self) -> &'static [&'static str] {
        match self {
            Kind::Png => &["png"],
            Kind::Jpeg => &["jpg", "jpeg"],
            Kind::Gif => &["gif"],
            Kind::Webp => &["webp"],
            Kind::Svg => &["svg"],
        }
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
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(Kind::Webp)
    } else {
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]).to_ascii_lowercase();
        head.contains("<svg").then_some(Kind::Svg)
    }
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

fn jpeg(b: &[u8]) -> Option<(u32, u32)> {
    let mut i = 2;
    while i + 9 < b.len() {
        if b[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = b[i + 1];
        if (0xC0..=0xCF).contains(&marker) && !matches!(marker, 0xC4 | 0xC8 | 0xCC) {
            let h = u32::from(u16::from_be_bytes([b[i + 5], b[i + 6]]));
            let w = u32::from(u16::from_be_bytes([b[i + 7], b[i + 8]]));
            return Some((w, h));
        }
        if marker == 0xFF || marker == 0x00 || (0xD0..=0xD9).contains(&marker) {
            i += 2;
            continue;
        }
        let length = usize::from(u16::from_be_bytes([b[i + 2], b[i + 3]]));
        i += 2 + length;
    }
    None
}

fn webp(b: &[u8]) -> Option<(u32, u32)> {
    match b.get(12..16)? {
        b"VP8 " => Some((le16(b, 26)? & 0x3FFF, le16(b, 28)? & 0x3FFF)),
        b"VP8L" => {
            let bits = u32::from_le_bytes(b.get(21..25)?.try_into().ok()?);
            Some(((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1))
        }
        b"VP8X" => Some((le24(b, 24)? + 1, le24(b, 27)? + 1)),
        _ => None,
    }
}

/// The value of an attribute in the opening `<svg ...>` tag, as a number.
fn svg_number(head: &str, name: &str) -> Option<f64> {
    let at = head.find(&format!("{name}=\""))? + name.len() + 2;
    let end = head[at..].find('"')?;
    let digits: String = head[at..at + end]
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    digits.parse().ok()
}

fn svg(b: &[u8]) -> Option<(u32, u32)> {
    let text = String::from_utf8_lossy(&b[..b.len().min(4096)]).into_owned();
    let start = text.to_ascii_lowercase().find("<svg")?;
    let tag = &text[start..text[start..].find('>').map_or(text.len(), |e| start + e)];
    let (w, h) = (svg_number(tag, "width"), svg_number(tag, "height"));
    if let (Some(w), Some(h)) = (w, h) {
        return Some((w.round() as u32, h.round() as u32));
    }
    let view = tag.find("viewBox=\"")? + 9;
    let end = tag[view..].find('"')?;
    let n: Vec<f64> = tag[view..view + end]
        .split([' ', ','])
        .filter_map(|v| v.parse().ok())
        .collect();
    (n.len() == 4).then(|| (n[2].round() as u32, n[3].round() as u32))
}

/// The width and height in pixels, read from the header, or None when it cannot be told.
pub fn dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let size = match sniff(bytes)? {
        Kind::Png => (be32(bytes, 16)?, be32(bytes, 20)?),
        Kind::Gif => (le16(bytes, 6)?, le16(bytes, 8)?),
        Kind::Jpeg => jpeg(bytes)?,
        Kind::Webp => webp(bytes)?,
        Kind::Svg => svg(bytes)?,
    };
    (size.0 > 0 && size.1 > 0).then_some(size)
}

/// Decodes standard base64, with or without padding and ignoring white space.
pub fn base64(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    let (mut bits, mut have) = (0u32, 0u32);
    for c in text.bytes() {
        let value = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            c if c.is_ascii_whitespace() => continue,
            _ => return None,
        };
        bits = bits << 6 | u32::from(value);
        have += 6;
        if have >= 8 {
            have -= 8;
            out.push((bits >> have) as u8);
            bits &= (1 << have) - 1;
        }
    }
    Some(out)
}

/// Writes bytes as standard base64 with padding.
pub fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, b)| n | u32::from(*b) << (16 - 8 * i));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ALPHABET[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    /// A PNG header of a picture `w` by `h`, which is all `dimensions` reads.
    pub fn png(w: u32, h: u32) -> Vec<u8> {
        let mut b = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        b.extend(w.to_be_bytes());
        b.extend(h.to_be_bytes());
        b.extend([8, 6, 0, 0, 0, 0, 0, 0, 0]);
        b
    }

    #[test]
    fn reads_the_size_of_each_kind_from_its_header() {
        assert_eq!(dimensions(&png(640, 480)), Some((640, 480)));
        let mut gif = b"GIF89a".to_vec();
        gif.extend([200, 0, 100, 0, 0, 0, 0]);
        assert_eq!(dimensions(&gif), Some((200, 100)));
        // A JPEG with a start of frame after a comment segment.
        let mut jpg = vec![
            0xFF, 0xD8, 0xFF, 0xFE, 0, 4, b'h', b'i', 0xFF, 0xC0, 0, 11, 8,
        ];
        jpg.extend([1, 0x2C, 2, 0x58, 3, 0, 0, 0, 0]);
        assert_eq!(dimensions(&jpg), Some((600, 300)));
        assert_eq!(
            dimensions(b"<svg xmlns='x' viewBox=\"0 0 120 60\"></svg>"),
            Some((120, 60))
        );
        assert_eq!(
            dimensions(b"<svg width=\"80\" height=\"40\"></svg>"),
            Some((80, 40))
        );
        assert_eq!(dimensions(b"not a picture"), None);
    }

    #[test]
    fn sniffs_the_kind_and_decodes_base64() {
        assert_eq!(sniff(&png(1, 1)), Some(Kind::Png));
        assert_eq!(sniff(b"plain text"), None);
        assert_eq!(base64("aGVsbG8="), Some(b"hello".to_vec()));
        assert_eq!(base64("aGVs\nbG8"), Some(b"hello".to_vec()));
        assert_eq!(base64("a$b"), None);
        for bytes in [
            &b""[..],
            b"a",
            b"ab",
            b"abc",
            b"abcd",
            &[0xFF, 0x00, 0x10, 0x80, 0x7F],
        ] {
            assert_eq!(base64(&base64_encode(bytes)).as_deref(), Some(bytes));
        }
    }
}
