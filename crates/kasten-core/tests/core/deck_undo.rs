//! Undoing an agent session that worked on decks: its commits revert newest
//! first as new commits, back to the exact tree; a person's later edit to
//! other slides is kept, and one to the same lines stops the undo and says so.

use crate::common::NOW;
use crate::deck_support::{SIX, deck, edit, open, pending};

use kasten_core::Outcome;
use kasten_core::agent::AgentOp;
use kasten_core::assets::NewAsset;
use kasten_core::history::{Actor, History};

#[test]
fn undoing_a_session_takes_back_the_new_deck_the_edits_the_picture_and_the_trash() {
    let (t, k, s, path, text) = open();
    let h = History::open(t.vault.root()).unwrap().unwrap();
    let before = h.tree_id("HEAD").unwrap();

    // A new deck, two edits of the first, a picture, and a deck sent to the
    // trash and a large deletion that both waited for review.
    let made = AgentOp::CreateDeck {
        title: "Q3 review".into(),
        project: None,
        tool: "create_deck".into(),
        text: deck("Q3 review", &SIX[..2]),
        sent: 100,
        marked: None,
    };
    let Outcome::Done { result } = k.agent_run(&s, &made, NOW).unwrap() else {
        panic!()
    };
    let second = result["path"].as_str().unwrap().to_owned();
    let one = text.replace("Thanks", "Thank you");
    let two = one.replace("Intro", "Introduction");
    for (from, to) in [(&text, &one), (&one, &two)] {
        assert!(matches!(
            k.agent_run(&s, &edit(&path, from, to), NOW).unwrap(),
            Outcome::Done { .. }
        ));
    }
    k.add_asset(
        &s.actor(),
        "figure.png",
        &[7; 32],
        &NewAsset::default(),
        NOW,
    )
    .unwrap();
    let trash = AgentOp::Trash {
        path: second.clone(),
        reason: None,
    };
    let waiting = k.agent_run(&s, &trash, NOW).unwrap();
    let id = pending(&waiting).0.to_owned();
    k.accept_proposal(&id, "me", NOW).unwrap();
    let four_gone = deck("Tool use", &SIX[4..]).replace("Thanks", "Thank you");
    let waiting = k
        .agent_run(&s, &edit(&path, &two, &four_gone), NOW)
        .unwrap();
    assert!(matches!(waiting, Outcome::PendingReview { .. }));
    assert_ne!(h.tree_id("HEAD").unwrap(), before);

    let sessions = k.sessions(10).unwrap();
    assert_eq!(sessions[0].id, s.id);
    let commits = sessions[0].commits;
    assert!(commits >= 7, "{commits}");

    // What each of the agent's commits says about who made it and how.
    let log = k.log(None, 50).unwrap();
    let mine: Vec<_> = log
        .iter()
        .filter(|c| c.session.as_deref() == Some(s.id.as_str()))
        .collect();
    assert_eq!(mine.len(), commits);
    assert!(
        mine.iter()
            .all(|c| c.author == "agent:claude-code" && c.op.is_some())
    );
    assert!(mine.iter().any(|c| c.op.as_deref() == Some("create_deck")));
    assert!(
        mine.iter()
            .any(|c| c.op.as_deref() == Some("update_elements"))
    );
    assert!(mine.iter().any(|c| c.op.as_deref() == Some("add_asset")));
    assert!(mine.iter().any(|c| c.approved_by.as_deref() == Some("me")));

    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert_eq!(undone.conflict, None);
    assert_eq!(undone.reverted.len(), commits);
    assert_eq!(
        h.tree_id("HEAD").unwrap(),
        before,
        "undo must restore the exact tree"
    );
    assert_eq!(k.deck(&path).unwrap().text, text);
    assert!(k.deck(&second).is_err(), "the deck it made is gone");
    assert!(k.sessions(10).unwrap()[0].undone);
    let last = &k.log(None, 1).unwrap()[0];
    assert!(last.summary.starts_with("undo: "), "{}", last.summary);
    assert!(last.undoes.is_some());
    assert!(last.message.contains("Kasten-Undo: "), "{}", last.message);
    assert!(
        k.proposals().unwrap().is_empty(),
        "the waiting proposal went with the session"
    );
}

#[test]
fn a_persons_edit_to_other_slides_is_kept_when_the_session_is_undone() {
    let (_t, k, s, path, text) = open();
    let agent = text.replace("Method", "Method, reworded");
    assert!(matches!(
        k.agent_run(&s, &edit(&path, &text, &agent), NOW).unwrap(),
        Outcome::Done { .. }
    ));
    let agent_commit = k.log(Some(&path), 1).unwrap()[0].id.clone();
    // Later the person retitles a slide the agent did not touch.
    let hash = k.deck(&path).unwrap().hash;
    let person = agent.replace("Thanks", "Thank you");
    k.save_deck(&Actor::Human, &path, &person, &hash, NOW)
        .unwrap();

    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert_eq!(undone.conflict, None);
    let now_there = k.deck(&path).unwrap().text;
    assert_eq!(
        now_there,
        text.replace("Thanks", "Thank you"),
        "the agent's change out, the person's kept"
    );
    let last = &k.log(None, 1).unwrap()[0];
    assert_eq!(last.undoes.as_deref(), Some(agent_commit.as_str()));
}

#[test]
fn a_persons_edit_to_the_same_lines_stops_the_undo_and_says_so() {
    let (_t, k, s, path, text) = open();
    let agent = text.replace("Method", "Method, reworded");
    assert!(matches!(
        k.agent_run(&s, &edit(&path, &text, &agent), NOW).unwrap(),
        Outcome::Done { .. }
    ));
    let hash = k.deck(&path).unwrap().hash;
    let person = agent.replace("Method, reworded", "Method, by a person");
    k.save_deck(&Actor::Human, &path, &person, &hash, NOW)
        .unwrap();

    let undone = k.undo_session(&s.id, NOW).unwrap();
    assert!(undone.reverted.is_empty());
    let conflict = undone.conflict.expect("stopped");
    assert_eq!(conflict.path, path);
    assert!(
        conflict.detail.contains("edited on the same lines"),
        "{}",
        conflict.detail
    );
    assert!(
        conflict.summary.starts_with("deck: edit Tool use"),
        "{}",
        conflict.summary
    );
    assert_eq!(
        k.deck(&path).unwrap().text,
        person,
        "the person's version stays"
    );
    // The person's own edit was put in history first, as theirs; no undo was made.
    let log = k.log(None, 3).unwrap();
    assert!(log.iter().all(|c| c.undoes.is_none()), "{log:?}");
    assert!(!log[0].agent, "{:?}", log[0]);
    assert!(!k.sessions(10).unwrap()[0].undone);
}
