//! A picture of an object the import kept as it was (a chart, a diagram ...), cut from a picture
//! of its slide. A program that can draw the file (LibreOffice) draws each slide; this cuts out
//! the box of the object, so the deck can show what the object looked like.

use std::io::Cursor;

use image::{ImageFormat, ImageReader};

use super::media::{MediaFile, named};

/// The part of `page` inside the box `(x, y, w, h)` of the slide, as a picture to keep. `page` is a
/// PNG of the whole slide drawn at `scale` pixels to a slide unit. None when the box is not on the
/// page or the page cannot be read.
pub fn crop_preview(
    page: &[u8],
    (x, y, w, h): (f64, f64, f64, f64),
    scale: f64,
) -> Option<MediaFile> {
    let image = ImageReader::with_format(Cursor::new(page), ImageFormat::Png)
        .decode()
        .ok()?;
    let (width, height) = (f64::from(image.width()), f64::from(image.height()));
    let edge = |v: f64, most: f64| (v * scale).round().clamp(0.0, most);
    let (left, top) = (edge(x, width), edge(y, height));
    let (right, bottom) = (edge(x + w, width), edge(y + h, height));
    if right - left < 2.0 || bottom - top < 2.0 {
        return None;
    }
    let cut = image.crop_imm(
        left as u32,
        top as u32,
        (right - left) as u32,
        (bottom - top) as u32,
    );
    let mut bytes = Vec::new();
    cut.write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .ok()?;
    Some(MediaFile {
        path: named("preview", &bytes, "png"),
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::samples;

    fn page() -> Vec<u8> {
        samples::png(400, 200, |x, y| [(x / 2) as u8, y as u8, 90])
    }

    #[test]
    fn the_box_is_cut_out_at_the_scale_the_page_was_drawn_at() {
        let found = crop_preview(&page(), (10.0, 10.0, 50.0, 20.0), 2.0)
            .unwrap_or_else(|| panic!("a picture"));
        let cut = image::load_from_memory(&found.bytes).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!((cut.width(), cut.height()), (100, 40));
        assert!(
            found.path.starts_with("assets/preview-") && found.path.ends_with(".png"),
            "{}",
            found.path
        );
        // The same box gives the same file.
        assert_eq!(
            crop_preview(&page(), (10.0, 10.0, 50.0, 20.0), 2.0),
            Some(found)
        );
    }

    #[test]
    fn a_box_off_the_page_or_a_page_that_is_not_a_picture_gives_nothing() {
        assert!(crop_preview(&page(), (500.0, 10.0, 50.0, 20.0), 2.0).is_none());
        assert!(crop_preview(&page(), (10.0, 10.0, 0.5, 20.0), 2.0).is_none());
        assert!(crop_preview(b"not a picture", (0.0, 0.0, 10.0, 10.0), 1.0).is_none());
        // A box partly off the page is cut at its edge.
        let edge = crop_preview(&page(), (190.0, 90.0, 50.0, 50.0), 2.0)
            .unwrap_or_else(|| panic!("a picture"));
        let cut = image::load_from_memory(&edge.bytes).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!((cut.width(), cut.height()), (20, 20));
    }
}
