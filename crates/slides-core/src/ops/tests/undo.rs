//! The property that matters most: whatever is done to a deck, undoing it
//! puts back exactly the bytes there were, redoing gives the bytes there were
//! after, and the changes an operation reports are enough to bring a copy of
//! the deck up to date.

use proptest::prelude::*;
use serde_json::{Value, json};

use super::bytes;
use crate::canonical;
use crate::model::Deck;
use crate::ops::{Changes, Engine};

#[derive(Clone, Debug)]
enum Action {
    AddSlide {
        layout: usize,
    },
    AddText {
        slide: usize,
        x: u16,
        y: u16,
    },
    Transform {
        slide: usize,
        el: usize,
        x: u16,
        y: u16,
        w: u16,
        turn: u8,
    },
    Delete {
        slide: usize,
        el: usize,
    },
    Duplicate {
        slide: usize,
        el: usize,
    },
    Group {
        slide: usize,
        a: usize,
        b: usize,
    },
    Ungroup {
        slide: usize,
        el: usize,
    },
    Reorder {
        slide: usize,
        el: usize,
        to: u8,
    },
    Align {
        slide: usize,
        a: usize,
        b: usize,
        mode: u8,
    },
    SetText {
        slide: usize,
        el: usize,
        n: u8,
    },
    Layout {
        slide: usize,
        layout: usize,
    },
    DeleteSlide {
        slide: usize,
    },
    DuplicateSlide {
        slide: usize,
    },
    MoveSlide {
        slide: usize,
        to: usize,
    },
    Flags {
        slide: usize,
        hidden: bool,
        backup: bool,
    },
    Theme {
        i: usize,
    },
    Notes {
        slide: usize,
        n: u8,
    },
    SetSteps {
        slide: usize,
        n: u8,
    },
    States {
        slide: usize,
        el: usize,
        step: u8,
        state: u8,
    },
    Build {
        slide: usize,
        a: usize,
        b: usize,
        recipe: u8,
    },
    AddComposite {
        slide: usize,
        kind: u8,
    },
    Expand {
        slide: usize,
        el: usize,
    },
    AddSection {
        slide: usize,
        n: u8,
    },
    RenameSection {
        slide: usize,
        n: u8,
    },
    RemoveSection {
        slide: usize,
    },
    Replace,
    Undo,
    Redo,
}

fn action() -> impl Strategy<Value = Action> {
    let idx = || 0usize..8;
    prop_oneof![
        idx().prop_map(|layout| Action::AddSlide { layout }),
        (idx(), 0u16..900, 0u16..500).prop_map(|(slide, x, y)| Action::AddText { slide, x, y }),
        (idx(), idx(), 0u16..900, 0u16..500, 1u16..400, 0u8..4).prop_map(
            |(slide, el, x, y, w, turn)| Action::Transform {
                slide,
                el,
                x,
                y,
                w,
                turn
            }
        ),
        (idx(), idx()).prop_map(|(slide, el)| Action::Delete { slide, el }),
        (idx(), idx()).prop_map(|(slide, el)| Action::Duplicate { slide, el }),
        (idx(), idx(), idx()).prop_map(|(slide, a, b)| Action::Group { slide, a, b }),
        (idx(), idx()).prop_map(|(slide, el)| Action::Ungroup { slide, el }),
        (idx(), idx(), 0u8..4).prop_map(|(slide, el, to)| Action::Reorder { slide, el, to }),
        (idx(), idx(), idx(), 0u8..6).prop_map(|(slide, a, b, mode)| Action::Align {
            slide,
            a,
            b,
            mode
        }),
        (idx(), idx(), 0u8..5).prop_map(|(slide, el, n)| Action::SetText { slide, el, n }),
        (idx(), idx()).prop_map(|(slide, layout)| Action::Layout { slide, layout }),
        idx().prop_map(|slide| Action::DeleteSlide { slide }),
        idx().prop_map(|slide| Action::DuplicateSlide { slide }),
        (idx(), idx()).prop_map(|(slide, to)| Action::MoveSlide { slide, to }),
        (idx(), any::<bool>(), any::<bool>()).prop_map(|(slide, hidden, backup)| Action::Flags {
            slide,
            hidden,
            backup
        }),
        idx().prop_map(|i| Action::Theme { i }),
        (idx(), 0u8..3).prop_map(|(slide, n)| Action::Notes { slide, n }),
        (idx(), 0u8..8).prop_map(|(slide, n)| Action::SetSteps { slide, n }),
        (idx(), idx(), 0u8..7, 0u8..5).prop_map(|(slide, el, step, state)| Action::States {
            slide,
            el,
            step,
            state
        }),
        (idx(), idx(), idx(), 0u8..4).prop_map(|(slide, a, b, recipe)| Action::Build {
            slide,
            a,
            b,
            recipe
        }),
        (idx(), 0u8..9).prop_map(|(slide, kind)| Action::AddComposite { slide, kind }),
        (idx(), idx()).prop_map(|(slide, el)| Action::Expand { slide, el }),
        (idx(), 0u8..3).prop_map(|(slide, n)| Action::AddSection { slide, n }),
        (idx(), 0u8..3).prop_map(|(slide, n)| Action::RenameSection { slide, n }),
        idx().prop_map(|slide| Action::RemoveSection { slide }),
        Just(Action::Replace),
        Just(Action::Undo),
        Just(Action::Redo),
    ]
}

/// The operation an action stands for on this deck, if it names things that exist.
fn plan(deck: &Deck, action: &Action) -> Option<(&'static str, Value)> {
    let slide = |i: usize| deck.slides.get(i % deck.slides.len().max(1));
    let element = |s: usize, i: usize| {
        slide(s).and_then(|sl| {
            sl.elements
                .get(i % sl.elements.len().max(1))
                .map(|e| (sl.id.clone(), e.id().to_owned()))
        })
    };
    Some(match action {
        Action::AddSlide { layout } => (
            "add_slide",
            json!({ "layout": deck.theme.layouts[layout % deck.theme.layouts.len()].name }),
        ),
        Action::AddText { slide: s, x, y } => (
            "add_elements",
            json!({ "slide": slide(*s)?.id, "elements": [{ "type": "text", "x": x, "y": y, "w": 120, "h": 40, "text": { "paragraphs": [{ "runs": [{ "t": "hi" }] }] } }] }),
        ),
        Action::Transform {
            slide: s,
            el,
            x,
            y,
            w,
            turn,
        } => {
            let (sl, e) = element(*s, *el)?;
            (
                "transform_elements",
                json!({ "slide": sl, "items": [{ "id": e, "x": x, "y": y, "w": w, "rotation": f64::from(*turn) * 30.0 }] }),
            )
        }
        Action::Delete { slide: s, el } => {
            let (sl, e) = element(*s, *el)?;
            ("delete_elements", json!({ "slide": sl, "ids": [e] }))
        }
        Action::Duplicate { slide: s, el } => {
            let (sl, e) = element(*s, *el)?;
            ("duplicate_elements", json!({ "slide": sl, "ids": [e] }))
        }
        Action::Group { slide: s, a, b } => {
            let (sl, ea) = element(*s, *a)?;
            let (_, eb) = element(*s, *b)?;
            ("group_elements", json!({ "slide": sl, "ids": [ea, eb] }))
        }
        Action::Ungroup { slide: s, el } => {
            let (sl, e) = element(*s, *el)?;
            ("ungroup_element", json!({ "slide": sl, "id": e }))
        }
        Action::Reorder { slide: s, el, to } => {
            let (sl, e) = element(*s, *el)?;
            let to = ["front", "back", "forward", "backward"][usize::from(*to)];
            (
                "reorder_elements",
                json!({ "slide": sl, "ids": [e], "to": to }),
            )
        }
        Action::Align {
            slide: s,
            a,
            b,
            mode,
        } => {
            let (sl, ea) = element(*s, *a)?;
            let (_, eb) = element(*s, *b)?;
            let mode = ["left", "centerH", "right", "top", "middleV", "bottom"][usize::from(*mode)];
            (
                "align_elements",
                json!({ "slide": sl, "ids": [ea, eb], "mode": mode }),
            )
        }
        Action::SetText { slide: s, el, n } => {
            let (sl, e) = element(*s, *el)?;
            let markdown = ["one", "**two** words", "- a\n- b", "", "x *y* z"][usize::from(*n)];
            (
                "set_text",
                json!({ "slide": sl, "id": e, "markdown": markdown }),
            )
        }
        Action::Layout { slide: s, layout } => (
            "set_layout",
            json!({ "slide": slide(*s)?.id, "layout": deck.theme.layouts[layout % deck.theme.layouts.len()].name }),
        ),
        Action::DeleteSlide { slide: s } => ("delete_slides", json!({ "ids": [slide(*s)?.id] })),
        Action::DuplicateSlide { slide: s } => {
            ("duplicate_slides", json!({ "ids": [slide(*s)?.id] }))
        }
        Action::MoveSlide { slide: s, to } => {
            ("move_slides", json!({ "ids": [slide(*s)?.id], "to": to }))
        }
        Action::Flags {
            slide: s,
            hidden,
            backup,
        } => (
            "set_slide_flags",
            json!({ "ids": [slide(*s)?.id], "hidden": hidden, "backup": backup }),
        ),
        Action::Theme { i } => (
            "apply_theme",
            json!({ "name": crate::themes::all()[i % crate::themes::all().len()].name }),
        ),
        Action::Notes { slide: s, n } => {
            let notes = ["", "note", "a note about it"][usize::from(*n)];
            (
                "set_notes",
                json!({ "slide": slide(*s)?.id, "notes": notes }),
            )
        }
        Action::SetSteps { slide: s, n } => (
            "set_slide_steps",
            json!({ "slide": slide(*s)?.id, "steps": n }),
        ),
        Action::States {
            slide: s,
            el,
            step,
            state,
        } => {
            let (sl, e) = element(*s, *el)?;
            let state = ["hidden", "dimmed", "normal", "highlighted"]
                .get(usize::from(*state))
                .map_or(Value::Null, |name| json!(name));
            (
                "set_step_states",
                json!({ "slide": sl, "id": e, "states": { step.to_string(): state } }),
            )
        }
        Action::Build {
            slide: s,
            a,
            b,
            recipe,
        } => {
            let (sl, ea) = element(*s, *a)?;
            let (_, eb) = element(*s, *b)?;
            let recipe = ["reveal", "walkthrough", "spotlight", "clear"][usize::from(*recipe)];
            (
                "build_steps",
                json!({ "slide": sl, "ids": [ea, eb], "recipe": recipe }),
            )
        }
        Action::AddComposite { slide: s, kind } => (
            "add_elements",
            json!({ "slide": slide(*s)?.id, "elements": [super::composites::sample(*kind)] }),
        ),
        Action::Expand { slide: s, el } => {
            let (sl, e) = element(*s, *el)?;
            ("expand_composite", json!({ "slide": sl, "id": e }))
        }
        Action::AddSection { slide: s, n } => (
            "add_section",
            json!({ "at": slide(*s)?.id, "title": format!("Section {n}") }),
        ),
        Action::RenameSection { slide: s, n } => (
            "rename_section",
            json!({ "at": slide(*s)?.id, "title": format!("Renamed {n}") }),
        ),
        Action::RemoveSection { slide: s } => ("remove_section", json!({ "at": slide(*s)?.id })),
        Action::Replace => ("replace_all", json!({ "find": "hi", "replace": "yo" })),
        Action::Undo | Action::Redo => return None,
    })
}

fn check_mirror(mirror: &mut Deck, changes: &Changes, engine: &Engine) {
    changes.apply_to(mirror);
    assert_eq!(
        bytes(mirror),
        bytes(engine.deck()),
        "the reported changes bring a copy up to date"
    );
}

fn run(actions: &[Action]) {
    let mut engine = Engine::create("Property", "Light", 7).unwrap();
    let mut mirror = engine.deck().clone();
    let mut states = vec![bytes(engine.deck())];
    let mut at = 0;
    for action in actions {
        match action {
            Action::Undo => match engine.undo() {
                Some(changes) => {
                    assert!(at > 0, "an undo happened with nothing to undo");
                    at -= 1;
                    assert_eq!(
                        bytes(engine.deck()),
                        states[at],
                        "undo restores the bytes exactly"
                    );
                    check_mirror(&mut mirror, &changes, &engine);
                }
                None => assert_eq!(at, 0),
            },
            Action::Redo => match engine.redo() {
                Some(changes) => {
                    at += 1;
                    assert_eq!(
                        bytes(engine.deck()),
                        states[at],
                        "redo restores the bytes exactly"
                    );
                    check_mirror(&mut mirror, &changes, &engine);
                }
                None => assert_eq!(at + 1, states.len(), "a redo was possible"),
            },
            other => {
                let Some((name, input)) = plan(engine.deck(), other) else {
                    continue;
                };
                let before = bytes(engine.deck());
                match engine.apply(name, input) {
                    Ok(applied) => {
                        canonical::check_structure(engine.deck())
                            .unwrap_or_else(|e| panic!("{name} broke the deck: {e}"));
                        let text = bytes(engine.deck());
                        assert_eq!(
                            bytes(&canonical::parse(&text).unwrap()),
                            text,
                            "{name} left the deck writing back differently"
                        );
                        check_mirror(&mut mirror, &applied.changes, &engine);
                        if text != before {
                            states.truncate(at + 1);
                            states.push(text);
                            at += 1;
                        }
                    }
                    Err(_) => assert_eq!(
                        bytes(engine.deck()),
                        before,
                        "{name} failed and still changed the deck"
                    ),
                }
            }
        }
    }
    // Undo everything, then redo everything.
    let last = states.len() - 1;
    while engine.undo().is_some() {}
    assert_eq!(bytes(engine.deck()), states[0]);
    while engine.redo().is_some() {}
    assert_eq!(bytes(engine.deck()), states[last.min(states.len() - 1)]);
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 96, ..ProptestConfig::default() })]

    #[test]
    fn any_run_of_operations_can_be_undone_and_redone_exactly(actions in proptest::collection::vec(action(), 1..40)) {
        run(&actions);
    }
}
