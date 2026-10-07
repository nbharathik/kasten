//! How a slide arrives is set by one operation, for one slide or many.

use serde_json::json;

use super::{add, bytes, engine, first_slide};
use crate::error::Error;
use crate::model::TransitionKind;

#[test]
fn sets_a_transition_on_each_slide_named() {
    let mut e = engine();
    let a = first_slide(&e);
    let b = add(&mut e, "title-only", json!({}));
    let c = add(&mut e, "title-only", json!({}));
    e.apply(
        "set_transition",
        json!({ "ids": [a, c], "transition": { "kind": "fade", "duration": 0.4 } }),
    )
    .unwrap();
    let fade = |id: &str| e.deck().slide(id).unwrap().transition.clone();
    assert_eq!(fade(&a).unwrap().kind, TransitionKind::Fade);
    assert_eq!(fade(&a).unwrap().duration, Some(0.4));
    assert_eq!(fade(&c), fade(&a));
    assert!(fade(&b).is_none(), "a slide not named is left alone");
}

#[test]
fn none_is_a_choice_and_null_takes_the_transition_away() {
    let mut e = engine();
    let a = first_slide(&e);
    e.apply(
        "set_transition",
        json!({ "ids": [a], "transition": { "kind": "none" } }),
    )
    .unwrap();
    assert_eq!(
        e.deck()
            .slide(&a)
            .unwrap()
            .transition
            .as_ref()
            .unwrap()
            .kind,
        TransitionKind::None,
        "'none' says the slide arrives with no transition, whatever the deck's default is"
    );
    e.apply("set_transition", json!({ "ids": [a], "transition": null }))
        .unwrap();
    assert!(e.deck().slide(&a).unwrap().transition.is_none());
    assert!(
        !bytes(e.deck()).contains("\"transition\""),
        "nothing is stored for it"
    );
}

#[test]
fn a_bad_duration_or_slide_is_refused_and_changes_nothing() {
    let mut e = engine();
    let a = first_slide(&e);
    let before = bytes(e.deck());
    for duration in [-1.0, 11.0] {
        let result = e.apply(
            "set_transition",
            json!({ "ids": [a], "transition": { "kind": "slide", "duration": duration } }),
        );
        assert!(result.is_err(), "duration {duration}");
    }
    assert!(matches!(
        e.apply(
            "set_transition",
            json!({ "ids": ["s-nope"], "transition": { "kind": "fade" } })
        ),
        Err(Error::NoSuchSlide { .. })
    ));
    assert_eq!(bytes(e.deck()), before);
    assert!(!e.can_undo(), "a refused operation is not a step of undo");
}

#[test]
fn a_transition_is_one_step_of_undo() {
    let mut e = engine();
    let a = first_slide(&e);
    let b = add(&mut e, "title-only", json!({}));
    let before = bytes(e.deck());
    e.apply(
        "set_transition",
        json!({ "ids": [a, b], "transition": { "kind": "morph" } }),
    )
    .unwrap();
    assert_ne!(bytes(e.deck()), before);
    e.undo().unwrap();
    assert_eq!(bytes(e.deck()), before);
}
