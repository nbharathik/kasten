//! The limit on slides an agent takes out of decks: added up over the
//! session's last ten minutes and not weighed one call at a time; a slide
//! left with nothing on it counts as taken out, since its id is still there;
//! a batch that replaces the deck counts every slide it replaces; and no
//! trust lifts it.

use crate::common::{self, NOW, dev_vault};
use crate::deck_support::{Slide, deck, edit, pending, with_slide};

use kasten_core::agent::{AgentOp, Session};
use kasten_core::history::Actor;
use kasten_core::{Instant, Kasten, Outcome};
use serde_json::{Value, json};

const TWELVE: [Slide<'static>; 12] = [
    ("a", "One"),
    ("b", "Two"),
    ("c", "Three"),
    ("d", "Four"),
    ("e", "Five"),
    ("f", "Six"),
    ("g", "Seven"),
    ("h", "Eight"),
    ("i", "Nine"),
    ("j", "Ten"),
    ("k", "Eleven"),
    ("l", "Twelve"),
];

/// A vault with history, an agent session, and a deck of twelve slides made
/// by a person; returns the deck's path and text.
fn open() -> (common::TempVault, Kasten, Session, String, String) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let s = Session::start("claude-code", NOW);
    let text = deck("Twelve", &TWELVE);
    let path = k
        .create_deck(&Actor::Human, "Twelve", None, &text, NOW)
        .unwrap();
    (t, k, s, path, text)
}

/// The deck without the slides `gone`.
fn without(gone: &[&str]) -> String {
    let left: Vec<Slide> = TWELVE
        .iter()
        .copied()
        .filter(|(id, _)| !gone.contains(id))
        .collect();
    deck("Twelve", &left)
}

/// `text` with the slides `ids` left with no elements, as `delete_elements` leaves them.
fn bare(text: &str, ids: &[&str]) -> String {
    let mut value: Value = serde_json::from_str(text).unwrap();
    for slide in value["slides"].as_array_mut().unwrap() {
        let id = slide["id"].as_str().unwrap().trim_start_matches("s-");
        if ids.contains(&id) {
            slide["elements"] = json!([]);
        }
    }
    let mut out = serde_json::to_string_pretty(&value).unwrap();
    out.push('\n');
    out
}

/// The same edit, made by another tool.
fn by(tool: &str, mut op: AgentOp) -> AgentOp {
    if let AgentOp::EditDeck { tool: name, .. } = &mut op {
        *name = tool.to_owned();
    }
    op
}

fn minutes(n: u64) -> Instant {
    Instant {
        millis: NOW.millis + n * 60_000,
    }
}

fn is_done(outcome: &Outcome) -> bool {
    matches!(outcome, Outcome::Done { .. })
}

#[test]
fn removals_add_up_over_calls_and_the_window_moves_on() {
    let (_t, k, s, path, text) = open();
    let three = without(&["a", "b", "c"]);
    let six = without(&["a", "b", "c", "d", "e", "f"]);
    // Three at once is within the limit; three more a moment later are six.
    let first = k.agent_run(&s, &edit(&path, &text, &three), NOW).unwrap();
    assert!(is_done(&first), "{first:?}");
    let second = k
        .agent_run(&s, &edit(&path, &three, &six), minutes(2))
        .unwrap();
    let reason = pending(&second).1;
    assert!(
        reason.contains("already took 3 slides out of decks in the last 10 minutes")
            && reason.contains("would make 6")
            && reason.contains("the limit is 3"),
        "{reason}"
    );
    assert_eq!(
        k.deck(&path).unwrap().text,
        three,
        "the second was not written"
    );
    // Eleven minutes after the first, it has left the window: the second is three.
    let third = k
        .agent_run(&s, &edit(&path, &three, &six), minutes(11))
        .unwrap();
    assert!(is_done(&third), "{third:?}");
    assert_eq!(k.deck(&path).unwrap().text, six);
}

#[test]
fn one_slide_at_a_time_is_no_way_round_it() {
    let (_t, k, s, path, text) = open();
    let mut from = text;
    for n in 1..=3 {
        let to = without(&["a", "b", "c"][..n]);
        let outcome = k.agent_run(&s, &edit(&path, &from, &to), NOW).unwrap();
        assert!(is_done(&outcome), "{n}: {outcome:?}");
        from = to;
    }
    let fourth = without(&["a", "b", "c", "d"]);
    let outcome = k.agent_run(&s, &edit(&path, &from, &fourth), NOW).unwrap();
    let reason = pending(&outcome).1;
    assert!(
        reason.contains("already took 3 slides") && reason.contains("would make 4"),
        "{reason}"
    );
    // Another session has its own count.
    let other = Session::start("another-agent", minutes(1));
    let outcome = k
        .agent_run(&other, &edit(&path, &from, &fourth), minutes(1))
        .unwrap();
    assert!(is_done(&outcome), "{outcome:?}");
}

#[test]
fn a_change_alone_over_the_limit_is_told_as_one_change() {
    let (_t, k, s, path, text) = open();
    let outcome = k
        .agent_run(
            &s,
            &edit(&path, &text, &without(&["a", "b", "c", "d"])),
            NOW,
        )
        .unwrap();
    assert_eq!(
        pending(&outcome).1,
        "Removes 4 slides in one change (the limit is 3)"
    );
}

#[test]
fn a_slide_left_with_nothing_on_it_counts_as_taken_out() {
    let (_t, k, s, path, text) = open();
    // One `delete_elements` call with hundreds of operations, on five slides.
    let five = bare(&text, &["a", "b", "c", "d", "e"]);
    let mut op = by("delete_elements", edit(&path, &text, &five));
    if let AgentOp::EditDeck { sent, .. } = &mut op {
        *sent = 200 * 60;
    }
    let outcome = k.agent_run(&s, &op, NOW).unwrap();
    assert_eq!(
        pending(&outcome).1,
        "Removes or empties 5 slides in one change (the limit is 3)"
    );
    assert_eq!(k.deck(&path).unwrap().text, text, "nothing was written");

    // Three are within the limit; a fourth after them is not, however it is done.
    let three = bare(&text, &["a", "b", "c"]);
    let op = by("delete_elements", edit(&path, &text, &three));
    let first = k.agent_run(&s, &op, NOW).unwrap();
    assert!(is_done(&first), "{first:?}");
    let four = bare(&three, &["d"]);
    let op = by("delete_elements", edit(&path, &three, &four));
    let outcome = k.agent_run(&s, &op, NOW).unwrap();
    let reason = pending(&outcome).1;
    assert!(
        reason.contains("already took 3 slides") && reason.contains("would make 4"),
        "{reason}"
    );
}

#[test]
fn a_batch_that_replaces_the_deck_counts_every_slide_it_replaces() {
    let (_t, k, s, path, text) = open();
    let all = TWELVE.map(|(id, _)| id);
    // The same slide ids with nothing on them.
    let blank = bare(&text, &all);
    let outcome = k
        .agent_run(&s, &by("replace_deck", edit(&path, &text, &blank)), NOW)
        .unwrap();
    assert_eq!(
        pending(&outcome).1,
        "Replaces 12 slides in one change (the limit is 3)"
    );
    // The same slide ids with other words on every one of them.
    let rewritten: Vec<Slide> = TWELVE.iter().map(|(id, _)| (*id, "Rewritten")).collect();
    let rewritten = deck("Twelve", &rewritten);
    let outcome = k
        .agent_run(&s, &by("replace_deck", edit(&path, &text, &rewritten)), NOW)
        .unwrap();
    assert_eq!(
        pending(&outcome).1,
        "Replaces 12 slides in one change (the limit is 3)"
    );
    assert_eq!(k.deck(&path).unwrap().text, text, "nothing was written");

    // Slides it leaves as they were are not replaced: two of twelve is within the limit, four is not.
    let mut two: Vec<Slide> = TWELVE.to_vec();
    two[0].1 = "Uno";
    two[1].1 = "Dos";
    let two = deck("Twelve", &two);
    let outcome = k
        .agent_run(&s, &by("replace_deck", edit(&path, &text, &two)), NOW)
        .unwrap();
    assert!(is_done(&outcome), "{outcome:?}");
    let mut four: Vec<Slide> = TWELVE.to_vec();
    four[0].1 = "Uno";
    four[1].1 = "Dos";
    four[2].1 = "Tres";
    four[3].1 = "Cuatro";
    let four = deck("Twelve", &four);
    let outcome = k
        .agent_run(&s, &by("replace_deck", edit(&path, &two, &four)), NOW)
        .unwrap();
    let reason = pending(&outcome).1;
    assert!(
        reason.contains("already took 2 slides") && reason.contains("would make 4"),
        "{reason}"
    );

    // An edit of words that is not a replacement is not taking slides out, however many it touches.
    let outcome = k
        .agent_run(&s, &edit(&path, &two, &rewritten), NOW)
        .unwrap();
    assert!(is_done(&outcome), "{outcome:?}");
    assert_eq!(k.deck(&path).unwrap().text, rewritten);
}

#[test]
fn trust_lifts_none_of_it() {
    let (_t, k, s, path, text) = open();
    k.trust_session(&s.id, NOW.millis + 3_600_000).unwrap();
    assert!(k.trusted(&s.id, NOW));
    let three = without(&["a", "b", "c"]);
    let first = k.agent_run(&s, &edit(&path, &text, &three), NOW).unwrap();
    assert!(is_done(&first), "{first:?}");
    // Three more are six, whoever is trusted.
    let six = without(&["a", "b", "c", "d", "e", "f"]);
    let second = k.agent_run(&s, &edit(&path, &three, &six), NOW).unwrap();
    assert!(pending(&second).1.contains("would make 6"));
    // So is emptying slides, and so is replacing them.
    let bare_four = bare(&three, &["d", "e", "f", "g"]);
    let emptied = k
        .agent_run(
            &s,
            &by("delete_elements", edit(&path, &three, &bare_four)),
            NOW,
        )
        .unwrap();
    assert!(
        pending(&emptied).1.contains("would make 7"),
        "{:?}",
        pending(&emptied)
    );
    let mut words: Vec<Slide> = TWELVE.to_vec();
    words.drain(..3);
    let words: Vec<Slide> = words.iter().map(|(id, _)| (*id, "Rewritten")).collect();
    let replaced = k
        .agent_run(
            &s,
            &by("replace_deck", edit(&path, &three, &deck("Twelve", &words))),
            NOW,
        )
        .unwrap();
    assert!(
        pending(&replaced).1.contains("the limit is 3"),
        "{:?}",
        pending(&replaced)
    );
    assert_eq!(
        k.deck(&path).unwrap().text,
        three,
        "only the first was written"
    );
}

#[test]
fn a_modest_edit_is_as_before() {
    let (_t, k, s, path, text) = open();
    // Two slides reworded, one added and one removed: nothing to review.
    let reworded = text.replace("Two", "Second").replace("Three", "Third");
    let added = with_slide(&reworded, "m", "Thirteen");
    let one_less = {
        let mut slides: Vec<Slide> = TWELVE.to_vec();
        slides[1].1 = "Second";
        slides[2].1 = "Third";
        slides.pop();
        with_slide(&deck("Twelve", &slides), "m", "Thirteen")
    };
    for (from, to) in [(&text, &reworded), (&reworded, &added), (&added, &one_less)] {
        let outcome = k.agent_run(&s, &edit(&path, from, to), NOW).unwrap();
        assert!(is_done(&outcome), "{outcome:?}");
    }
    assert_eq!(k.deck(&path).unwrap().text, one_less);
    assert!(k.proposals().unwrap().is_empty());
}

#[test]
fn what_a_person_accepted_is_not_counted_against_the_session() {
    let (_t, k, s, path, text) = open();
    let five = without(&["a", "b", "c", "d", "e"]);
    let waiting = k.agent_run(&s, &edit(&path, &text, &five), NOW).unwrap();
    let id = pending(&waiting).0.to_owned();
    k.accept_proposal(&id, "me", NOW).unwrap();
    assert_eq!(k.deck(&path).unwrap().text, five);
    // The person looked at those five; the session's own count is still nothing.
    let eight = without(&["a", "b", "c", "d", "e", "f", "g", "h"]);
    let outcome = k.agent_run(&s, &edit(&path, &five, &eight), NOW).unwrap();
    assert!(is_done(&outcome), "{outcome:?}");
    let nine = without(&["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    let outcome = k.agent_run(&s, &edit(&path, &eight, &nine), NOW).unwrap();
    assert!(pending(&outcome).1.contains("would make 4"));
}

#[test]
fn the_count_is_of_what_the_write_takes_out_of_the_deck_as_it_is() {
    let (_t, k, s, path, text) = open();
    // While the agent works from the twelve, a person removes two slides.
    let hash = k.deck(&path).unwrap().hash;
    k.save_deck(&Actor::Human, &path, &without(&["c", "d"]), &hash, NOW)
        .unwrap();
    // The agent's change removes those two and two others: on the deck as it is, two.
    let agents = without(&["c", "d", "i", "j"]);
    let outcome = k.agent_run(&s, &edit(&path, &text, &agents), NOW).unwrap();
    assert!(is_done(&outcome), "{outcome:?}");
    assert_eq!(k.deck(&path).unwrap().text, agents);
    // Two are counted: one more fits, and the next does not.
    let e_gone = without(&["c", "d", "e", "i", "j"]);
    let outcome = k
        .agent_run(&s, &edit(&path, &agents, &e_gone), NOW)
        .unwrap();
    assert!(is_done(&outcome), "{outcome:?}");
    let f_gone = without(&["c", "d", "e", "f", "i", "j"]);
    let outcome = k
        .agent_run(&s, &edit(&path, &e_gone, &f_gone), NOW)
        .unwrap();
    assert!(pending(&outcome).1.contains("would make 4"));
}
