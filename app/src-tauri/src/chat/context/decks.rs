//! The chips for a slide deck and for the slide the person is looking at.

use kasten_core::Kasten;

use super::{Part, attr, quoted};

/// A slide deck: its outline and what it is made of, as the deck tools would give it.
pub(super) fn deck(kasten: &Kasten, path: &str) -> Part {
    match kasten_mcp::decks::context::deck_context(kasten, path) {
        Ok(read) => Part {
            name: format!("deck {}", quoted(&read.title)),
            open: format!(
                "<deck title=\"{}\" path=\"{}\">",
                attr(&read.title),
                attr(path)
            ),
            body: read.body,
            close: "</deck>".to_owned(),
        },
        Err(err) => Part {
            name: format!("deck {}", quoted(path)),
            open: format!("<deck path=\"{}\">", attr(path)),
            body: format!("(It could not be read: {err})"),
            close: "</deck>".to_owned(),
        },
    }
}

/// The slide the person is looking at: `refs` are the deck's path, the slide's id and the ids of the selected elements.
pub(super) fn slide(kasten: &Kasten, refs: &[String]) -> Part {
    let path = refs.first().map_or("", String::as_str);
    let id = refs.get(1).map_or("", String::as_str);
    let selected = refs.get(2..).unwrap_or_default();
    let open = format!("<slide deck=\"{}\" id=\"{}\">", attr(path), attr(id));
    let (name, body) = match kasten_mcp::decks::context::slide_context(kasten, path, id, selected) {
        Ok(read) => (
            format!("slide {} of {}", quoted(id), quoted(&read.title)),
            read.body,
        ),
        Err(err) => (
            format!("slide {}", quoted(id)),
            format!("(It could not be read: {err})"),
        ),
    };
    Part {
        name,
        open,
        body,
        close: "</slide>".to_owned(),
    }
}
