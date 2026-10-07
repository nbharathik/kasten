use super::*;
use crate::import::testing::xml;

const MEDIUM_2_ACCENT_1: &str = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}";

fn name_of(node: Option<&Node>) -> String {
    node.map(|n| n.attr("val").unwrap_or("").to_owned())
        .unwrap_or_default()
}

fn header_body(node: Option<&Node>) -> String {
    node.and_then(|n| n.elements().next())
        .map(|c| name_of(Some(c)))
        .unwrap_or_default()
}

#[test]
fn the_default_style_of_a_new_table_paints_a_header_and_bands_in_the_accent() {
    let style = TableStyles::default()
        .get(MEDIUM_2_ACCENT_1)
        .unwrap_or_else(|| panic!("a built-in style"));
    let flags = Flags {
        first_row: true,
        band_row: true,
        ..Flags::default()
    };
    let at = |row, col| style.given((row, col), (4, 3), flags);
    // The header: the accent itself, in bold white.
    let head = at(0, 1);
    assert_eq!(header_body(head.fill), "accent1");
    assert!(head.bold);
    assert_eq!(name_of(head.color), "lt1");
    // The body alternates a darker and a lighter tint of it, in the ordinary type.
    let (one, two) = (at(1, 1), at(2, 1));
    let tint = |g: &Given| {
        g.fill
            .and_then(|f| f.elements().next())
            .and_then(|c| c.child("a:tint"))
            .and_then(|t| t.int("val"))
    };
    assert_eq!((tint(&one), tint(&two)), (Some(40_000), Some(20_000)));
    assert!(!one.bold && name_of(one.color) == "dk1");
    // The bands start after the header.
    assert_eq!(tint(&at(3, 0)), Some(40_000));
}

#[test]
fn the_first_and_last_columns_and_rows_are_heavy_only_when_the_table_says_so() {
    let style = TableStyles::default()
        .get(MEDIUM_2_ACCENT_1)
        .unwrap_or_else(|| panic!("a built-in style"));
    let plain = Flags::default();
    assert!(!style.given((0, 0), (3, 3), plain).bold);
    let all = Flags {
        first_row: true,
        last_row: true,
        first_col: true,
        last_col: true,
        ..Flags::default()
    };
    for corner in [(0, 0), (2, 2), (1, 0), (1, 2), (2, 1)] {
        assert!(style.given(corner, (3, 3), all).bold, "{corner:?}");
    }
    assert!(!style.given((1, 1), (3, 3), all).bold);
}

#[test]
fn a_file_that_defines_a_style_is_believed_over_the_built_in_one() {
    let doc = xml(&format!(
        r#"<a:tblStyleLst def="{MEDIUM_2_ACCENT_1}"><a:tblStyle styleId="{MEDIUM_2_ACCENT_1}" styleName="Mine"><a:wholeTbl><a:tcStyle><a:fill><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:fill></a:tcStyle></a:wholeTbl></a:tblStyle></a:tblStyleLst>"#
    ));
    let mut defined = HashMap::new();
    for s in doc.children_named("a:tblStyle") {
        defined.insert(
            s.attr("styleId").unwrap_or("").to_ascii_uppercase(),
            style_of(s),
        );
    }
    let styles = TableStyles { defined };
    let given = styles
        .get(MEDIUM_2_ACCENT_1.to_lowercase().as_str())
        .unwrap_or_else(|| panic!("a style"));
    assert_eq!(
        header_body(given.given((0, 0), (2, 2), Flags::default()).fill),
        "FF0000"
    );
    assert!(TableStyles::default().get("{NOT-A-STYLE}").is_none());
    // A table with no style of its own drawing: nothing given.
    let bare = TableStyles::default()
        .get("{2D5ABB26-0587-4C30-8999-92F81FD0307C}")
        .unwrap_or_else(|| panic!("a style"));
    assert!(
        bare.given(
            (0, 0),
            (2, 2),
            Flags {
                first_row: true,
                ..Flags::default()
            }
        )
        .fill
        .is_none()
    );
}
