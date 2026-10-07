use super::*;

fn png(w: u32, h: u32) -> Vec<u8> {
    let mut b = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
    b.extend(w.to_be_bytes());
    b.extend(h.to_be_bytes());
    b.extend([8, 6, 0, 0, 0, 0, 0, 0, 0]);
    b
}

/// A JPEG with a comment, an optional Exif block, and a frame `w` by `h`.
fn jpeg_of(w: u16, h: u16, orientation: Option<u16>) -> Vec<u8> {
    let mut b = vec![0xFF, 0xD8, 0xFF, 0xFE, 0, 4, b'h', b'i'];
    if let Some(turn) = orientation {
        let mut exif = b"Exif\0\0MM\0\x2a\0\0\0\x08\0\x01\x01\x12\0\x03\0\0\0\x01".to_vec();
        exif.extend(turn.to_be_bytes());
        exif.extend([0, 0, 0, 0, 0, 0]);
        b.extend([0xFF, 0xE1]);
        b.extend(((exif.len() + 2) as u16).to_be_bytes());
        b.extend(exif);
    }
    b.extend([0xFF, 0xC0, 0, 11, 8]);
    b.extend(h.to_be_bytes());
    b.extend(w.to_be_bytes());
    b.extend([3, 0, 0, 0, 0]);
    b
}

#[test]
fn reads_the_size_of_each_kind_from_its_header() {
    assert_eq!(dimensions(&png(640, 480)), Some((640, 480)));
    let mut gif = b"GIF89a".to_vec();
    gif.extend([200, 0, 100, 0, 0, 0, 0]);
    assert_eq!(dimensions(&gif), Some((200, 100)));
    assert_eq!(dimensions(&jpeg_of(600, 300, None)), Some((600, 300)));
    // A frame header after a comment and tables, not a table's bytes.
    let mut tables = vec![0xFF, 0xD8, 0xFF, 0xC4, 0, 6, 0, 0, 0, 0];
    tables.extend([0xFF, 0xC2, 0, 11, 8, 0, 20, 0, 30, 3, 0, 0, 0, 0]);
    assert_eq!(dimensions(&tables), Some((30, 20)));
    assert_eq!(
        dimensions(b"<svg width=\"80\" height=\"40\"></svg>"),
        Some((80, 40))
    );
}

#[test]
fn a_jpeg_turned_by_its_exif_is_measured_as_it_is_shown() {
    assert_eq!(dimensions(&jpeg_of(600, 300, Some(1))), Some((600, 300)));
    assert_eq!(dimensions(&jpeg_of(600, 300, Some(6))), Some((300, 600)));
    assert_eq!(dimensions(&jpeg_of(600, 300, Some(8))), Some((300, 600)));
    assert_eq!(dimensions(&jpeg_of(600, 300, Some(3))), Some((600, 300)));
}

#[test]
fn webp_in_its_three_forms() {
    let mut lossless = b"RIFF\0\0\0\0WEBPVP8L\0\0\0\0\x2f".to_vec();
    // 48 by 32: the sizes less one, 14 bits each.
    let bits: u32 = 47 | (31 << 14);
    lossless.extend(bits.to_le_bytes());
    assert_eq!(dimensions(&lossless), Some((48, 32)));
    let mut lossy = b"RIFF\0\0\0\0WEBPVP8 \0\0\0\0\0\0\0\x9d\x01\x2a".to_vec();
    lossy.extend(100u16.to_le_bytes());
    lossy.extend(50u16.to_le_bytes());
    assert_eq!(dimensions(&lossy), Some((100, 50)));
    let mut extended = b"RIFF\0\0\0\0WEBPVP8X\0\0\0\0\0\0\0\0".to_vec();
    extended.extend([0x0F, 0x01, 0x00, 0xC7, 0x00, 0x00]);
    assert_eq!(dimensions(&extended), Some((272, 200)));
}

#[test]
fn avif_and_bmp() {
    let mut avif = b"\0\0\0\x1cftypavif\0\0\0\0avifmif1".to_vec();
    avif.extend(b"\0\0\0\x14ispe\0\0\0\0");
    avif.extend(1920u32.to_be_bytes());
    avif.extend(1080u32.to_be_bytes());
    assert_eq!(dimensions(&avif), Some((1920, 1080)));
    let mut bmp = b"BM\0\0\0\0\0\0\0\0\0\0\0\0\x28\0\0\0".to_vec();
    bmp.extend(64i32.to_le_bytes());
    bmp.extend((-48i32).to_le_bytes());
    bmp.extend([1, 0, 24, 0]);
    assert_eq!(dimensions(&bmp), Some((64, 48)));
}

#[test]
fn svg_sizes_from_width_and_height_units_or_the_view_box() {
    let size = |text: &str| dimensions(text.as_bytes());
    assert_eq!(
        size("<svg xmlns='x' viewBox=\"0 0 120 60\"></svg>"),
        Some((120, 60))
    );
    assert_eq!(size("<svg viewBox='0,0,200.5,100'/>"), Some((201, 100)));
    assert_eq!(size("<svg width=\"2in\" height=\"1in\"/>"), Some((192, 96)));
    assert_eq!(size("<svg width=\"10pt\" height=\"5pt\"/>"), Some((13, 7)));
    // A percentage says nothing: the view box does.
    assert_eq!(
        size("<svg width=\"100%\" height=\"100%\" viewBox=\"0 0 30 20\"/>"),
        Some((30, 20))
    );
    // One side and the view box give the other by the shape.
    assert_eq!(
        size("<svg width=\"300\" viewBox=\"0 0 30 20\"/>"),
        Some((300, 200))
    );
    assert_eq!(
        size("<?xml version=\"1.0\"?>\n<!-- c -->\n<svg\n  width=\"9\"\n  height=\"3\">"),
        Some((9, 3))
    );
    assert_eq!(size("<svg data-width=\"9\" height=\"3\"/>"), None);
    assert_eq!(size("<svg width=\"100%\"/>"), None);
    assert_eq!(size("<svg></svg>"), None);
}

#[test]
fn what_is_not_a_picture_or_is_cut_short_has_no_size() {
    assert_eq!(dimensions(b"not a picture"), None);
    assert_eq!(dimensions(b""), None);
    assert_eq!(dimensions(&png(640, 480)[..20]), None);
    assert_eq!(dimensions(&png(0, 5)), None);
    assert_eq!(dimensions(&png(u32::MAX, 5)), None);
    // The signature of a PNG and something else where the header goes.
    assert_eq!(dimensions(b"\x89PNG\r\n\x1a\nfake image bytes"), None);
    assert_eq!(dimensions(&jpeg_of(600, 300, None)[..14]), None);
}

#[test]
fn kinds_names_and_types() {
    assert_eq!(sniff(&png(1, 1)), Some(Kind::Png));
    assert_eq!(sniff(b"plain text"), None);
    assert!(Kind::Jpeg.is_raster() && !Kind::Svg.is_raster() && !Kind::Avif.is_raster());
    assert!(
        is_picture_name("Logo.SVG") && is_picture_name("a.jpeg") && is_picture_name("x/y.webp")
    );
    assert!(!is_picture_name("notes.txt") && !is_picture_name("png") && !is_picture_name(".png"));
    assert_eq!(mime_of("a.b.PNG"), "image/png");
    assert_eq!(mime_of("noext"), "application/octet-stream");
}
