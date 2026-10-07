//! What every kind of element shares: its frame, the `a:xfrm` that places it,
//! its name and alt text, and the placeholder it fills.

use slides_core::resolve::{Rect, box_in};
use slides_core::{Base, Element, Layout, PlaceholderKind};

use crate::cx::{Cx, Link};
use crate::units::{angle, emu, length};
use crate::xml::Xml;

/// Where an element is on the slide, in slide units, and how it is turned.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    pub rect: Rect,
    /// Degrees clockwise about the centre.
    pub rotation: f64,
    pub flip_h: bool,
    pub flip_v: bool,
}

/// The frame of an element, from its own box or the placeholder it fills.
pub fn frame_of(cx: &Cx, el: &Element) -> Option<Frame> {
    let base = el.base();
    Some(Frame {
        rect: box_in(&cx.deck.theme, &cx.layout, el)?,
        rotation: base.rotation.unwrap_or(0.0),
        flip_h: base.flip_h,
        flip_v: base.flip_v,
    })
}

/// `a:xfrm` (or `p:xfrm`, as `tag` says): offset and extent, turned and mirrored.
pub fn write_xfrm(x: &mut Xml, tag: &str, frame: &Frame) {
    x.open(tag);
    let turn = angle(frame.rotation);
    if turn != 0 {
        x.int("rot", turn);
    }
    x.flag("flipH", frame.flip_h).flag("flipV", frame.flip_v);
    x.open("a:off")
        .int("x", emu(frame.rect.x))
        .int("y", emu(frame.rect.y))
        .close();
    x.open("a:ext")
        .int("cx", length(frame.rect.w))
        .int("cy", length(frame.rect.h))
        .close();
    x.close();
}

/// A placeholder as PPTX names it: a type, and an index that ties a slide's
/// shape to its layout's.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ph {
    pub kind: &'static str,
    pub idx: u32,
}

/// The placeholder of `role` on `layout`.
pub fn ph_of(layout: &Layout, role: &str) -> Option<Ph> {
    let mut idx = 0;
    for def in &layout.placeholders {
        let is_title = def.role == "title";
        if !is_title {
            idx += 1;
        }
        if def.role != role {
            continue;
        }
        let kind = match (def.role.as_str(), &def.kind) {
            ("title", _) if matches!(layout.name.as_str(), "title" | "section") => "ctrTitle",
            ("title", _) => "title",
            ("subtitle", _) => "subTitle",
            (_, PlaceholderKind::Image) => "pic",
            _ => "body",
        };
        return Some(Ph { kind, idx });
    }
    None
}

impl Ph {
    /// `<p:ph .../>`.
    pub fn write(&self, x: &mut Xml) {
        x.open("p:ph").attr("type", self.kind);
        if self.kind != "title" && self.kind != "ctrTitle" {
            x.int("idx", i64::from(self.idx));
        }
        x.close();
    }

    /// What PowerPoint calls a shape that fills it.
    pub fn label(&self) -> &'static str {
        match self.kind {
            "title" | "ctrTitle" => "Title",
            "subTitle" => "Subtitle",
            "pic" => "Picture Placeholder",
            _ => "Text Placeholder",
        }
    }
}

/// The placeholder the element fills on its slide's layout, if it fills one
/// its kind can: a text box fills a text slot and a picture a picture slot.
pub fn placeholder_for(cx: &Cx, el: &Element) -> Option<Ph> {
    let role = el.base().placeholder.as_deref()?;
    let layout = cx.deck.theme.layout(&cx.layout)?;
    let slot = layout.placeholder(role)?;
    let fits = matches!(
        (el, &slot.kind),
        (Element::Text(_), PlaceholderKind::Text) | (Element::Image(_), PlaceholderKind::Image)
    );
    fits.then(|| ph_of(layout, role)).flatten()
}

/// The name a shape gets in the selection pane: the layer's name, or a plain one.
pub fn name_of(base: &Base, fallback: &str, id: u32) -> String {
    match base.name.as_deref().map(str::trim) {
        Some(name) if !name.is_empty() => name.to_owned(),
        _ => format!("{fallback} {id}"),
    }
}

/// `<p:cNvPr>`: number, name, alt text, and a link the whole element carries.
pub fn write_c_nv_pr(x: &mut Xml, cx: &mut Cx, id: u32, name: &str, base: &Base) {
    x.open("p:cNvPr")
        .int("id", i64::from(id))
        .attr("name", name);
    if let Some(alt) = base.alt.as_deref().filter(|a| !a.is_empty()) {
        x.attr("descr", alt);
    }
    let link = base.link.as_deref().and_then(|address| cx.link(address));
    match link {
        Some(Link::Web(rid)) => {
            x.open("a:hlinkClick").attr("r:id", &rid).close();
        }
        Some(Link::Slide(rid)) => {
            x.open("a:hlinkClick")
                .attr("r:id", &rid)
                .attr("action", "ppaction://hlinksldjump")
                .close();
        }
        None => {}
    }
    x.close();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn xfrm(frame: &Frame) -> String {
        let mut x = Xml::fragment();
        write_xfrm(&mut x, "a:xfrm", frame);
        x.into_string()
    }

    fn frame(x: f64, y: f64, w: f64, h: f64) -> Frame {
        Frame {
            rect: Rect { x, y, w, h },
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
        }
    }

    #[test]
    fn a_frame_is_an_offset_and_an_extent_in_emu() {
        assert_eq!(
            xfrm(&frame(64.0, 36.0, 832.0, 96.0)),
            r#"<a:xfrm><a:off x="609600" y="342900"/><a:ext cx="7924800" cy="914400"/></a:xfrm>"#
        );
    }

    #[test]
    fn a_turn_and_mirrors_are_attributes_and_a_zero_turn_is_left_out() {
        let turned = Frame {
            rotation: -45.0,
            flip_h: true,
            flip_v: true,
            ..frame(0.0, 0.0, 10.0, 20.0)
        };
        assert!(xfrm(&turned).starts_with(r#"<a:xfrm rot="18900000" flipH="1" flipV="1">"#));
        let upright = Frame {
            rotation: 360.0,
            ..frame(0.0, 0.0, 10.0, 20.0)
        };
        assert!(xfrm(&upright).starts_with("<a:xfrm><a:off"));
    }

    #[test]
    fn placeholders_get_their_type_and_an_index_by_position() {
        let theme = slides_core::themes::light();
        let layout = |name: &str| {
            theme
                .layout(name)
                .cloned()
                .unwrap_or_else(|| panic!("layout {name}"))
        };
        let title = layout("title");
        assert_eq!(
            ph_of(&title, "title"),
            Some(Ph {
                kind: "ctrTitle",
                idx: 0
            })
        );
        assert_eq!(
            ph_of(&title, "subtitle"),
            Some(Ph {
                kind: "subTitle",
                idx: 1
            })
        );
        let two = layout("two-columns");
        assert_eq!(
            ph_of(&two, "title"),
            Some(Ph {
                kind: "title",
                idx: 0
            })
        );
        assert_eq!(
            ph_of(&two, "body"),
            Some(Ph {
                kind: "body",
                idx: 1
            })
        );
        assert_eq!(
            ph_of(&two, "body2"),
            Some(Ph {
                kind: "body",
                idx: 2
            })
        );
        let image = layout("title-image");
        assert_eq!(
            ph_of(&image, "image"),
            Some(Ph {
                kind: "pic",
                idx: 2
            })
        );
        assert_eq!(ph_of(&image, "nope"), None);
    }

    #[test]
    fn a_placeholder_is_written_with_an_index_except_a_title() {
        let write = |ph: Ph| {
            let mut x = Xml::fragment();
            ph.write(&mut x);
            x.into_string()
        };
        assert_eq!(
            write(Ph {
                kind: "title",
                idx: 0
            }),
            r#"<p:ph type="title"/>"#
        );
        assert_eq!(
            write(Ph {
                kind: "body",
                idx: 3
            }),
            r#"<p:ph type="body" idx="3"/>"#
        );
    }

    #[test]
    fn a_shape_is_named_by_its_layer_or_by_what_it_is() {
        let mut base = Base::new("e-1");
        assert_eq!(name_of(&base, "TextBox", 4), "TextBox 4");
        base.name = Some("  ".into());
        assert_eq!(name_of(&base, "TextBox", 4), "TextBox 4");
        base.name = Some("LLM box".into());
        assert_eq!(name_of(&base, "TextBox", 4), "LLM box");
    }

    #[test]
    fn the_properties_carry_alt_text_and_a_link() {
        let mut base = Base::new("e-1");
        base.alt = Some("A \"figure\"".into());
        base.link = Some("https://example.com".into());
        let out = crate::testing::with_cx(|cx| {
            let mut x = Xml::fragment();
            write_c_nv_pr(&mut x, cx, 5, "Picture 5", &base);
            x.into_string()
        });
        assert_eq!(
            out,
            r#"<p:cNvPr id="5" name="Picture 5" descr="A &quot;figure&quot;"><a:hlinkClick r:id="rId1"/></p:cNvPr>"#
        );
    }
}
