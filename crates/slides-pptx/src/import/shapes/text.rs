//! The text of a shape: the chain of layers it starts from (its list style, the
//! layout's slot, the master's slot, the shape's font colour, the master's
//! styles and the presentation's defaults) and the box it sits in.

use slides_core::{Text, VAlign};

use super::links::Sink;
use super::ph::PhMatch;
use super::style::font_colour;
use crate::import::color::Paint;
use crate::import::cx::Cx;
use crate::import::dom::Node;
use crate::import::text::body::BodyProps;
use crate::import::text::chain::Chain;
use crate::import::text::convert::{TextEnv, convert};
use crate::import::text::levels::{Level, Levels, RunProps};
use crate::import::theme::{chain_for, chain_plain};

/// A list style that only sets a text colour, for the colour a shape's style gives its text.
fn colour_layer(paint: Paint) -> Levels {
    Levels(vec![
        Level {
            run: RunProps {
                color: Some(paint),
                ..RunProps::default()
            },
            ..Level::default()
        };
        9
    ])
}

/// The text of a `p:txBody`, for a shape that fills `slot` (or, with None, is not a placeholder).
pub fn text_of(
    cx: &mut Cx,
    shape: &Node,
    tx_body: &Node,
    slot: Option<&PhMatch>,
    default_valign: VAlign,
    base_style: Option<&str>,
) -> Text {
    let deck = cx.env;
    let master = slot
        .and(cx.part.layout)
        .and_then(|l| deck.layouts.get(l))
        .and_then(|l| deck.masters.get(l.master))
        .or_else(|| deck.masters.first());
    let font = font_colour(cx, shape.child("p:style")).map(colour_layer);
    let (chain, base, body) = match (slot, master) {
        (Some(slot), Some(master)) => {
            let chain = chain_for(slot.class, slot.layout, master, &deck.default_text, font);
            let layered = slot
                .layout
                .map(|l| l.body.clone())
                .unwrap_or_default()
                .over(&slot.master.map(|m| m.body.clone()).unwrap_or_default());
            (chain, slot.style(), layered)
        }
        (None, Some(master)) => {
            let chain = chain_plain(master, &deck.default_text, font);
            (chain, other_style(cx), BodyProps::default())
        }
        _ => {
            let mut chain = Chain::new();
            if let Some(layer) = font {
                chain = chain.below(layer);
            }
            (
                chain.below(deck.default_text.clone()),
                "body".to_owned(),
                BodyProps::default(),
            )
        }
    };
    let base = base_style.map_or(base, str::to_owned);
    let own = tx_body
        .child("a:bodyPr")
        .map(BodyProps::read)
        .unwrap_or_default();
    let body = own.over(&body);
    if let Some(vert) = tx_body.child("a:bodyPr").and_then(|b| b.attr("vert"))
        && vert != "horz"
    {
        cx.warn("vertical text was set horizontally");
    }
    let reader = cx.reader();
    let env = TextEnv {
        reader,
        styles: &cx.env.styles,
        base: &base,
        chain: &chain,
        body,
        default_valign,
    };
    let mut sink = Sink(cx);
    convert(tx_body, &env, &mut sink)
}

/// The style non-placeholder text starts from: `body`, unless the master sets other text differently.
fn other_style(cx: &Cx) -> String {
    if cx.env.styles.get("other").is_some() {
        "other".to_owned()
    } else {
        "body".to_owned()
    }
}
