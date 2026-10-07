//! The decks the tests export: the demo and one with every kind of element.
//! The others, of more variety, are in `variety`.

use serde_json::{Value, json};
use slides_core::Deck;

use super::samples::{self, GIF_4X3, JPEG_3X2, WEBP_3X2};
use super::{Builder, Files, cell, item, para, runs};

/// The pictures every deck here may name.
pub fn pictures() -> Files {
    let mut files = Files::default();
    let gradient = |w: u32, h: u32| {
        samples::png(w, h, |x, y| {
            [(x * 255 / w.max(1)) as u8, (y * 255 / h.max(1)) as u8, 160]
        })
    };
    files
        .0
        .insert("assets/figure.png".into(), gradient(320, 200));
    files.0.insert("assets/wide.png".into(), gradient(640, 160));
    files.0.insert(
        "assets/logo.png".into(),
        samples::solid(100, 40, [11, 92, 173]),
    );
    files.0.insert("assets/photo.jpg".into(), JPEG_3X2.to_vec());
    files.0.insert("assets/anim.gif".into(), GIF_4X3.to_vec());
    files
        .0
        .insert("assets/still.webp".into(), WEBP_3X2.to_vec());
    files.0.insert(
        "assets/diagram.svg".into(),
        b"<svg xmlns='http://www.w3.org/2000/svg' width='40' height='20'/>".to_vec(),
    );
    files
        .0
        .insert("assets/diagram.png".into(), gradient(80, 40));
    files
        .0
        .insert("assets/backdrop.png".into(), gradient(960, 300));
    files
}

pub fn frame(x: f64, y: f64, w: f64, h: f64) -> Value {
    json!({ "x": x, "y": y, "w": w, "h": h })
}

/// `base` with the members of `extra` added.
pub fn with(mut base: Value, extra: Value) -> Value {
    if let (Some(b), Some(e)) = (base.as_object_mut(), extra.as_object()) {
        b.extend(e.clone());
    }
    base
}

/// A shape with a fill, an outline and its words in the middle.
pub fn labelled(id: &str, shape: &str, at: (f64, f64, f64, f64), accent: u8, label: &str) -> Value {
    with(
        json!({
            "type": "shape", "id": id, "shape": shape,
            "style": {
                "fill": { "color": format!("accent{accent}"), "alpha": 0.2 },
                "stroke": { "color": format!("accent{accent}"), "width": 1.5 },
                "radius": 8
            },
            "text": { "paragraphs": [{ "align": "center", "runs": [{ "t": label, "b": true, "size": 14 }] }], "valign": "middle" }
        }),
        frame(at.0, at.1, at.2, at.3),
    )
}

/// A connector between two elements.
pub fn joined(id: &str, route: &str, from: (&str, &str), to: (&str, &str), extra: Value) -> Value {
    with(
        json!({
            "type": "connector", "id": id, "route": route, "x": 0, "y": 0, "w": 1, "h": 1,
            "from": { "el": from.0, "side": from.1 }, "to": { "el": to.0, "side": to.1 },
            "style": { "stroke": { "color": "text2", "width": 1.5 }, "endArrow": "triangle" }
        }),
        extra,
    )
}

/// The six-slide deck of the demo: title, bullets on three levels, a picture, a diagram, a table, a quote.
pub fn demo() -> (Deck, Files) {
    let mut b = Builder::new("Light", "Tool use in language models", 21);
    let first = b.engine.deck().slides[0].clone();
    let subtitle = first
        .elements
        .iter()
        .find(|e| e.base().placeholder.as_deref() == Some("subtitle"))
        .map(|e| e.id().to_owned())
        .unwrap_or_default();
    b.words(
        &first.id,
        &subtitle,
        vec![para("A short tour, exported from Kasten Slides")],
    );

    let list = b.slide("title-body", json!({ "title": "How a model uses a tool" }));
    b.words(
        &list.id,
        list.slot("body"),
        vec![
            item("bullet", 0, "The model decides to call a tool"),
            item("bullet", 1, "It writes a request"),
            item("bullet", 2, "as structured JSON"),
            item("bullet", 1, "The host runs it"),
            runs(&[
                ("The result ", json!({})),
                ("comes back", json!({ "b": true, "color": "accent2" })),
                (" and the model ", json!({})),
                ("answers", json!({ "i": true, "u": true })),
            ])
            .as_object()
            .map(|o| {
                let mut p = o.clone();
                p.insert("list".into(), json!("bullet"));
                Value::Object(p)
            })
            .unwrap_or_default(),
            item("bullet", 0, "Read more in the docs")
                .as_object()
                .map(|o| {
                    let mut p = o.clone();
                    p.insert(
                        "runs".into(),
                        json!([{ "t": "Read more in " }, { "t": "the docs", "link": "https://example.com/tools" }]),
                    );
                    Value::Object(p)
                })
                .unwrap_or_default(),
        ],
    );
    b.notes(
        &list.id,
        "Explain the loop, slowly.\n\n- ask who has used a search tool\n- **pause** for questions",
    );

    let picture = b.slide(
        "title-image",
        json!({ "title": "Text on the left, a picture on the right" }),
    );
    b.words(
        &picture.id,
        picture.slot("body"),
        vec![
            item("number", 0, "Prompt goes in"),
            item("number", 0, "Tokens come out"),
            item("number", 1, "one at a time"),
            item("number", 0, "Tools close the loop"),
        ],
    );
    b.patch(
        &picture.id,
        picture.slot("image"),
        json!({ "src": "assets/figure.png", "alt": "A colourful gradient standing for a figure", "mask": "roundRect" }),
    );

    let diagram = b.slide(
        "title-only",
        json!({ "title": "The loop, drawn with shapes" }),
    );
    let ids = b.add(
        &diagram.id,
        json!([
            labelled("prompt", "roundRect", (64.0, 200.0, 150.0, 64.0), 1, "Prompt"),
            labelled("llm", "roundRect", (280.0, 200.0, 150.0, 64.0), 2, "LLM"),
            labelled("tool", "roundRect", (496.0, 200.0, 150.0, 64.0), 3, "Tool"),
            labelled("result", "roundRect", (712.0, 200.0, 150.0, 64.0), 4, "Result"),
            labelled("ok", "diamond", (280.0, 330.0, 150.0, 96.0), 5, "Done?"),
            labelled("start", "ellipse", (64.0, 340.0, 120.0, 70.0), 6, "Start"),
            joined("c1", "straight", ("prompt", "right"), ("llm", "left"), json!({
                "label": { "paragraphs": [{ "runs": [{ "t": "asks" }] }] }
            })),
            joined("c2", "straight", ("llm", "right"), ("tool", "left"), json!({})),
            joined("c3", "straight", ("tool", "right"), ("result", "left"), json!({})),
            joined("c4", "elbow", ("tool", "bottom"), ("ok", "right"), json!({})),
            joined("c5", "curved", ("start", "top"), ("prompt", "bottom"), json!({})),
            joined("c6", "straight", ("llm", "bottom"), ("ok", "top"), json!({
                "style": { "stroke": { "color": "accent2", "width": 2, "dash": "dash" }, "endArrow": "open", "startArrow": "oval" }
            })),
            with(json!({
                "type": "shape", "id": "arrow", "shape": "rightArrow", "rotation": 20,
                "style": { "fill": { "color": "accent6" }, "shadow": { "color": "#000000", "blur": 6, "dx": 2, "dy": 4, "alpha": 0.3 } }
            }), frame(560.0, 340.0, 200.0, 70.0)),
            with(json!({
                "type": "line", "id": "rule", "style": { "stroke": { "color": "text2", "width": 1, "dash": "dot" } }
            }), frame(64.0, 460.0, 800.0, 0.0)),
        ]),
    );
    assert_eq!(ids.len(), 14);
    b.apply(
        "group_elements",
        json!({ "slide": diagram.id, "ids": ["arrow", "rule"] }),
    );

    let table = b.slide("title-only", json!({ "title": "A native table" }));
    let mut merged = cell("Two columns wide");
    merged["colSpan"] = json!(2);
    merged["fill"] = json!({ "color": "accent1", "alpha": 0.15 });
    let mut tall = cell("Search");
    tall["rowSpan"] = json!(2);
    b.add(
        &table.id,
        json!([{
            "type": "table", "id": "tools", "x": 64, "y": 160, "w": 832, "h": 260,
            "columns": [200, 316, 316], "headerRow": true,
            "rows": [
                { "cells": [cell("Tool"), cell("Input"), cell("Output")] },
                { "cells": [tall, cell("a query"), cell("ranked results")] },
                { "cells": [cell("a page address"), cell("the page's text")] },
                { "cells": [cell("Calculator"), merged] },
                { "cells": [cell("Code"), cell("a script"), cell("what it printed")] }
            ]
        }]),
    );

    let quote = b.slide(
        "quote",
        json!({ "quote": "Make it work, make it right, make it fast.", "caption": "Kent Beck" }),
    );
    b.notes(&quote.id, "Close on this one.");
    (b.deck(), self::pictures())
}

/// One slide with every kind of element, and slides for what can go wrong with a picture.
pub fn every_element(theme: &str) -> (Deck, Files) {
    let mut b = Builder::new(theme, "Every element", 31);
    let all = b.slide("blank", json!({}));
    b.add(
        &all.id,
        json!([
            with(json!({
                "type": "text", "id": "note", "name": "A note", "alt": "a styled text box",
                "style": {
                    "fill": { "color": "bg2" }, "stroke": { "color": "accent1", "width": 2, "dash": "longDash" },
                    "radius": 12, "shadow": { "color": "text1", "blur": 8, "dx": 0, "dy": 3, "alpha": 0.25 }
                },
                "text": { "paragraphs": [para("A text box with a fill, an outline and a shadow")], "valign": "middle" }
            }), frame(40.0, 30.0, 300.0, 90.0)),
            labelled("box", "rect", (400.0, 30.0, 140.0, 60.0), 1, "Box"),
            labelled("pill", "flowChartTerminator", (580.0, 30.0, 140.0, 60.0), 2, "Pill"),
            labelled("hex", "hexagon", (760.0, 30.0, 140.0, 60.0), 3, "Hexagon"),
            labelled("callout", "wedgeRoundRectCallout", (40.0, 160.0, 200.0, 80.0), 4, "Callout"),
            with(
                labelled("star", "star5", (280.0, 150.0, 100.0, 100.0), 5, ""),
                json!({ "link": "https://example.com/docs?a=1&b=2", "alt": "A star that links out" }),
            ),
            labelled("mystery", "hologram", (420.0, 160.0, 120.0, 70.0), 6, "Unknown"),
            with(json!({ "type": "line", "id": "l1", "style": { "stroke": { "color": "accent1", "width": 3 }, "endArrow": "stealth", "startArrow": "diamond" } }), frame(40.0, 290.0, 260.0, 80.0)),
            with(json!({ "type": "line", "id": "l2", "route": "elbow", "flipV": true, "style": { "stroke": { "color": "accent2", "width": 2 }, "endArrow": "triangle" } }), frame(340.0, 290.0, 200.0, 90.0)),
            with(json!({ "type": "image", "id": "pic", "src": "assets/figure.png", "alt": "Cropped and masked",
                "crop": { "left": 0.1, "top": 0.2, "right": 0.1, "bottom": 0.0 }, "mask": "ellipse" }), frame(600.0, 150.0, 160.0, 160.0)),
            with(json!({ "type": "raw", "id": "chart", "original": "pptx:chart", "preview": "assets/wide.png", "alt": "A chart" }), frame(780.0, 150.0, 130.0, 60.0)),
            with(json!({ "type": "raw", "id": "smart", "original": "pptx:smartart" }), frame(780.0, 230.0, 130.0, 60.0)),
            with(json!({
                "type": "table", "id": "grid", "columns": [100, 100], "headerRow": true,
                "rows": [{ "cells": [cell("A"), cell("B")] }, { "cells": [cell("1"), cell("2")] }]
            }), frame(600.0, 340.0, 200.0, 80.0)),
            labelled("g1", "ellipse", (40.0, 420.0, 90.0, 60.0), 1, "one"),
            labelled("g2", "ellipse", (150.0, 440.0, 90.0, 60.0), 2, "two"),
        ]),
    );
    b.apply(
        "group_elements",
        json!({ "slide": all.id, "ids": ["g1", "g2"] }),
    );
    b.add(
        &all.id,
        json!([joined(
            "k",
            "straight",
            ("box", "bottom"),
            ("pill", "bottom"),
            json!({})
        )]),
    );

    let pictures = b.slide("blank", json!({}));
    b.add(
        &pictures.id,
        json!([
            with(json!({ "type": "image", "id": "png", "src": "assets/figure.png" }), frame(20.0, 20.0, 200.0, 125.0)),
            with(json!({ "type": "image", "id": "jpg", "src": "assets/photo.jpg" }), frame(240.0, 20.0, 150.0, 100.0)),
            with(json!({ "type": "image", "id": "gif", "src": "assets/anim.gif" }), frame(410.0, 20.0, 120.0, 90.0)),
            with(json!({ "type": "image", "id": "webp", "src": "assets/still.webp" }), frame(550.0, 20.0, 120.0, 80.0)),
            with(json!({ "type": "image", "id": "svg", "src": "assets/diagram.svg", "alt": "A diagram" }), frame(20.0, 200.0, 200.0, 100.0)),
            with(json!({ "type": "image", "id": "same", "src": "assets/figure.png" }), frame(240.0, 200.0, 100.0, 62.0)),
            with(json!({ "type": "image", "id": "gone", "src": "assets/missing.png", "alt": "Missing on purpose" }), frame(360.0, 200.0, 160.0, 100.0)),
            with(json!({ "type": "image", "id": "unset", "src": "" }), frame(540.0, 200.0, 100.0, 100.0)),
        ]),
    );
    b.apply("set_background", json!({ "slide": pictures.id, "background": { "image": "assets/backdrop.png", "color": "bg2" } }));

    let plain_bg = b.slide("title-only", json!({ "title": "A colour behind" }));
    b.apply(
        "set_background",
        json!({ "slide": plain_bg.id, "background": { "color": "#fff4d6" } }),
    );
    // A shape that jumps to another slide, added last so that the slide exists.
    b.add(
        &all.id,
        json!([with(
            labelled(
                "next",
                "roundRect",
                (280.0, 420.0, 140.0, 50.0),
                2,
                "Next slide"
            ),
            json!({ "link": format!("slide:{}", plain_bg.id) })
        )]),
    );
    (b.deck(), self::pictures())
}
