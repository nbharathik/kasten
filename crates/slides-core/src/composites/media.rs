//! What embed and video share: a picture that fills the box, and the address
//! and words that go on every part of a composite that points somewhere.

use super::build::StyleExt;
use super::measure::columns;
use crate::model::{Element, Mask, Style};

/// The corner radius of a picture or panel of a web page or video.
pub const RADIUS: f64 = 12.0;

/// The size, in points, below which the words on a slide are too small to read from a room.
/// The words on the panel of a page or a video are set at least this big wherever it has room.
pub const READABLE: f64 = 14.0;

/// The address if it is a web address (`http` or `https`); a link on a slide must not run
/// a script or read a file, so anything else is not one.
pub fn web_address(text: &str) -> Option<&str> {
    let text = text.trim();
    let lower = text.to_ascii_lowercase();
    (lower.starts_with("http://") || lower.starts_with("https://")).then_some(text)
}

/// The host of a web address, without a user name, a `www.` in front, or a path: what a
/// person calls the site. An address that is none is returned as it is.
pub fn host_of(address: &str) -> String {
    let text = address.trim();
    let after_scheme = text.split_once("://").map_or(text, |(_, rest)| rest);
    let authority = after_scheme.split(['/', '?', '#']).next().unwrap_or("");
    let host = authority.rsplit('@').next().unwrap_or("");
    let host = host.strip_prefix("www.").unwrap_or(host);
    if host.is_empty() {
        text.to_owned()
    } else {
        host.to_owned()
    }
}

/// `text` cut in the middle to at most `cols` columns, with an ellipsis where it was cut.
pub fn middle(text: &str, cols: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if columns(text) <= cols || cols < 3 {
        return text.to_owned();
    }
    let keep = cols - 1;
    let head = keep * 6 / 10;
    let tail = keep - head;
    let start: String = chars.iter().take(head).collect();
    let end: String = chars[chars.len().saturating_sub(tail)..].iter().collect();
    format!("{start}\u{2026}{end}")
}

/// The still of a page or a video, drawn in its box: with rounded corners, as the style and
/// mask of an image say, and filling the box without being stretched. Only whoever draws it
/// knows how big the still is, so the picture says it covers its box and the renderer or the
/// exporter cuts it to the shape of the box (`object-fit: cover`, `a:srcRect`).
pub fn still(element: &mut Element) {
    if let Element::Image(image) = element {
        image.mask = Some(Mask::RoundRect);
        image.base.style = Some(Style::default().radius(RADIUS));
        image.cover();
    }
}

/// The parts with the link on each, so clicking anywhere on the composite follows it, and
/// the words a person who cannot see it is told on the first.
pub fn addressed(mut parts: Vec<Element>, link: Option<&str>, alt: &str) -> Vec<Element> {
    for part in &mut parts {
        part.base_mut().link = link.map(str::to_owned);
    }
    if let Some(first) = parts.first_mut() {
        first.base_mut().alt = Some(alt.to_owned());
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_still_is_rounded_and_covers_its_box() {
        let mut picture = Element::Image(crate::model::ImageEl {
            base: crate::model::Base::new("e-1.1"),
            src: "assets/still.png".to_owned(),
            crop: None,
            mask: None,
            extra: crate::model::Extra::new(),
        });
        still(&mut picture);
        let Element::Image(picture) = &picture else {
            panic!("a picture")
        };
        assert_eq!(picture.mask, Some(Mask::RoundRect));
        assert_eq!(
            picture.base.style.as_ref().and_then(|s| s.radius),
            Some(RADIUS)
        );
        assert!(picture.covers());
        // Anything but a picture is left as it is.
        let mut text = Element::text_el(
            crate::model::Base::new("e-1.2"),
            crate::model::Text::plain("words"),
        );
        let before = text.clone();
        still(&mut text);
        assert_eq!(text, before);
    }

    #[test]
    fn only_web_addresses_are_links() {
        assert_eq!(
            web_address(" https://example.com/a "),
            Some("https://example.com/a")
        );
        assert_eq!(
            web_address("HTTP://example.com"),
            Some("HTTP://example.com")
        );
        for bad in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,x",
            "assets/clip.mp4",
            "example.com",
            "",
        ] {
            assert_eq!(web_address(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_long_text_is_cut_in_the_middle_to_the_columns_there_are() {
        assert_eq!(
            middle("abcdefghijklmnopqrstuvwxyz", 11),
            "abcdef\u{2026}wxyz"
        );
        assert_eq!(middle("short", 20), "short");
        assert_eq!(middle("anything", 2), "anything", "too narrow to cut");
    }

    #[test]
    fn the_host_is_what_a_person_calls_the_site() {
        assert_eq!(host_of("https://www.example.com/a/b?c=d#e"), "example.com");
        assert_eq!(
            host_of("http://user:secret@localhost:3000/app"),
            "localhost:3000"
        );
        assert_eq!(host_of("example.org"), "example.org");
        assert_eq!(host_of("https://sub.example.co.uk"), "sub.example.co.uk");
        assert_eq!(host_of("https://"), "https://");
        assert_eq!(host_of(""), "");
    }
}
