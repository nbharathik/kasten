//! Groups. The children of a group are already in slide coordinates, so the
//! group's own coordinate space is the slide's: its offset and extent are the
//! box around the children, and so are its child offset and child extent.

use slides_core::resolve::{Rect, box_in};
use slides_core::{Element, GroupEl};

use super::common::{name_of, write_c_nv_pr};
use super::{Env, write_all};
use crate::cx::Cx;
use crate::units::{emu, length};
use crate::xml::Xml;

/// The upright box around a rectangle turned by `degrees` about its centre.
fn turned(r: Rect, degrees: f64) -> Rect {
    if degrees % 360.0 == 0.0 {
        return r;
    }
    let (sin, cos) = degrees.to_radians().sin_cos();
    let (sin, cos) = (sin.abs(), cos.abs());
    let (cx, cy) = (r.x + r.w / 2.0, r.y + r.h / 2.0);
    let (w, h) = (r.w * cos + r.h * sin, r.w * sin + r.h * cos);
    Rect {
        x: cx - w / 2.0,
        y: cy - h / 2.0,
        w,
        h,
    }
}

/// The smallest box that holds everything a group holds.
fn extent(cx: &Cx, el: &Element) -> Option<Rect> {
    let inside = |children: &[Element]| {
        children
            .iter()
            .filter_map(|c| extent(cx, c))
            .reduce(|a, b| {
                let x = a.x.min(b.x);
                let y = a.y.min(b.y);
                Rect {
                    x,
                    y,
                    w: (a.x + a.w).max(b.x + b.w) - x,
                    h: (a.y + a.h).max(b.y + b.h) - y,
                }
            })
    };
    match el {
        Element::Group(g) => inside(&g.children),
        _ => box_in(&cx.deck.theme, &cx.layout, el)
            .map(|r| turned(r, el.base().rotation.unwrap_or(0.0))),
    }
}

pub fn write(x: &mut Xml, cx: &mut Cx, group: &GroupEl, id: u32, env: &Env) {
    let Some(rect) = extent(cx, &Element::Group(group.clone())) else {
        return;
    };
    let env = Env {
        opacity: env.opacity_of(&group.base),
    };
    x.open("p:grpSp");
    x.open("p:nvGrpSpPr");
    write_c_nv_pr(x, cx, id, &name_of(&group.base, "Group", id), &group.base);
    x.open("p:cNvGrpSpPr").close();
    x.open("p:nvPr").close();
    x.close();
    x.open("p:grpSpPr");
    x.open("a:xfrm");
    for (offset, size) in [("a:off", "a:ext"), ("a:chOff", "a:chExt")] {
        x.open(offset)
            .int("x", emu(rect.x))
            .int("y", emu(rect.y))
            .close();
        x.open(size)
            .int("cx", length(rect.w))
            .int("cy", length(rect.h))
            .close();
    }
    x.close();
    x.close();
    write_all(x, cx, &group.children, &env);
    x.close();
}

#[cfg(test)]
mod tests {
    use slides_core::{Base, Element, Extra, Style, Text};

    use super::*;
    use crate::elements::xml_of;
    use crate::testing::with_cx;

    fn text(id: &str, x: f64, y: f64, w: f64, h: f64) -> Element {
        Element::text_el(Base::new(id).place(x, y, w, h), Text::plain("t"))
    }

    fn group(children: Vec<Element>) -> Element {
        Element::Group(GroupEl {
            base: Base::new("g"),
            children,
            extra: Extra::new(),
        })
    }

    #[test]
    fn a_group_frames_its_children_and_maps_them_onto_themselves() {
        let g = group(vec![
            text("a", 100.0, 50.0, 100.0, 40.0),
            text("b", 250.0, 100.0, 50.0, 100.0),
        ]);
        let out = with_cx(|cx| xml_of(cx, &g));
        assert!(
            out.starts_with(concat!(
                r#"<p:grpSp><p:nvGrpSpPr><p:cNvPr id="2" name="Group 2"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>"#,
                r#"<p:grpSpPr><a:xfrm><a:off x="952500" y="476250"/><a:ext cx="1905000" cy="1428750"/>"#,
                r#"<a:chOff x="952500" y="476250"/><a:chExt cx="1905000" cy="1428750"/></a:xfrm></p:grpSpPr>"#,
                r#"<p:sp><p:nvSpPr><p:cNvPr id="3" name="TextBox 3"/>"#
            )),
            "{out}"
        );
        assert!(out.ends_with("</p:sp></p:grpSp>"), "{out}");
        assert_eq!(out.matches("<p:sp>").count(), 2);
    }

    #[test]
    fn a_turned_child_widens_the_frame_and_groups_nest() {
        let mut turned_child = text("a", 0.0, 0.0, 100.0, 20.0);
        turned_child.base_mut().rotation = Some(90.0);
        let inner = group(vec![turned_child]);
        let outer = group(vec![inner, text("b", 200.0, 0.0, 10.0, 10.0)]);
        let out = with_cx(|cx| xml_of(cx, &outer));
        // Turned a quarter about its centre (50, 10) the child is 20 wide and 100 high, from (40, -40).
        assert!(
            out.contains(r#"<a:off x="381000" y="-381000"/><a:ext cx="1619250" cy="952500"/>"#),
            "{out}"
        );
        assert_eq!(out.matches("<p:grpSp>").count(), 2, "{out}");
        assert!(out.contains(r#"<p:cNvPr id="3" name="Group 3"/>"#), "{out}");
    }

    #[test]
    fn a_groups_opacity_reaches_what_it_holds_and_an_empty_group_is_not_written() {
        let mut g = group(vec![text("a", 0.0, 0.0, 10.0, 10.0)]);
        g.base_mut().style = Some(Style {
            opacity: Some(0.5),
            ..Style::default()
        });
        let out = with_cx(|cx| xml_of(cx, &g));
        assert!(
            out.contains(r#"<a:alpha val="50000"/>"#),
            "the text colour is faded: {out}"
        );
        assert_eq!(with_cx(|cx| xml_of(cx, &group(Vec::new()))), "");
    }
}
