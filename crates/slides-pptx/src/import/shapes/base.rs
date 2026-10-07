//! What every kind of shape has: its number and name, its alt text and link,
//! and the `Base` of the element it becomes.

use slides_core::{Base, Style};

use super::frame::Frame;
use crate::import::cx::Cx;
use crate::import::dom::Node;

/// A shape's `p:cNvPr`.
#[derive(Clone, Debug, Default)]
pub struct Nv {
    pub id: i64,
    pub name: String,
    pub descr: String,
    pub click: Option<Node>,
}

pub fn nv_of(c_nv_pr: Option<&Node>) -> Nv {
    let Some(n) = c_nv_pr else {
        return Nv::default();
    };
    Nv {
        id: n.int("id").unwrap_or(-1),
        name: n.attr("name").unwrap_or("").trim().to_owned(),
        descr: n.attr("descr").unwrap_or("").trim().to_owned(),
        click: n.child("a:hlinkClick").cloned(),
    }
}

/// The names PowerPoint gives shapes it makes: "TextBox 3", "Content Placeholder 2" ...
fn is_default_name(name: &str) -> bool {
    const KINDS: &[&str] = &[
        "TextBox",
        "Text Box",
        "Rectangle",
        "Rounded Rectangle",
        "Oval",
        "Ellipse",
        "Freeform",
        "Picture",
        "Group",
        "Table",
        "Title",
        "Subtitle",
        "Content Placeholder",
        "Text Placeholder",
        "Picture Placeholder",
        "Straight Connector",
        "Straight Arrow Connector",
        "Elbow Connector",
        "Curved Connector",
        "Connector",
        "Line",
        "Shape",
        "Isosceles Triangle",
        "Right Arrow",
        "Diamond",
        "Object",
        "Chart",
        "Graphic Frame",
        "Slide Number Placeholder",
        "Date Placeholder",
        "Footer Placeholder",
        "Google Shape",
        "PlaceHolder",
        "Custom Shape",
        "CustomShape",
    ];
    if name.is_empty() {
        return true;
    }
    KINDS.iter().any(|kind| match name.strip_prefix(kind) {
        Some("") => true,
        Some(rest) => {
            let rest = rest.trim_start_matches([' ', ';']);
            rest.starts_with(|c: char| c.is_ascii_digit())
                && rest
                    .chars()
                    .all(|c| c.is_ascii_digit() || matches!(c, ';' | 'p'))
        }
        None => false,
    })
}

/// A layer name worth keeping: one the person gave, not one the program did.
pub fn layer_name(name: &str) -> Option<String> {
    (!is_default_name(name)).then(|| name.to_owned())
}

/// The `Base` of an element made from a shape: a new id, its box and looks.
pub fn base_of(
    cx: &mut Cx,
    nv: &Nv,
    frame: Option<&Frame>,
    placeholder: Option<String>,
    style: Style,
) -> Base {
    let id = cx.imp.element_id();
    if nv.id >= 0 {
        cx.shape_ids.insert(nv.id, id.clone());
    }
    let mut base = Base::new(id);
    if let Some(f) = frame {
        base.x = Some(f.x);
        base.y = Some(f.y);
        base.w = Some(f.w);
        base.h = Some(f.h);
        base.rotation = (f.rot != 0.0).then_some(f.rot);
        base.flip_h = f.flip_h;
        base.flip_v = f.flip_v;
    }
    base.placeholder = placeholder;
    base.style = (!style.is_empty()).then_some(style);
    base.name = layer_name(&nv.name);
    base.alt = (!nv.descr.is_empty()).then(|| nv.descr.clone());
    cx.element = Some(base.id.clone());
    if let Some(click) = &nv.click {
        base.link = super::links::resolve(cx, click);
    }
    base
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_names_a_program_gives_are_not_layer_names_and_a_persons_are() {
        for default in [
            "",
            "TextBox 3",
            "Rectangle 12",
            "Content Placeholder 2",
            "Title 1",
            "Picture 4",
            "Group 7",
            "Straight Connector 9",
            "Google Shape;55;p13",
            "Table 3",
            "Shape 2",
            "Slide Number Placeholder 5",
            "PlaceHolder 1",
            "CustomShape 4",
        ] {
            assert_eq!(layer_name(default), None, "{default:?}");
        }
        for named in [
            "LLM box",
            "Logo",
            "Box 1 of 3",
            "Rectangle with pride",
            "Title bar",
            "Step 2: run",
        ] {
            assert_eq!(layer_name(named).as_deref(), Some(named), "{named:?}");
        }
    }
}
