//! Colours. A theme colour with nothing done to it becomes the deck's token
//! (`accent1`, `text1` ...) so the deck goes on following its theme; anything
//! else (a lighter accent, an RGB value) becomes `#rrggbb`. The maths of the
//! modifiers PowerPoint puts on a colour is in `modify`.

mod modify;
mod names;

use std::collections::HashMap;

use super::dom::Node;

pub use modify::Rgb;

/// A colour as a deck stores it, and how see-through it is.
#[derive(Clone, Debug, PartialEq)]
pub struct Paint {
    /// A theme token or `#rrggbb`.
    pub value: String,
    /// None when solid.
    pub alpha: Option<f64>,
}

impl Paint {
    pub fn solid(value: impl Into<String>) -> Paint {
        Paint {
            value: value.into(),
            alpha: None,
        }
    }
}

/// The twelve colours of a theme, by the names its colour scheme gives them.
#[derive(Clone, Debug, PartialEq)]
pub struct Palette {
    slots: HashMap<String, Rgb>,
}

const SLOTS: [&str; 12] = [
    "dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
    "hlink", "folHlink",
];

impl Default for Palette {
    /// Office's own colours, for a file that has no theme.
    fn default() -> Palette {
        let mut slots = HashMap::new();
        for (name, hex) in [
            ("dk1", "000000"),
            ("lt1", "ffffff"),
            ("dk2", "1f497d"),
            ("lt2", "eeece1"),
            ("accent1", "4f81bd"),
            ("accent2", "c0504d"),
            ("accent3", "9bbb59"),
            ("accent4", "8064a2"),
            ("accent5", "4bacc6"),
            ("accent6", "f79646"),
            ("hlink", "0000ff"),
            ("folHlink", "800080"),
        ] {
            if let Some(rgb) = Rgb::from_hex(hex) {
                slots.insert(name.to_owned(), rgb);
            }
        }
        Palette { slots }
    }
}

impl Palette {
    /// Reads a theme's `a:clrScheme`. Slots it does not give keep Office's colours.
    pub fn from_scheme(scheme: &Node) -> Palette {
        let mut palette = Palette::default();
        for name in SLOTS {
            let Some(slot) = scheme.child(&format!("a:{name}")) else {
                continue;
            };
            let Some(colour) = slot.elements().next() else {
                continue;
            };
            if let Some(rgb) = base_rgb(colour) {
                palette.slots.insert(name.to_owned(), rgb);
            }
        }
        palette
    }

    pub fn get(&self, slot: &str) -> Rgb {
        self.slots.get(slot).copied().unwrap_or(Rgb(0, 0, 0))
    }
}

/// The colour of `srgbClr`, `sysClr` and the like, before any modifier.
fn base_rgb(node: &Node) -> Option<Rgb> {
    match node.name.as_str() {
        "a:srgbClr" => Rgb::from_hex(node.attr("val")?),
        "a:sysClr" => match node.attr("lastClr").and_then(Rgb::from_hex) {
            Some(rgb) => Some(rgb),
            None => Some(match node.attr("val")? {
                "window" | "menu" | "btnHighlight" => Rgb(255, 255, 255),
                _ => Rgb(0, 0, 0),
            }),
        },
        "a:prstClr" => names::preset(node.attr("val")?),
        "a:hslClr" => {
            let hue = node.int("hue")? as f64 / 60_000.0;
            let sat = node.int("sat")? as f64 / 100_000.0;
            let lum = node.int("lum")? as f64 / 100_000.0;
            Some(modify::from_hsl(hue, sat, lum))
        }
        "a:scrgbClr" => {
            let channel = |name: &str| {
                let linear = (node.int(name).unwrap_or(0) as f64 / 100_000.0).clamp(0.0, 1.0);
                modify::to_srgb(linear)
            };
            Some(Rgb(channel("r"), channel("g"), channel("b")))
        }
        _ => None,
    }
}

/// Which theme slot each of the names a part uses stands for (`p:clrMap`).
#[derive(Clone, Debug, PartialEq)]
pub struct ColorMap {
    pairs: Vec<(String, String)>,
}

impl Default for ColorMap {
    fn default() -> ColorMap {
        ColorMap::standard()
    }
}

impl ColorMap {
    /// Text is dark 1 and the page light 1, as nearly every deck has it.
    pub fn standard() -> ColorMap {
        let pairs = [
            ("bg1", "lt1"),
            ("tx1", "dk1"),
            ("bg2", "lt2"),
            ("tx2", "dk2"),
        ]
        .iter()
        .map(|(a, b)| ((*a).to_owned(), (*b).to_owned()))
        .collect();
        ColorMap { pairs }
    }

    /// Reads `p:clrMap` (or the `a:overrideClrMapping` of a slide); names it leaves out keep the standard slot.
    pub fn from_node(node: &Node) -> ColorMap {
        let mut map = ColorMap::standard();
        for (name, slot) in &mut map.pairs {
            if let Some(found) = node.attr(name) {
                *slot = found.to_owned();
            }
        }
        map
    }

    fn slot(&self, name: &str) -> String {
        self.pairs
            .iter()
            .find(|(n, _)| n == name)
            .map_or_else(|| name.to_owned(), |(_, s)| s.clone())
    }

    /// The deck's token for the palette slot, if one of the four text and page tokens is it.
    fn token_for_slot(&self, slot: &str) -> Option<&'static str> {
        [
            ("text1", "tx1"),
            ("bg1", "bg1"),
            ("text2", "tx2"),
            ("bg2", "bg2"),
        ]
        .iter()
        .find(|(_, name)| self.slot(name) == slot)
        .map(|(token, _)| *token)
    }
}

/// What a colour is resolved against: the palette, the mapping the part in
/// hand uses, and the mapping of the deck's master, whose meaning the deck's
/// tokens have.
#[derive(Clone, Copy)]
pub struct ColorCx<'a> {
    pub palette: &'a Palette,
    pub map: &'a ColorMap,
    pub deck_map: &'a ColorMap,
}

const ACCENTS: [&str; 6] = [
    "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
];

impl ColorCx<'_> {
    /// The deck's colours for the palette: the four text and page tokens read
    /// through the master's mapping, and the accents.
    pub fn deck_colors(&self) -> [(&'static str, Rgb); 10] {
        let slot = |name: &str| self.palette.get(&self.deck_map.slot(name));
        [
            ("text1", slot("tx1")),
            ("text2", slot("tx2")),
            ("bg1", slot("bg1")),
            ("bg2", slot("bg2")),
            ("accent1", self.palette.get("accent1")),
            ("accent2", self.palette.get("accent2")),
            ("accent3", self.palette.get("accent3")),
            ("accent4", self.palette.get("accent4")),
            ("accent5", self.palette.get("accent5")),
            ("accent6", self.palette.get("accent6")),
        ]
    }

    /// The colour a colour element stands for. `placeholder` is what `phClr`
    /// means where a theme's format styles use it.
    pub fn resolve(&self, node: &Node, placeholder: Option<&Paint>) -> Option<Paint> {
        let mut alpha: Option<f64> = None;
        let mut changed = false;
        let (mut rgb, token) = match node.name.as_str() {
            "a:schemeClr" => {
                let name = node.attr("val")?;
                if name == "phClr" {
                    let ph = placeholder
                        .cloned()
                        .unwrap_or_else(|| Paint::solid("text1"));
                    alpha = ph.alpha;
                    (self.rgb_of(&ph.value), Some(ph.value))
                } else {
                    let slot = match name {
                        "bg1" | "tx1" | "bg2" | "tx2" => self.map.slot(name),
                        other => other.to_owned(),
                    };
                    let token = match name {
                        "bg1" | "tx1" | "bg2" | "tx2" | "dk1" | "lt1" | "dk2" | "lt2" => {
                            self.deck_map.token_for_slot(&slot).map(str::to_owned)
                        }
                        accent if ACCENTS.contains(&accent) => Some(accent.to_owned()),
                        _ => None,
                    };
                    (self.palette.get(&slot), token)
                }
            }
            _ => (base_rgb(node)?, None),
        };
        for modifier in node.elements() {
            let value = modifier.int("val").map(|v| v as f64 / 100_000.0);
            let mut colour_changed = true;
            match (modifier.name.as_str(), value) {
                ("a:alpha", Some(v)) => {
                    alpha = Some(v.clamp(0.0, 1.0));
                    colour_changed = false;
                }
                ("a:alphaMod", Some(v)) => {
                    alpha = Some((alpha.unwrap_or(1.0) * v).clamp(0.0, 1.0));
                    colour_changed = false;
                }
                ("a:alphaOff", Some(v)) => {
                    alpha = Some((alpha.unwrap_or(1.0) + v).clamp(0.0, 1.0));
                    colour_changed = false;
                }
                (name, Some(v)) => rgb = modify::apply(rgb, name, v),
                ("a:comp" | "a:inv" | "a:gray", None) => {
                    rgb = modify::apply(rgb, &modifier.name, 0.0);
                }
                _ => colour_changed = false,
            }
            changed |= colour_changed;
        }
        let value = match token {
            Some(token) if !changed => token,
            _ => rgb.to_hex(),
        };
        Some(Paint {
            value,
            alpha: alpha.filter(|a| *a < 0.9999),
        })
    }

    /// The colour of a token or `#rrggbb` this part stands for.
    fn rgb_of(&self, value: &str) -> Rgb {
        if let Some(hex) = value.strip_prefix('#') {
            return Rgb::from_hex(hex).unwrap_or(Rgb(0, 0, 0));
        }
        let slot = match value {
            "text1" => self.deck_map.slot("tx1"),
            "text2" => self.deck_map.slot("tx2"),
            "bg1" | "bg2" => self.deck_map.slot(value),
            other => other.to_owned(),
        };
        self.palette.get(&slot)
    }

    /// A gradient fill drawn as the one colour it averages to, since a deck holds solid fills only.
    pub fn gradient_average(&self, gradient: &Node, placeholder: Option<&Paint>) -> Option<Paint> {
        let stops: Vec<(f64, Paint)> = gradient
            .child("a:gsLst")?
            .children_named("a:gs")
            .filter_map(|gs| {
                let pos = gs.int("pos").unwrap_or(0) as f64 / 100_000.0;
                Some((pos.clamp(0.0, 1.0), self.first(gs, placeholder)?))
            })
            .collect();
        let (first, last) = (stops.first()?, stops.last()?);
        // Each colour counts for the stretch of the gradient that is nearest it.
        let weighted: Vec<(Rgb, f64)> = stops
            .iter()
            .enumerate()
            .map(|(i, (pos, paint))| {
                let before = if i == 0 {
                    *pos
                } else {
                    (pos - stops[i - 1].0) / 2.0
                };
                let after = if i + 1 == stops.len() {
                    1.0 - pos
                } else {
                    (stops[i + 1].0 - pos) / 2.0
                };
                (self.rgb_of(&paint.value), before + after)
            })
            .collect();
        let alpha = (first.1.alpha.unwrap_or(1.0) + last.1.alpha.unwrap_or(1.0)) / 2.0;
        Some(Paint {
            value: modify::average(&weighted)?.to_hex(),
            alpha: Some(alpha).filter(|a| *a < 0.9999),
        })
    }

    /// The first colour element among a node's children, resolved.
    pub fn first(&self, parent: &Node, placeholder: Option<&Paint>) -> Option<Paint> {
        parent
            .elements()
            .find(|n| {
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
            .and_then(|n| self.resolve(n, placeholder))
    }
}

#[cfg(test)]
mod tests;
