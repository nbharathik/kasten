//! Slide masters and layouts as they are read: the placeholders they
//! define, the text styles they carry and the shapes they draw on every
//! slide. Nothing here becomes the deck's theme yet; `theme.rs` does that.

use slides_core::resolve::Rect;

use super::color::{ColorCx, ColorMap};
use super::dom::Node;
use super::package::{Package, Rels};
use super::text::body::BodyProps;
use super::text::levels::{FontNames, Levels, Reader, list_style};
use super::themefile::ThemeFile;
use super::units::{length, position, snapped};

/// What kind of slot a placeholder is, the way slides and layouts pair them up.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PhClass {
    Title,
    Subtitle,
    /// Text, or an object slot that text can fill.
    Body,
    Picture,
    Date,
    Footer,
    SlideNumber,
}

impl PhClass {
    pub fn of(kind: &str) -> PhClass {
        match kind {
            "title" | "ctrTitle" => PhClass::Title,
            "subTitle" => PhClass::Subtitle,
            "pic" => PhClass::Picture,
            "dt" => PhClass::Date,
            "ftr" => PhClass::Footer,
            "sldNum" => PhClass::SlideNumber,
            _ => PhClass::Body,
        }
    }

    /// Whether the slot is a footer kind, which a slide draws only when it has one of its own.
    pub fn is_footer(self) -> bool {
        matches!(self, PhClass::Date | PhClass::Footer | PhClass::SlideNumber)
    }
}

/// A placeholder of a master or a layout.
#[derive(Clone, Debug)]
pub struct PhShape {
    pub class: PhClass,
    pub idx: Option<u32>,
    /// Its own box, if it gives one.
    pub rect: Option<Rect>,
    pub lst: Levels,
    pub body: BodyProps,
    /// The words it shows when empty.
    pub prompt: String,
    /// The role it has in the deck's layout; None for a footer, which the deck does not model.
    pub role: Option<String>,
    /// The text style it starts from, once the theme is built.
    pub style: String,
}

/// A master: the styles and slots every layout under it starts from.
#[derive(Clone, Debug)]
pub struct MasterInfo {
    pub part: String,
    pub rels: Rels,
    pub map: ColorMap,
    pub theme: ThemeFile,
    pub title: Levels,
    pub body: Levels,
    pub other: Levels,
    pub placeholders: Vec<PhShape>,
    /// Shapes that are not placeholders, drawn on every slide.
    pub decorations: Vec<Node>,
    pub background: Option<Node>,
    pub layouts: Vec<String>,
}

impl MasterInfo {
    /// A master with nothing in it, for a file that has none.
    pub fn plain() -> MasterInfo {
        MasterInfo {
            part: String::new(),
            rels: Rels::default(),
            map: ColorMap::standard(),
            theme: ThemeFile::default(),
            title: Levels::empty(),
            body: Levels::empty(),
            other: Levels::empty(),
            placeholders: Vec::new(),
            decorations: Vec::new(),
            background: None,
            layouts: Vec::new(),
        }
    }
}

/// A layout: its slots, and the shapes it draws under a slide's own.
#[derive(Clone, Debug)]
pub struct LayoutInfo {
    pub part: String,
    pub rels: Rels,
    /// The index of its master.
    pub master: usize,
    pub label: String,
    pub map: ColorMap,
    pub placeholders: Vec<PhShape>,
    pub decorations: Vec<Node>,
    pub background: Option<Node>,
    pub hide_master: bool,
    pub kind: Option<String>,
}

/// The `p:ph` of a shape, whatever kind of shape it is.
pub fn ph_element(shape: &Node) -> Option<&Node> {
    ["p:nvSpPr", "p:nvPicPr", "p:nvGraphicFramePr", "p:nvCxnSpPr"]
        .iter()
        .find_map(|nv| shape.at(&[nv, "p:nvPr", "p:ph"]))
}

/// A shape's own box: `a:xfrm` in its shape properties, or `p:xfrm` of a graphic frame.
pub fn own_rect(shape: &Node) -> Option<Rect> {
    let xfrm = shape
        .at(&["p:spPr", "a:xfrm"])
        .or_else(|| shape.child("p:xfrm"))?;
    let off = xfrm.child("a:off")?;
    let ext = xfrm.child("a:ext")?;
    Some(Rect {
        x: snapped(position(off.int("x")?)),
        y: snapped(position(off.int("y")?)),
        w: snapped(length(ext.int("cx")?)),
        h: snapped(length(ext.int("cy")?)),
    })
}

/// The text of the first paragraph of a shape's body.
pub fn first_line(shape: &Node) -> String {
    shape
        .child("p:txBody")
        .and_then(|b| b.child("a:p"))
        .map(|p| {
            p.children_named("a:r")
                .filter_map(|r| r.child("a:t"))
                .map(Node::text)
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// What a shape tree holds: the placeholders, and the rest.
fn shapes(tree: &Node, reader: &Reader) -> (Vec<PhShape>, Vec<Node>) {
    let mut placeholders = Vec::new();
    let mut rest = Vec::new();
    for shape in tree.elements() {
        if !matches!(
            shape.name.as_str(),
            "p:sp" | "p:pic" | "p:cxnSp" | "p:grpSp" | "p:graphicFrame" | "mc:AlternateContent"
        ) {
            continue;
        }
        let Some(ph) = ph_element(shape) else {
            rest.push(shape.clone());
            continue;
        };
        let kind = ph.attr("type").unwrap_or("obj").to_owned();
        placeholders.push(PhShape {
            class: PhClass::of(&kind),
            idx: ph.int("idx").and_then(|i| u32::try_from(i).ok()),
            rect: own_rect(shape),
            lst: shape
                .at(&["p:txBody", "a:lstStyle"])
                .map(|l| list_style(l, reader, None))
                .unwrap_or_else(Levels::empty),
            body: shape
                .at(&["p:txBody", "a:bodyPr"])
                .map(BodyProps::read)
                .unwrap_or_default(),
            prompt: first_line(shape),
            role: None,
            style: String::new(),
        });
    }
    (placeholders, rest)
}

fn reader<'a>(
    theme: &'a ThemeFile,
    map: &'a ColorMap,
    deck_map: &'a ColorMap,
    fonts: &'a FontNames,
) -> Reader<'a> {
    Reader {
        colors: ColorCx {
            palette: &theme.palette,
            map,
            deck_map,
        },
        fonts,
    }
}

/// The names of the two typefaces of a theme.
pub fn font_names(theme: &ThemeFile) -> FontNames {
    FontNames {
        heading: theme.heading.clone(),
        body: theme.body.clone(),
    }
}

/// Reads the theme a part relates to.
pub fn theme_of(pkg: &mut Package, part: &str, rels: &Rels) -> ThemeFile {
    rels.of_kind("theme")
        .find_map(|rel| pkg.target(part, rel))
        .and_then(|name| pkg.dom(&name).ok())
        .map(|doc| super::themefile::read(&doc))
        .unwrap_or_default()
}

/// Reads a slide master. `deck_map` is the first master's colour mapping, which the deck's tokens mean.
pub fn read_master(
    pkg: &mut Package,
    part: &str,
    deck_map: Option<&ColorMap>,
) -> Option<MasterInfo> {
    let doc = pkg.dom(part).ok()?;
    let rels = pkg.rels_of(part);
    let theme = theme_of(pkg, part, &rels);
    let map = doc
        .root
        .child("p:clrMap")
        .map(ColorMap::from_node)
        .unwrap_or_default();
    let fonts = font_names(&theme);
    let deck_map = deck_map.unwrap_or(&map);
    let reader = reader(&theme, &map, deck_map, &fonts);
    let styles = doc.root.child("p:txStyles");
    let style = |name: &str| {
        styles
            .and_then(|s| s.child(name))
            .map(|s| list_style(s, &reader, None))
            .unwrap_or_else(Levels::empty)
    };
    let (placeholders, decorations) = doc
        .root
        .at(&["p:cSld", "p:spTree"])
        .map(|tree| shapes(tree, &reader))
        .unwrap_or_default();
    let layouts = doc
        .root
        .child("p:sldLayoutIdLst")
        .map(|list| {
            list.children_named("p:sldLayoutId")
                .filter_map(|id| id.attr("r:id"))
                .filter_map(|id| rels.get(id))
                .filter_map(|rel| pkg.target(part, rel))
                .collect()
        })
        .unwrap_or_default();
    Some(MasterInfo {
        part: part.to_owned(),
        title: style("p:titleStyle"),
        body: style("p:bodyStyle"),
        other: style("p:otherStyle"),
        placeholders,
        decorations,
        background: doc.root.at(&["p:cSld", "p:bg"]).cloned(),
        layouts,
        rels,
        map,
        theme,
    })
}

/// Reads a layout.
pub fn read_layout(
    pkg: &mut Package,
    part: &str,
    master_at: usize,
    master: &MasterInfo,
    deck_map: &ColorMap,
) -> Option<LayoutInfo> {
    let doc = pkg.dom(part).ok()?;
    let rels = pkg.rels_of(part);
    let map = doc
        .root
        .at(&["p:clrMapOvr", "a:overrideClrMapping"])
        .map(ColorMap::from_node)
        .unwrap_or_else(|| master.map.clone());
    let fonts = font_names(&master.theme);
    let reader = reader(&master.theme, &map, deck_map, &fonts);
    let (placeholders, decorations) = doc
        .root
        .at(&["p:cSld", "p:spTree"])
        .map(|tree| shapes(tree, &reader))
        .unwrap_or_default();
    Some(LayoutInfo {
        part: part.to_owned(),
        master: master_at,
        label: doc
            .root
            .child("p:cSld")
            .and_then(|c| c.attr("name"))
            .unwrap_or("")
            .to_owned(),
        placeholders,
        decorations,
        background: doc.root.at(&["p:cSld", "p:bg"]).cloned(),
        hide_master: doc.root.flag("showMasterSp") == Some(false),
        kind: doc.root.attr("type").map(str::to_owned),
        rels,
        map,
    })
}

#[cfg(test)]
mod tests;
