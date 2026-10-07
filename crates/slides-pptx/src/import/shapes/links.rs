//! Hyperlinks: an address outside the file, or a jump to another slide.
//! Only web, mail and phone addresses are kept; a link that runs a program
//! or opens a file is left out, and said so.

use crate::import::cx::Cx;
use crate::import::dom::Node;
use crate::import::text::convert::TextSink;

/// The deck's form of an `a:hlinkClick`.
pub fn resolve(cx: &mut Cx, click: &Node) -> Option<String> {
    let action = click.attr("action").unwrap_or("");
    if let Some(jump) = action.strip_prefix("ppaction://hlinkshowjump") {
        return relative_jump(cx, jump);
    }
    let rel = click
        .attr("r:id")
        .filter(|id| !id.is_empty())
        .and_then(|id| cx.part.rels.get(id))
        .cloned();
    if action.starts_with("ppaction://") && !action.starts_with("ppaction://hlinksldjump") {
        if !action.starts_with("ppaction://noaction") {
            cx.warn(format!(
                "a link that does something PowerPoint-only ({action}) was left out"
            ));
        }
        return None;
    }
    let rel = rel?;
    if rel.external {
        return web_address(cx, &rel.target);
    }
    let part = cx.imp.pkg.target(&cx.part.name, &rel)?;
    match cx.env.slide_ids.get(&part) {
        Some(id) => Some(format!("slide:{id}")),
        None => {
            cx.warn("a link to something inside the file, but not a slide, was left out");
            None
        }
    }
}

fn relative_jump(cx: &mut Cx, query: &str) -> Option<String> {
    let jump = query
        .split(['?', '&'])
        .find_map(|kv| kv.strip_prefix("jump="))?;
    let parts = &cx.env.slide_parts;
    let at = parts.iter().position(|p| *p == cx.part.name)?;
    let target = match jump {
        "nextslide" => parts.get(at + 1),
        "previousslide" => at.checked_sub(1).and_then(|i| parts.get(i)),
        "firstslide" => parts.first(),
        "lastslide" => parts.last(),
        _ => None,
    }?;
    cx.env.slide_ids.get(target).map(|id| format!("slide:{id}"))
}

fn web_address(cx: &mut Cx, address: &str) -> Option<String> {
    let address = address.trim();
    let scheme = address.split_once(':').map(|(s, _)| s.to_ascii_lowercase());
    match scheme.as_deref() {
        Some("http" | "https" | "mailto" | "tel" | "ftp") => Some(address.to_owned()),
        Some(other) => {
            cx.warn(format!(
                "a link to `{other}:` was left out; only web, mail and phone addresses are kept"
            ));
            None
        }
        None => {
            cx.warn(format!(
                "the link `{address}` is not a web address and was left out"
            ));
            None
        }
    }
}

/// Lets a text body ask the import to resolve its links and to warn.
pub struct Sink<'c, 'x, 'a>(pub &'c mut Cx<'x, 'a>);

impl TextSink for Sink<'_, '_, '_> {
    fn link(&mut self, click: &Node) -> Option<String> {
        resolve(self.0, click)
    }

    fn warn(&mut self, message: &str) {
        self.0.warn_slide(message);
    }
}
