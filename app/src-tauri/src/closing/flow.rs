//! What a request to hide the window, quit or restart does, given what is
//! already under way, as a pure state machine. The Tauri glue in `mod.rs`
//! feeds it events and carries out what it answers.
//!
//! A request is held while the page writes its waiting typing. It then
//! happens when the page says it has written, or when the grace time runs
//! out, whichever comes first. Asking the same thing again does it at once,
//! as the way out of a page that never answers.

/// What happens once the page has written.
///
/// Stronger ones win over weaker ones asked while a write is under way:
/// quitting during a hide quits, and restarting during a quit restarts.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Then {
    /// The window goes to the tray; the app keeps running.
    Hide,
    /// The app ends.
    Quit,
    /// The app ends and starts again, on another vault or a new version.
    Restart,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum Phase {
    /// Nothing is under way.
    #[default]
    Open,
    /// The page was asked to write, and `then` follows. `round` tells this
    /// wait's grace time from an earlier one's.
    Writing { then: Then, round: u32 },
    /// The app is ending: nothing is held any more.
    Ending,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    /// The person or the app asks for `Then`.
    Asked(Then),
    /// The page says its typing is written.
    Written,
    /// The grace time of wait `round` is over.
    GraceOver(u32),
}

/// What to do about an event.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Act {
    Nothing,
    /// Ask the page to write, and start wait `round`'s grace time.
    AskPage {
        round: u32,
    },
    /// Do it now.
    Do(Then),
}

/// The answer to an event: what to do, and, for a request that came from
/// the system (the window's close button, Cmd+Q), whether to hold it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Step {
    pub hold: bool,
    pub act: Act,
}

impl Step {
    const fn held(act: Act) -> Step {
        Step { hold: true, act }
    }
    const fn passed() -> Step {
        Step {
            hold: false,
            act: Act::Nothing,
        }
    }
}

/// The state machine: where the flow is, and how many waits it has had.
#[derive(Debug, Default)]
pub struct Flow {
    phase: Phase,
    rounds: u32,
}

impl Flow {
    pub const fn new() -> Flow {
        Flow {
            phase: Phase::Open,
            rounds: 0,
        }
    }

    /// Takes an event and says what to do.
    pub fn on(&mut self, event: Event) -> Step {
        match (self.phase, event) {
            (Phase::Open, Event::Asked(then)) => {
                self.rounds = self.rounds.wrapping_add(1);
                let round = self.rounds;
                self.phase = Phase::Writing { then, round };
                Step::held(Act::AskPage { round })
            }
            (Phase::Writing { then, round }, Event::Asked(asked)) => {
                if asked == then {
                    // Asked again: the page had its chance.
                    self.finish(then)
                } else {
                    self.phase = Phase::Writing {
                        then: then.max(asked),
                        round,
                    };
                    Step::held(Act::Nothing)
                }
            }
            (Phase::Writing { then, .. }, Event::Written) => self.finish(then),
            (Phase::Writing { then, round }, Event::GraceOver(over)) if over == round => {
                self.finish(then)
            }
            // Ending lets every request through; a late answer, or the
            // grace time of a wait already over, changes nothing.
            (Phase::Ending, Event::Asked(_)) => Step::passed(),
            _ => Step::held(Act::Nothing),
        }
    }

    fn finish(&mut self, then: Then) -> Step {
        self.phase = match then {
            Then::Hide => Phase::Open,
            Then::Quit | Then::Restart => Phase::Ending,
        };
        Step::held(Act::Do(then))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Act::{AskPage, Do, Nothing};
    use Event::{Asked, GraceOver, Written};
    use Then::{Hide, Quit, Restart};

    /// Runs `events` from a fresh flow and gives each answer.
    fn run(events: &[Event]) -> Vec<Step> {
        let mut flow = Flow::new();
        events.iter().map(|event| flow.on(*event)).collect()
    }

    fn held(act: Act) -> Step {
        Step::held(act)
    }

    #[test]
    fn a_request_waits_for_the_page_then_happens() {
        for then in [Hide, Quit, Restart] {
            assert_eq!(
                run(&[Asked(then), Written]),
                [held(AskPage { round: 1 }), held(Do(then))],
                "{then:?}"
            );
        }
    }

    #[test]
    fn a_page_that_never_answers_is_passed_over_after_the_grace_time() {
        assert_eq!(
            run(&[Asked(Quit), GraceOver(1), Written]),
            [
                held(AskPage { round: 1 }),
                held(Do(Quit)),
                // The late answer does nothing.
                held(Nothing),
            ]
        );
    }

    #[test]
    fn asking_the_same_again_does_it_at_once() {
        assert_eq!(
            run(&[Asked(Quit), Asked(Quit)]),
            [held(AskPage { round: 1 }), held(Do(Quit))]
        );
    }

    #[test]
    fn a_stronger_request_takes_over_the_wait_and_a_weaker_one_joins_it() {
        assert_eq!(
            run(&[Asked(Hide), Asked(Quit), Written]),
            [held(AskPage { round: 1 }), held(Nothing), held(Do(Quit))]
        );
        assert_eq!(
            run(&[Asked(Restart), Asked(Quit), Asked(Hide), GraceOver(1)]),
            [
                held(AskPage { round: 1 }),
                held(Nothing),
                held(Nothing),
                held(Do(Restart)),
            ]
        );
    }

    #[test]
    fn once_ending_every_request_goes_through() {
        assert_eq!(
            run(&[Asked(Restart), Written, Asked(Quit), Asked(Quit)]),
            [
                held(AskPage { round: 1 }),
                held(Do(Restart)),
                Step::passed(),
                Step::passed(),
            ]
        );
    }

    #[test]
    fn after_hiding_the_window_can_be_hidden_again_and_old_timers_do_nothing() {
        assert_eq!(
            run(&[
                Asked(Hide),
                Written,
                Asked(Hide),
                // The first wait's grace time ends during the second wait.
                GraceOver(1),
                GraceOver(2),
            ]),
            [
                held(AskPage { round: 1 }),
                held(Do(Hide)),
                held(AskPage { round: 2 }),
                held(Nothing),
                held(Do(Hide)),
            ]
        );
    }

    #[test]
    fn answers_with_nothing_under_way_do_nothing() {
        assert_eq!(
            run(&[Written, GraceOver(1), GraceOver(0)]),
            [held(Nothing), held(Nothing), held(Nothing)]
        );
    }
}
