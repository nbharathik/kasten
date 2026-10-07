//! Fonts a run names that nothing here can draw as written.

use super::super::fonts::{is_known, list};
use super::super::scene::Scene;
use super::super::texts::{describe_leaf, parts, sentence};
use super::{Found, Sink, element_of};

pub fn missing(scene: &Scene, sink: &mut Sink) {
    let theme = &scene.deck.theme;
    for leaf in &scene.leaves {
        let mut seen: Vec<String> = Vec::new();
        for part in parts(scene, leaf) {
            for run in part.text.paragraphs.iter().flat_map(|p| p.runs.iter()) {
                let Some(family) = run.font.as_deref().map(str::trim).filter(|f| !f.is_empty())
                else {
                    continue;
                };
                if is_known(theme, family) || seen.iter().any(|s| s.eq_ignore_ascii_case(family)) {
                    continue;
                }
                seen.push(family.to_owned());
                sink.add(Found {
                    rule: "font-missing",
                    order: leaf.z + 1,
                    key: &format!("{}|{}", leaf.owner.map_or(leaf.el.id(), |o| o.id), family.to_ascii_lowercase()),
                    rank: 0.0,
                    element: Some(element_of(scene, leaf.unit)),
                    message: sentence(&format!(
                        "{} is set in \"{family}\", which is not available here, so another font is drawn in its place.",
                        describe_leaf(leaf)
                    )),
                    hint: &format!("Use a theme font (heading, body or code) or one of the bundled families: {}.", list()),
                });
            }
        }
    }
}
