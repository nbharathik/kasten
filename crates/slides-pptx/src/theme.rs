//! The theme part: the deck's colours and fonts under the names PowerPoint
//! gives them, so recolouring the theme in PowerPoint recolours the deck.

use slides_core::Theme;

use crate::color::Color;
use crate::fonts::write_theme_font;
use crate::package::Package;
use crate::xml::{NS_A, Xml};

/// The colour of a theme slot as six hex digits; black for one that is not a colour.
fn hex(value: &str) -> String {
    match Color::parse(value) {
        Some(Color::Rgb(hex)) => hex,
        _ => "000000".to_owned(),
    }
}

fn slot(x: &mut Xml, tag: &str, value: &str) {
    x.open(tag);
    x.open("a:srgbClr").attr("val", &hex(value)).close();
    x.close();
}

/// The formats a shape can pick from the theme. The deck styles every shape itself,
/// so these are the plain ones PowerPoint offers for new shapes: flat colour, thin lines, no effects.
fn format_scheme(x: &mut Xml) {
    let fill = |x: &mut Xml, modifier: Option<(&str, i64)>| {
        x.open("a:solidFill");
        x.open("a:schemeClr").attr("val", "phClr");
        if let Some((name, value)) = modifier {
            x.open(name).int("val", value).close();
        }
        x.close();
        x.close();
    };
    x.open("a:fmtScheme").attr("name", "Kasten");
    x.open("a:fillStyleLst");
    fill(x, None);
    fill(x, Some(("a:tint", 80_000)));
    fill(x, Some(("a:shade", 90_000)));
    x.close();
    x.open("a:lnStyleLst");
    for width in [6350, 12700, 19050] {
        x.open("a:ln")
            .int("w", width)
            .attr("cap", "flat")
            .attr("cmpd", "sng")
            .attr("algn", "ctr");
        fill(x, None);
        x.open("a:prstDash").attr("val", "solid").close();
        x.open("a:miter").int("lim", 800_000).close();
        x.close();
    }
    x.close();
    x.open("a:effectStyleLst");
    for _ in 0..3 {
        x.open("a:effectStyle");
        x.open("a:effectLst").close();
        x.close();
    }
    x.close();
    x.open("a:bgFillStyleLst");
    fill(x, None);
    fill(x, Some(("a:tint", 95_000)));
    fill(x, Some(("a:shade", 95_000)));
    x.close();
    x.close();
}

/// A theme part named `name`.
pub fn part(theme: &Theme, name: &str) -> Vec<u8> {
    let c = &theme.colors;
    let mut x = Xml::document();
    x.open("a:theme").attr("xmlns:a", NS_A).attr("name", name);
    x.open("a:themeElements");
    x.open("a:clrScheme").attr("name", name);
    slot(&mut x, "a:dk1", &c.text1);
    slot(&mut x, "a:lt1", &c.bg1);
    slot(&mut x, "a:dk2", &c.text2);
    slot(&mut x, "a:lt2", &c.bg2);
    slot(&mut x, "a:accent1", &c.accent1);
    slot(&mut x, "a:accent2", &c.accent2);
    slot(&mut x, "a:accent3", &c.accent3);
    slot(&mut x, "a:accent4", &c.accent4);
    slot(&mut x, "a:accent5", &c.accent5);
    slot(&mut x, "a:accent6", &c.accent6);
    slot(&mut x, "a:hlink", &c.accent1);
    slot(&mut x, "a:folHlink", &c.accent1);
    x.close();
    x.open("a:fontScheme").attr("name", name);
    write_theme_font(&mut x, "a:majorFont", &theme.fonts.heading);
    write_theme_font(&mut x, "a:minorFont", &theme.fonts.body);
    x.close();
    format_scheme(&mut x);
    x.close();
    x.open("a:objectDefaults").close();
    x.open("a:extraClrSchemeLst").close();
    x.close();
    x.finish()
}

/// Adds the theme part to the package.
pub fn add(package: &mut Package, theme: &Theme, file: &str, name: &str) {
    package.add(
        &format!("ppt/theme/{file}"),
        crate::package::CT_THEME,
        part(theme, name),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(theme: &Theme) -> String {
        String::from_utf8(part(theme, "Light")).unwrap_or_default()
    }

    #[test]
    fn the_colour_scheme_maps_text_and_background_to_dark_and_light_and_links_to_accent_one() {
        let theme = slides_core::themes::light();
        let out = text(&theme);
        assert!(
            out.contains(concat!(
                r#"<a:clrScheme name="Light"><a:dk1><a:srgbClr val="202124"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>"#,
                r#"<a:dk2><a:srgbClr val="5F6368"/></a:dk2><a:lt2><a:srgbClr val="F1F3F4"/></a:lt2>"#,
                r#"<a:accent1><a:srgbClr val="1A73E8"/></a:accent1><a:accent2><a:srgbClr val="EA4335"/></a:accent2>"#
            )),
            "{out}"
        );
        assert!(
            out.contains(r#"<a:accent6><a:srgbClr val="46BDC6"/></a:accent6><a:hlink><a:srgbClr val="1A73E8"/></a:hlink><a:folHlink><a:srgbClr val="1A73E8"/></a:folHlink></a:clrScheme>"#),
            "{out}"
        );
    }

    #[test]
    fn the_dark_theme_keeps_its_own_direction() {
        let out = text(&slides_core::themes::dark());
        assert!(out.contains(r#"<a:dk1><a:srgbClr val="F1F3F4"/></a:dk1><a:lt1><a:srgbClr val="0F1115"/></a:lt1>"#), "{out}");
    }

    #[test]
    fn the_font_scheme_is_the_first_family_of_the_heading_and_the_body() {
        let out = text(&slides_core::themes::serif());
        assert!(
            out.contains(r#"<a:majorFont><a:latin typeface="Cambria""#),
            "{out}"
        );
        assert!(
            out.contains(r#"<a:minorFont><a:latin typeface="Calibri""#),
            "{out}"
        );
    }

    #[test]
    fn the_format_scheme_has_the_three_of_each_the_schema_asks_for() {
        let out = text(&slides_core::themes::light());
        assert_eq!(out.matches("<a:ln ").count(), 3);
        assert_eq!(out.matches("<a:effectStyle>").count(), 3);
        assert!(
            out.ends_with("</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>"),
            "{out}"
        );
    }
}
