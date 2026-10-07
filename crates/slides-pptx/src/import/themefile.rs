//! A theme part (`ppt/theme/theme1.xml`): the colour scheme, the two fonts
//! and the format scheme that shapes refer to (`fillRef idx="2"` means the
//! second fill of the scheme).

use super::color::Palette;
use super::dom::{Doc, Node};

/// The theme's fill, line and effect styles and its background fills, as XML to be read when a shape names one.
#[derive(Clone, Debug, Default)]
pub struct FormatScheme {
    pub fills: Vec<Node>,
    pub lines: Vec<Node>,
    pub effects: Vec<Node>,
    pub backgrounds: Vec<Node>,
}

#[derive(Clone, Debug)]
pub struct ThemeFile {
    pub name: String,
    pub palette: Palette,
    /// The typeface of headings (`+mj-lt`).
    pub heading: String,
    /// The typeface of body text (`+mn-lt`).
    pub body: String,
    pub format: FormatScheme,
}

impl Default for ThemeFile {
    fn default() -> ThemeFile {
        ThemeFile {
            name: "Imported".to_owned(),
            palette: Palette::default(),
            heading: "Calibri".to_owned(),
            body: "Calibri".to_owned(),
            format: FormatScheme::default(),
        }
    }
}

fn typeface(font: Option<&Node>, fallback: &str) -> String {
    font.and_then(|f| f.child("a:latin"))
        .and_then(|l| l.attr("typeface"))
        .map(str::trim)
        .filter(|t| !t.is_empty() && !t.starts_with('+'))
        .unwrap_or(fallback)
        .to_owned()
}

fn list(parent: Option<&Node>, name: &str) -> Vec<Node> {
    parent
        .and_then(|p| p.child(name))
        .map(|l| l.elements().cloned().collect())
        .unwrap_or_default()
}

pub fn read(doc: &Doc) -> ThemeFile {
    let root = &doc.root;
    let elements = root.child("a:themeElements");
    let palette = elements
        .and_then(|e| e.child("a:clrScheme"))
        .map(Palette::from_scheme)
        .unwrap_or_default();
    let fonts = elements.and_then(|e| e.child("a:fontScheme"));
    let format = elements.and_then(|e| e.child("a:fmtScheme"));
    ThemeFile {
        name: root.attr("name").unwrap_or("Imported").to_owned(),
        palette,
        heading: typeface(fonts.and_then(|f| f.child("a:majorFont")), "Calibri"),
        body: typeface(fonts.and_then(|f| f.child("a:minorFont")), "Calibri"),
        format: FormatScheme {
            fills: list(format, "a:fillStyleLst"),
            lines: list(format, "a:lnStyleLst"),
            effects: list(format, "a:effectStyleLst"),
            backgrounds: list(format, "a:bgFillStyleLst"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::dom;

    #[test]
    fn colours_fonts_and_format_styles_are_read() {
        let doc = dom::parse(
            br#"<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements>
            <a:clrScheme name="x"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
            <a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1></a:clrScheme>
            <a:fontScheme name="x"><a:majorFont><a:latin typeface="Cambria"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>
            <a:fmtScheme name="x"><a:fillStyleLst><a:solidFill/><a:gradFill/></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"/></a:lnStyleLst><a:effectStyleLst><a:effectStyle/></a:effectStyleLst><a:bgFillStyleLst><a:solidFill/></a:bgFillStyleLst></a:fmtScheme>
            </a:themeElements></a:theme>"#,
        )
        .unwrap_or_else(|e| panic!("{e}"));
        let t = read(&doc);
        assert_eq!(
            (t.name.as_str(), t.heading.as_str(), t.body.as_str()),
            ("Office Theme", "Cambria", "Calibri")
        );
        assert_eq!(
            t.palette.get("accent1"),
            crate::import::color::Rgb(0x4f, 0x81, 0xbd)
        );
        assert_eq!(
            t.palette.get("dk2"),
            crate::import::color::Rgb(0x1f, 0x49, 0x7d)
        );
        assert_eq!(t.format.fills.len(), 2);
        assert_eq!(t.format.lines.len(), 1);
        assert_eq!(t.format.backgrounds.len(), 1);
    }

    #[test]
    fn a_theme_with_nothing_in_it_still_has_colours_and_fonts() {
        let doc = dom::parse(
            br#"<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>"#,
        )
        .unwrap_or_else(|e| panic!("{e}"));
        let t = read(&doc);
        assert_eq!(t.heading, "Calibri");
        assert_eq!(
            t.palette.get("lt1"),
            crate::import::color::Rgb(255, 255, 255)
        );
    }
}
