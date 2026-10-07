//! How a picture is fitted to its box.
//!
//! A picture is stretched to fill its box, unless it has a `crop`. One that has to keep its
//! shape while its box has another (the poster of an embedded page or a video: the box is
//! the page's or the video's, the still is whatever was made) says `fit: "cover"`. It then
//! fills the box without being stretched, and what does not fit is cut at the sides or at
//! the top and bottom, as `object-fit: cover` does in a browser and `a:srcRect` does in
//! PowerPoint. A `crop` of its own comes first. The mark is a field the model does not
//! list, so it is kept by builds that do not know it.

use serde_json::Value;

use super::ImageEl;

impl ImageEl {
    /// The field that says how the picture is fitted to its box.
    pub const FIT: &'static str = "fit";
    /// The value of [`FIT`](Self::FIT) for a picture that fills its box without being stretched.
    pub const COVER: &'static str = "cover";

    /// Whether the picture fills its box without being stretched, cut to the shape of the box.
    pub fn covers(&self) -> bool {
        self.extra.get(Self::FIT).and_then(Value::as_str) == Some(Self::COVER)
    }

    /// Makes the picture fill its box without being stretched.
    pub fn cover(&mut self) {
        self.extra
            .insert(Self::FIT.to_owned(), Value::String(Self::COVER.to_owned()));
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::model::{Base, Element, Extra};

    fn image() -> ImageEl {
        ImageEl {
            base: Base::new("i-1"),
            src: "assets/a.png".to_owned(),
            crop: None,
            mask: None,
            extra: Extra::new(),
        }
    }

    #[test]
    fn a_picture_is_stretched_until_it_is_made_to_cover_its_box() {
        let mut picture = image();
        assert!(!picture.covers());
        picture.cover();
        assert!(picture.covers());
        assert_eq!(picture.extra.get("fit"), Some(&json!("cover")));
    }

    #[test]
    fn only_the_value_cover_covers() {
        for other in [
            json!("contain"),
            json!("Cover"),
            json!(1),
            json!(true),
            Value::Null,
        ] {
            let mut picture = image();
            picture.extra.insert("fit".to_owned(), other.clone());
            assert!(!picture.covers(), "{other}");
        }
    }

    #[test]
    fn the_mark_is_kept_when_a_file_is_read_and_written_again() {
        let text = r#"{"type":"image","id":"i-1","src":"a.png","fit":"cover"}"#;
        let element: Element = serde_json::from_str(text).unwrap();
        let Element::Image(picture) = &element else {
            panic!("a picture")
        };
        assert!(picture.covers());
        assert_eq!(serde_json::to_value(&element).unwrap()["fit"], "cover");
    }
}
