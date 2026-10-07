//! Thumbnails: a picture shrunk to fit a square of 256 or 1024 pixels and
//! written as WebP, for a gallery or a filmstrip to show instead of the
//! original. Only the two sizes are made, so a cache of them stays small.
//! The original is never touched, and an export always uses it.

use std::io::Cursor;

use image::imageops::FilterType;
use image::{DynamicImage, ExtendedColorType, ImageDecoder, ImageReader};

use crate::probe::{self, Kind};

/// The sizes a thumbnail comes in: the longer side, in pixels.
pub const SIZES: [u32; 2] = [256, 1024];

/// The most memory decoding a picture may use: a picture that needs more is
/// not shrunk.
const MAX_DECODE_BYTES: u64 = 512 * 1024 * 1024;

/// The picture in `bytes` shrunk so that neither side is over `size` (a
/// picture already smaller is kept at its size), as a WebP file. None when
/// the picture has no raster form to shrink (a vector picture, a format
/// this build cannot decode) or cannot be decoded.
pub fn thumbnail(bytes: &[u8], size: u32) -> Option<Vec<u8>> {
    if !probe::sniff(bytes).is_some_and(Kind::is_raster) {
        return None;
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().ok()?;
    let turned = decoder.orientation().ok();
    let mut picture = DynamicImage::from_decoder(decoder).ok()?;
    if let Some(turned) = turned {
        picture.apply_orientation(turned);
    }
    if picture.width() > size || picture.height() > size {
        picture = picture.resize(size, size, FilterType::Lanczos3);
    }
    let (w, h) = (picture.width(), picture.height());
    let mut out = Vec::new();
    let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut out);
    if picture.color().has_alpha() {
        encoder
            .encode(picture.to_rgba8().as_raw(), w, h, ExtendedColorType::Rgba8)
            .ok()?;
    } else {
        encoder
            .encode(picture.to_rgb8().as_raw(), w, h, ExtendedColorType::Rgb8)
            .ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(w: u32, h: u32, alpha: bool) -> Vec<u8> {
        let mut out = Vec::new();
        let picture: DynamicImage = if alpha {
            DynamicImage::ImageRgba8(image::RgbaImage::from_fn(w, h, |x, y| {
                image::Rgba([(x % 256) as u8, (y % 256) as u8, 90, 200])
            }))
        } else {
            DynamicImage::ImageRgb8(image::RgbImage::from_fn(w, h, |x, y| {
                image::Rgb([(x % 256) as u8, (y % 256) as u8, 90])
            }))
        };
        picture
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn shrinks_to_fit_and_keeps_the_shape() {
        let thumb = thumbnail(&png(2000, 500, false), 256).unwrap();
        assert_eq!(probe::dimensions(&thumb), Some((256, 64)));
        let tall = thumbnail(&png(300, 900, false), 1024).unwrap();
        assert_eq!(probe::dimensions(&tall), Some((300, 900)), "never enlarged");
        let tall = thumbnail(&png(300, 900, false), 256).unwrap();
        assert_eq!(probe::dimensions(&tall), Some((85, 256)));
    }

    #[test]
    fn a_thumbnail_is_a_lossless_webp_that_decodes_to_the_same_pixels() {
        let original = png(40, 30, true);
        let thumb = thumbnail(&original, 256).unwrap();
        assert_eq!(&thumb[..4], b"RIFF");
        assert_eq!(&thumb[8..16], b"WEBPVP8L");
        let back = image::load_from_memory_with_format(&thumb, image::ImageFormat::WebP).unwrap();
        let first =
            image::load_from_memory_with_format(&original, image::ImageFormat::Png).unwrap();
        assert_eq!(back.to_rgba8().as_raw(), first.to_rgba8().as_raw());
    }

    #[test]
    fn what_cannot_be_shrunk_has_no_thumbnail() {
        assert_eq!(thumbnail(b"<svg width=\"10\" height=\"10\"/>", 256), None);
        assert_eq!(thumbnail(b"", 256), None);
        assert_eq!(thumbnail(b"\x89PNG\r\n\x1a\nbroken", 256), None);
        assert_eq!(thumbnail(&png(10, 10, false)[..40], 256), None);
    }
}
