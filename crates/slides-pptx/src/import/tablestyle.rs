//! Table styles: the fill and type a table gets from the style it names (`a:tableStyleId`), by
//! the part of the table a cell is in (the header row, the first column, the bands ...). A file
//! that uses a style carries its definition in `ppt/tableStyles.xml`; a file made by a program
//! that does not (python-pptx) names one PowerPoint knows, and the common ones are known here.

use std::collections::HashMap;

use super::dom::{self, Node};
use super::package::Package;

/// What a style says about one part of a table.
#[derive(Clone, Debug, Default)]
pub struct Part {
    /// The fill: an `a:solidFill` or an `a:noFill`.
    pub fill: Option<Node>,
    /// The element that holds the colour of the words.
    pub color: Option<Node>,
    pub bold: Option<bool>,
}

/// A style, part by part.
#[derive(Clone, Debug, Default)]
pub struct Style {
    pub whole: Part,
    pub band1h: Part,
    pub band2h: Part,
    pub band1v: Part,
    pub band2v: Part,
    pub last_col: Part,
    pub first_col: Part,
    pub last_row: Part,
    pub first_row: Part,
}

/// Which parts of a table are on, as `a:tblPr` sets them.
#[derive(Clone, Copy, Debug, Default)]
pub struct Flags {
    pub first_row: bool,
    pub last_row: bool,
    pub first_col: bool,
    pub last_col: bool,
    pub band_row: bool,
    pub band_col: bool,
}

impl Flags {
    pub fn of(tbl_pr: Option<&Node>) -> Flags {
        let on = |name: &str| tbl_pr.and_then(|p| p.flag(name)) == Some(true);
        Flags {
            first_row: on("firstRow"),
            last_row: on("lastRow"),
            first_col: on("firstCol"),
            last_col: on("lastCol"),
            band_row: on("bandRow"),
            band_col: on("bandCol"),
        }
    }
}

/// What a style gives one cell.
#[derive(Clone, Debug, Default)]
pub struct Given<'s> {
    /// The fill element, if any part sets one.
    pub fill: Option<&'s Node>,
    pub color: Option<&'s Node>,
    pub bold: bool,
}

impl Style {
    /// The style's word for a cell at `(row, col)` of a table of `size` (rows, columns): the parts it is in, the
    /// later ones over the earlier (the whole table, the bands, the last and first column, the last and first row).
    pub fn given(&self, at: (usize, usize), size: (usize, usize), flags: Flags) -> Given<'_> {
        let (row, col) = at;
        let mut parts = vec![&self.whole];
        if flags.band_row {
            let n = row.saturating_sub(usize::from(flags.first_row));
            parts.push(if n % 2 == 0 {
                &self.band1h
            } else {
                &self.band2h
            });
        }
        if flags.band_col {
            let n = col.saturating_sub(usize::from(flags.first_col));
            parts.push(if n % 2 == 0 {
                &self.band1v
            } else {
                &self.band2v
            });
        }
        if flags.last_col && col + 1 == size.1 {
            parts.push(&self.last_col);
        }
        if flags.first_col && col == 0 {
            parts.push(&self.first_col);
        }
        if flags.last_row && row + 1 == size.0 {
            parts.push(&self.last_row);
        }
        if flags.first_row && row == 0 {
            parts.push(&self.first_row);
        }
        let last = |pick: fn(&Part) -> Option<&Node>| parts.iter().rev().find_map(|p| pick(p));
        Given {
            fill: last(|p| p.fill.as_ref()),
            color: last(|p| p.color.as_ref()),
            bold: parts.iter().rev().find_map(|p| p.bold).unwrap_or(false),
        }
    }
}

fn part_of(node: Option<&Node>) -> Part {
    let Some(node) = node else {
        return Part::default();
    };
    let text = node.child("a:tcTxStyle");
    Part {
        fill: node
            .at(&["a:tcStyle", "a:fill"])
            .and_then(|f| f.elements().next())
            .filter(|f| matches!(f.name.as_str(), "a:solidFill" | "a:noFill"))
            .cloned(),
        // The colour sits in the style beside the font reference; the reference has one of its own that is not the words'.
        color: text
            .and_then(|t| {
                t.elements().find(|n| {
                    matches!(
                        n.name.as_str(),
                        "a:srgbClr"
                            | "a:schemeClr"
                            | "a:sysClr"
                            | "a:prstClr"
                            | "a:hslClr"
                            | "a:scrgbClr"
                    )
                })
            })
            .cloned(),
        bold: text.and_then(|t| match t.attr("b") {
            Some("on") => Some(true),
            Some("off") => Some(false),
            _ => None,
        }),
    }
}

fn style_of(node: &Node) -> Style {
    Style {
        whole: part_of(node.child("a:wholeTbl")),
        band1h: part_of(node.child("a:band1H")),
        band2h: part_of(node.child("a:band2H")),
        band1v: part_of(node.child("a:band1V")),
        band2v: part_of(node.child("a:band2V")),
        last_col: part_of(node.child("a:lastCol")),
        first_col: part_of(node.child("a:firstCol")),
        last_row: part_of(node.child("a:lastRow")),
        first_row: part_of(node.child("a:firstRow")),
    }
}

/// Medium Style 2, which PowerPoint gives a new table: the header and the bands in one accent.
fn medium_2(accent: &str) -> Style {
    let fill = |tint: Option<u32>| match tint {
        Some(t) => format!(
            r#"<a:tcStyle><a:fill><a:solidFill><a:schemeClr val="{accent}"><a:tint val="{t}"/></a:schemeClr></a:solidFill></a:fill></a:tcStyle>"#
        ),
        None => format!(
            r#"<a:tcStyle><a:fill><a:solidFill><a:schemeClr val="{accent}"/></a:solidFill></a:fill></a:tcStyle>"#
        ),
    };
    let heavy = |name: &str| {
        format!(
            r#"<a:{name}><a:tcTxStyle b="on"><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="lt1"/></a:tcTxStyle>{}</a:{name}>"#,
            fill(None)
        )
    };
    let xml = format!(
        r#"<a:tblStyle xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:wholeTbl><a:tcTxStyle><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="dk1"/></a:tcTxStyle>{}</a:wholeTbl><a:band1H>{}</a:band1H><a:band1V>{}</a:band1V>{}{}{}{}</a:tblStyle>"#,
        fill(Some(20_000)),
        fill(Some(40_000)),
        fill(Some(40_000)),
        heavy("lastCol"),
        heavy("firstCol"),
        heavy("lastRow"),
        heavy("firstRow"),
    );
    dom::parse(xml.as_bytes())
        .map(|d| style_of(&d.root))
        .unwrap_or_default()
}

/// The styles PowerPoint has built in that are known here.
fn built_in(id: &str) -> Option<Style> {
    let accent = match id.to_ascii_uppercase().as_str() {
        "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}" => "accent1",
        "{21E4AEA4-8DFA-4A89-87EB-49C32662AFE0}" => "accent2",
        "{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}" => "accent3",
        "{00A15C55-8517-42AA-B614-E9B94910E393}" => "accent4",
        "{7DF18680-E054-41AD-8BC1-D1AEF772440D}" => "accent5",
        "{93296810-A885-4BE3-A3E7-6D5BEEA58F35}" => "accent6",
        "{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}" => "dk1",
        // No Style, No Grid; No Style, Table Grid: a table with nothing drawn by its style.
        "{2D5ABB26-0587-4C30-8999-92F81FD0307C}" | "{5940675A-B579-460E-94D1-54222C63F5DA}" => {
            return Some(Style::default());
        }
        _ => return None,
    };
    Some(medium_2(accent))
}

/// The styles a file defines.
#[derive(Clone, Debug, Default)]
pub struct TableStyles {
    defined: HashMap<String, Style>,
}

impl TableStyles {
    /// Reads `ppt/tableStyles.xml`; a file without it defines none.
    pub fn read(pkg: &mut Package) -> TableStyles {
        let Ok(doc) = pkg.dom("ppt/tableStyles.xml") else {
            return TableStyles::default();
        };
        let defined = doc
            .root
            .children_named("a:tblStyle")
            .filter_map(|s| Some((s.attr("styleId")?.to_ascii_uppercase(), style_of(s))))
            .collect();
        TableStyles { defined }
    }

    /// The style called `id`: the file's own definition, else the one PowerPoint has built in.
    pub fn get(&self, id: &str) -> Option<Style> {
        let id = id.trim();
        self.defined
            .get(&id.to_ascii_uppercase())
            .cloned()
            .or_else(|| built_in(id))
    }
}

#[cfg(test)]
mod tests;
