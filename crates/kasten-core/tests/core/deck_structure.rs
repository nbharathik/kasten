//! Text put together by a merge is checked before it is written: slide ids
//! that repeat, or a section that starts at a slide that is gone, are refused
//! the way a change that overlaps another is, and the deck stays as it was.
//! The merge an undo makes is held to the same rules.

use std::collections::BTreeMap;

use crate::common::NOW;
use crate::deck_support::{SIX, deck, edit, marked, open, pending, with_slide};

use kasten_core::agent::AgentOp;
use kasten_core::history::Actor;
use serde_json::{Value, json};

/// `text` with these sections, its keys in the order the Slides engine writes them.
fn with_sections(text: &str, sections: Value) -> String {
    let mut value: Value = serde_json::from_str(text).unwrap();
    value["sections"] = sections;
    let sorted: BTreeMap<String, Value> = value.as_object().unwrap().clone().into_iter().collect();
    let mut out = serde_json::to_string_pretty(&sorted).unwrap();
    out.push('\n');
    out
}

/// The six slides without the third.
fn without_c() -> String {
    deck("Tool use", &[SIX[0], SIX[1], SIX[3], SIX[4], SIX[5]])
}

fn section_at(id: &str, title: &str) -> Value {
    json!([{ "startsAt": id, "title": title }])
}

#[test]
fn a_section_the_agent_adds_at_a_slide_a_person_removed_meanwhile_is_refused() {
    let (_t, k, s, path, text) = open();
    let hash = k.deck(&path).unwrap().hash;
    let person = without_c();
    k.save_deck(&Actor::Human, &path, &person, &hash, NOW)
        .unwrap();
    // The agent worked from the six: the lines it adds and the lines the person removed do not touch.
    let agents = with_sections(&text, section_at("s-c", "Results"));
    let err = k
        .agent_run(&s, &edit(&path, &text, &agents), NOW)
        .unwrap_err()
        .to_string();
    assert!(
        err.starts_with(
            "The deck changed since this was made, and the two changes do not fit together"
        ),
        "{err}"
    );
    assert!(
        err.contains("section `Results` starts at `s-c`, which is not a slide"),
        "{err}"
    );
    assert_eq!(k.deck(&path).unwrap().text, person, "left alone");
    assert!(
        k.log(Some(&path), 5).unwrap().iter().all(|c| !c.agent),
        "the agent made no commit"
    );
}

#[test]
fn a_slide_the_agent_removes_under_a_section_a_person_added_meanwhile_is_refused() {
    let (_t, k, s, path, text) = open();
    let hash = k.deck(&path).unwrap().hash;
    let person = with_sections(&text, section_at("s-c", "Results"));
    k.save_deck(&Actor::Human, &path, &person, &hash, NOW)
        .unwrap();
    let err = k
        .agent_run(&s, &edit(&path, &text, &without_c()), NOW)
        .unwrap_err()
        .to_string();
    assert!(err.contains("do not fit together"), "{err}");
    assert!(
        err.contains("section `Results` starts at `s-c`, which is not a slide"),
        "{err}"
    );
    assert_eq!(k.deck(&path).unwrap().text, person);
}

#[test]
fn two_slides_of_one_id_made_at_the_same_time_are_refused() {
    let (_t, k, s, path, text) = open();
    let hash = k.deck(&path).unwrap().hash;
    // The person adds a slide at the end; the agent, from the six, adds one of the same id after the first.
    let person = with_slide(&text, "g", "The person's");
    k.save_deck(&Actor::Human, &path, &person, &hash, NOW)
        .unwrap();
    let agents = deck(
        "Tool use",
        &[
            SIX[0],
            ("g", "The agent's"),
            SIX[1],
            SIX[2],
            SIX[3],
            SIX[4],
            SIX[5],
        ],
    );
    let err = k
        .agent_run(&s, &edit(&path, &text, &agents), NOW)
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("do not fit together") && err.contains("a repeated id `s-g`"),
        "{err}"
    );
    assert_eq!(k.deck(&path).unwrap().text, person);
}

#[test]
fn accepting_is_refused_when_the_merge_would_leave_a_section_without_its_slide() {
    let (_t, k, s, path, text) = open();
    let four_gone = deck("Tool use", &SIX[4..]);
    let waiting = k
        .agent_run(&s, &edit(&path, &text, &four_gone), NOW)
        .unwrap();
    let id = pending(&waiting).0.to_owned();
    // While the proposal waits, the person starts a section at a slide it deletes.
    let hash = k.deck(&path).unwrap().hash;
    let person = with_sections(&text, section_at("s-c", "Data"));
    k.save_deck(&Actor::Human, &path, &person, &hash, NOW)
        .unwrap();
    let err = k.accept_proposal(&id, "me", NOW).unwrap_err().to_string();
    assert!(
        err.contains("do not fit together") && err.contains("section `Data` starts at `s-c`"),
        "{err}"
    );
    assert_eq!(k.deck(&path).unwrap().text, person, "left alone");
    assert_eq!(k.proposals().unwrap().len(), 1, "still there to decide");
    k.reject_proposal(&id, "me", NOW).unwrap();
}

#[test]
fn an_update_that_leaves_a_deck_the_tools_cannot_open_writes_nothing() {
    let (_t, k, s, path, text) = open();
    let twin = with_slide(&text, "a", "The id of the first again");
    let err = k
        .update_deck(&s.actor(), &path, "add_slide", "deck: edit", NOW, |_| {
            Ok(Some(twin.clone()))
        })
        .unwrap_err()
        .to_string();
    assert!(
        err.starts_with("Not a usable deck: ") && err.contains("a repeated id `s-a`"),
        "{err}"
    );
    assert_eq!(k.deck(&path).unwrap().text, text);
    assert!(k.log(Some(&path), 5).unwrap().iter().all(|c| !c.agent));
}

#[test]
fn a_change_whose_own_text_is_not_a_usable_deck_is_refused_whoever_is_trusted() {
    let (_t, k, s, path, text) = open();
    k.trust_session(&s.id, NOW.millis + 3_600_000).unwrap();
    let dangling = with_sections(&text, section_at("s-none", "Lost"));
    let err = k
        .agent_run(&s, &edit(&path, &text, &dangling), NOW)
        .unwrap_err()
        .to_string();
    assert!(
        err.starts_with("Not a usable deck: section `Lost` starts at `s-none`"),
        "{err}"
    );
    // The version with the agent's marks is the one it writes: held to the same rules.
    let fine = text.replace("Method", "Method, reworded");
    let op = marked(edit(&path, &text, &fine), &dangling);
    let err = k.agent_run(&s, &op, NOW).unwrap_err().to_string();
    assert!(err.starts_with("Not a usable deck: "), "{err}");
    // And so is a new deck.
    let made = AgentOp::CreateDeck {
        title: "Q3 review".into(),
        project: None,
        tool: "create_deck".into(),
        text: dangling,
        sent: 100,
        marked: None,
    };
    let err = k.agent_run(&s, &made, NOW).unwrap_err().to_string();
    assert!(err.starts_with("Not a usable deck: "), "{err}");
    assert!(k.decks().unwrap().iter().all(|d| !d.path.contains("q3")));
    assert_eq!(k.deck(&path).unwrap().text, text);
}

#[test]
fn undoing_is_stopped_when_taking_the_change_out_would_leave_a_section_without_its_slide() {
    let (_t, k, s, path, text) = open();
    let agents = with_slide(&text, "g", "Extra");
    let done = k.agent_run(&s, &edit(&path, &text, &agents), NOW).unwrap();
    assert!(matches!(done, kasten_core::Outcome::Done { .. }));
    // Later the person starts a section at the slide the agent added.
    let hash = k.deck(&path).unwrap().hash;
    let person = with_sections(&agents, section_at("s-g", "Extra part"));
    k.save_deck(&Actor::Human, &path, &person, &hash, NOW)
        .unwrap();

    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert!(undone.reverted.is_empty());
    let conflict = undone.conflict.expect("stopped");
    assert_eq!(conflict.path, path);
    assert!(
        conflict
            .detail
            .contains("would leave a deck that is not usable")
            && conflict
                .detail
                .contains("section `Extra part` starts at `s-g`"),
        "{}",
        conflict.detail
    );
    assert_eq!(k.deck(&path).unwrap().text, person, "left alone");
    let log = k.log(None, 5).unwrap();
    assert!(log.iter().all(|c| c.undoes.is_none()), "{log:?}");

    // Once the section is gone there is nothing in the way.
    let hash = k.deck(&path).unwrap().hash;
    k.save_deck(&Actor::Human, &path, &agents, &hash, NOW)
        .unwrap();
    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert_eq!(undone.conflict, None);
    assert_eq!(k.deck(&path).unwrap().text, text);
}

#[test]
fn a_persons_section_at_a_slide_that_stays_is_kept_when_the_session_is_undone() {
    let (_t, k, s, path, text) = open();
    let agents = with_slide(&text, "g", "Extra");
    k.agent_run(&s, &edit(&path, &text, &agents), NOW).unwrap();
    let hash = k.deck(&path).unwrap().hash;
    let person = with_sections(&agents, section_at("s-c", "Data"));
    k.save_deck(&Actor::Human, &path, &person, &hash, NOW)
        .unwrap();
    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert_eq!(undone.conflict, None, "{undone:?}");
    assert_eq!(
        k.deck(&path).unwrap().text,
        with_sections(&text, section_at("s-c", "Data")),
        "the agent's slide out, the person's section kept"
    );
}
