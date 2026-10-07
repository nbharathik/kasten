//! `p:pic`: a picture, with its crop and mask. A picture a deck cannot hold
//! (a metafile, a video) is kept as `raw`.

use slides_core::{Crop, Element, Extra, ImageEl, Mask};

use super::base::{Nv, base_of, nv_of};
use super::frame::{self, Frame};
use super::ph::{self, PhMatch};
use super::{raw, style};
use crate::import::cx::Cx;
use crate::import::dom::{Child, Node};
use crate::import::master::ph_element;
use crate::import::media::Picture;
use crate::import::units::round4;

fn frame_of(cx: &Cx, pic: &Node, slot: Option<&PhMatch>) -> Option<Frame> {
    if let Some(own) = pic.at(&["p:spPr", "a:xfrm"]).and_then(frame::read) {
        return Some(frame::place(&cx.groups, own));
    }
    let rect = slot.and_then(|s| {
        s.layout
            .and_then(|l| l.rect)
            .or_else(|| s.master.and_then(|m| m.rect))
    })?;
    Some(Frame {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        rot: 0.0,
        flip_h: false,
        flip_v: false,
    })
}

fn crop_of(blip_fill: &Node) -> Option<Crop> {
    let rect = blip_fill.child("a:srcRect")?;
    let cut =
        |name: &str| round4((rect.int(name).unwrap_or(0) as f64 / 100_000.0).clamp(0.0, 0.99));
    let crop = Crop {
        left: cut("l"),
        top: cut("t"),
        right: cut("r"),
        bottom: cut("b"),
        extra: Extra::new(),
    };
    (crop.left > 0.0 || crop.top > 0.0 || crop.right > 0.0 || crop.bottom > 0.0).then_some(crop)
}

/// The part a `r:embed` (or `r:link`) of the picture's blip points at.
fn blip_part(cx: &mut Cx, blip: &Node) -> Option<String> {
    let rel = blip
        .attr("r:embed")
        .and_then(|id| cx.part.rels.get(id))?
        .clone();
    cx.imp.pkg.target(&cx.part.name, &rel)
}

pub fn convert(cx: &mut Cx, pic: &Node, out: &mut Vec<Element>) {
    let nv = nv_of(pic.at(&["p:nvPicPr", "p:cNvPr"]));
    let ph_node = ph_element(pic);
    let slot = ph_node
        .filter(|_| !cx.part.in_master)
        .map(|ph| ph::find(cx.env, cx.part.layout, ph));
    let Some(frame) = frame_of(cx, pic, slot.as_ref()) else {
        cx.warn_slide("a picture with no position was left out");
        return;
    };
    let props = pic.at(&["p:nvPicPr", "p:nvPr"]);
    let is_media = props.is_some_and(|p| {
        p.elements().any(|n| {
            matches!(
                n.name.as_str(),
                "a:videoFile" | "a:audioFile" | "a:wavAudioFile" | "a:quickTimeFile"
            )
        })
    });
    let blip_fill = pic.child("p:blipFill");
    let picture = load(cx, blip_fill);

    if is_media {
        let preview = picture
            .as_ref()
            .and_then(|p| p.as_ref().ok())
            .map(|p| p.src.clone());
        raw::element(cx, pic, "pptx:media", &nv, Some(&frame), preview, out);
        return;
    }
    image(
        cx,
        pic,
        pic,
        &nv,
        &frame,
        slot.as_ref(),
        blip_fill,
        picture,
        out,
    );
}

/// A shape that is a picture cut to a shape, as some programs save a picture with rounded corners.
pub fn from_shape(
    cx: &mut Cx,
    sp: &Node,
    nv: &Nv,
    frame: &Frame,
    slot: Option<&PhMatch>,
    fill: &Node,
    out: &mut Vec<Element>,
) {
    let picture = load(cx, Some(fill));
    // The shape's fill is the picture; the looks the shape has besides are read without it.
    let mut bare = sp.clone();
    if let Some(pr) = bare.children.iter_mut().find_map(|c| match c {
        Child::Node(n) if n.name == "p:spPr" => Some(n),
        _ => None,
    }) {
        pr.children
            .retain(|c| !matches!(c, Child::Node(n) if n.name == "a:blipFill"));
    }
    image(cx, sp, &bare, nv, frame, slot, Some(fill), picture, out);
}

/// The picture a blip fill points at, put in the store.
fn load(cx: &mut Cx, blip_fill: Option<&Node>) -> Option<Result<Picture, String>> {
    let blip = blip_fill.and_then(|b| b.child("a:blip"))?;
    let part = blip_part(cx, blip)?;
    let pkg = &mut cx.imp.pkg;
    Some(cx.imp.media.picture(pkg, &part))
}

/// The `image` a picture, or a shape filled with one, is. `looks_from` is the node its fill and outline are
/// read from: the picture itself, or the shape without its picture fill.
#[allow(clippy::too_many_arguments)]
fn image(
    cx: &mut Cx,
    node: &Node,
    looks_from: &Node,
    nv: &Nv,
    frame: &Frame,
    slot: Option<&PhMatch>,
    blip_fill: Option<&Node>,
    picture: Option<Result<Picture, String>>,
    out: &mut Vec<Element>,
) {
    let blip = blip_fill.and_then(|b| b.child("a:blip"));
    let geometry = node.at(&["p:spPr", "a:prstGeom"]);
    let mut looks = style::read(cx, looks_from, geometry, frame);
    match picture {
        Some(Ok(found)) => {
            let prst = geometry.and_then(|g| g.attr("prst")).unwrap_or("rect");
            let mask = match prst {
                "ellipse" => Some(Mask::Ellipse),
                "roundRect" => Some(Mask::RoundRect),
                "rect" => None,
                other => {
                    cx.warn_slide(format!(
                        "a picture cut to `{other}` is shown as a rectangle"
                    ));
                    None
                }
            };
            if blip.is_some_and(|b| b.contains("asvg:svgBlip")) {
                cx.warn_slide("an SVG picture was replaced by its PNG picture");
            }
            if blip.is_some_and(|b| {
                b.elements().any(|n| {
                    matches!(
                        n.name.as_str(),
                        "a:duotone"
                            | "a:lum"
                            | "a:biLevel"
                            | "a:grayscl"
                            | "a:clrChange"
                            | "a:clrRepl"
                            | "a:hsl"
                            | "a:tint"
                    )
                })
            }) {
                cx.warn_slide("a picture's recolouring was left out");
            }
            looks.opacity = blip
                .and_then(|b| b.child("a:alphaModFix"))
                .and_then(|a| a.int("amt"))
                .map(|v| round4(v as f64 / 100_000.0))
                .filter(|v| *v < 0.9999);
            // A rounded mask keeps the radius it was drawn with only as a corner share; the editor's default stands in.
            if mask != Some(Mask::RoundRect) {
                looks.radius = None;
            }
            let role = slot.and_then(PhMatch::role);
            let follows_layout = role.is_some() && node.at(&["p:spPr", "a:xfrm"]).is_none();
            let mut base = base_of(cx, nv, Some(frame), role, looks);
            if follows_layout {
                base.x = None;
                base.y = None;
                base.w = None;
                base.h = None;
            }
            out.push(Element::Image(ImageEl {
                base,
                src: found.src,
                crop: blip_fill.and_then(crop_of),
                mask,
                extra: slides_core::Extra::new(),
            }));
        }
        Some(Err(why)) => {
            cx.warn_slide(format!("a picture was kept as it was, not shown: {why}"));
            raw::element(cx, node, "pptx:picture", nv, Some(frame), None, out);
        }
        None => {
            let linked = blip.is_some_and(|b| b.attr("r:link").is_some());
            cx.warn_slide(if linked {
                "a picture linked from outside the file was left out"
            } else {
                "a picture with no image was left out"
            });
        }
    }
}
