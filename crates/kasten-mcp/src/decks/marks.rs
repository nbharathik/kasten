//! The marks that badge an agent's work in a deck. The tools an agent works
//! through leave a deck as its operations made it; this says, from what
//! differs from the deck the tool read, which elements are the agent's work, in
//! the version of the deck that an agent's own write holds (kasten-core keeps
//! the plain version for a person who accepts the change in the review). An
//! agent never writes the marks itself: whatever its operations left in the
//! field is set aside.

use kasten_core::Instant;
use kasten_core::agent::Session;
use slides_core::canonical;
use slides_core::marks::{self, Author};

fn author(session: &Session, now: Instant) -> Author {
    Author {
        by: session.client.clone(),
        session: session.id.clone(),
        at: now.millis,
    }
}

/// `text`, the deck a tool made from `base`, with the marks of `session`'s work
/// in it; none when they change nothing, or when a text is not a deck.
pub(super) fn marked(base: &str, text: &str, session: &Session, now: Instant) -> Option<String> {
    let before = canonical::parse(base).ok()?;
    let mut after = canonical::parse(text).ok()?;
    marks::stamp(&before, &mut after, &author(session, now));
    let written = canonical::write(&after).ok()?;
    (written != text).then_some(written)
}

/// The same for a deck an agent made whole: everything in it is the agent's.
pub(super) fn marked_new(text: &str, session: &Session, now: Instant) -> Option<String> {
    let mut deck = canonical::parse(text).ok()?;
    marks::stamp_new(&mut deck, &author(session, now));
    let written = canonical::write(&deck).ok()?;
    (written != text).then_some(written)
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use slides_core::agent::{MemoryStore, Store};
    use slides_core::marks::{batches, marked_ids};

    use super::*;

    fn session() -> Session {
        Session::start("claude-code", Instant { millis: 1_000 })
    }

    /// A deck of an outline, as `create_deck` writes it.
    fn deck() -> String {
        let mut store = MemoryStore::new();
        let made = slides_core::agent::call(
            &mut store,
            "create_deck",
            json!({"outline": "# Talk\n\n## One\n- a\n- b\n\n## Two\n- c\n"}),
        )
        .unwrap();
        let name = made.data.unwrap()["deck"].as_str().unwrap().to_owned();
        store.read(&name).unwrap().text
    }

    #[test]
    fn a_deck_made_whole_is_all_the_agents_and_a_change_marks_what_it_changed() {
        let s = session();
        let plain = deck();
        let now = Instant { millis: 2_000 };
        let first = marked_new(&plain, &s, now).expect("marks");
        let parsed = canonical::parse(&first).unwrap();
        for slide in &parsed.slides {
            assert_eq!(
                marked_ids(slide).len(),
                slide.elements.len(),
                "{}",
                slide.id
            );
            assert!(
                batches(slide)
                    .iter()
                    .all(|b| b.by == "claude-code" && b.session == s.id)
            );
        }
        // A person accepts one slide's elements in the editor; then the agent changes another slide's notes only.
        let mut engine = slides_core::Engine::new(parsed, 1);
        let one = engine.deck().slides[1].id.clone();
        engine.apply("accept_marks", json!({"slide": one})).unwrap();
        let accepted = slides_core::canonical::write(engine.deck()).unwrap();
        let mut again = slides_core::Engine::new(engine.deck().clone(), 2);
        let two = again.deck().slides[2].id.clone();
        again
            .apply("set_notes", json!({"slide": two, "notes": "Said."}))
            .unwrap();
        let changed = canonical::write(again.deck()).unwrap();
        let after = marked(&accepted, &changed, &s, Instant { millis: 3_000 });
        // Notes are not elements: nothing new is marked, and what was accepted stays accepted.
        let text = after.unwrap_or(changed);
        let parsed = canonical::parse(&text).unwrap();
        assert!(marked_ids(parsed.slide(&one).unwrap()).is_empty());
        assert!(!marked_ids(parsed.slide(&two).unwrap()).is_empty());
    }

    #[test]
    fn a_text_that_is_not_a_deck_or_a_change_with_nothing_to_mark_gives_none() {
        let s = session();
        let plain = deck();
        assert_eq!(marked("nonsense", &plain, &s, Instant { millis: 1 }), None);
        assert_eq!(marked_new("nonsense", &s, Instant { millis: 1 }), None);
        // The deck as it was, unchanged, and unmarked before: nothing to mark.
        assert_eq!(marked(&plain, &plain, &s, Instant { millis: 1 }), None);
    }
}
