use super::*;

fn stamp(commit: &str) -> Stamp {
    Stamp {
        session: format!("S-{commit}"),
        client: "claude-code".into(),
        commit: commit.into(),
        time: 7,
    }
}

fn spans(marks: &[AgentMark]) -> Vec<(usize, usize, &str)> {
    marks
        .iter()
        .map(|m| (m.start, m.end, m.commit.as_str()))
        .collect()
}

#[test]
fn runs_hold_one_commit_and_step_over_blank_lines() {
    let (a, b) = (stamp("a"), stamp("b"));
    let lines = ["A", "", "B", "C", "", "D", "", ""];
    let stamps = [
        Some(&a),
        None,
        Some(&a),
        Some(&b),
        Some(&b),
        None,
        Some(&a),
        Some(&a),
    ];
    let marks = runs(&lines, &stamps);
    assert_eq!(spans(&marks), [(0, 3, "a"), (3, 4, "b")]);
    assert_eq!(marks[1].session, "S-b");
}

#[test]
fn a_change_touches_the_paragraphs_that_gain_or_lose_a_line() {
    let then = ["one", "two", "", "three", "", "four", "five"];
    // "two" changed, "four" went, and a new paragraph came at the end.
    let now = ["one", "two!", "", "three", "", "five", "", "six"];
    let kept = crate::diff::kept_lines(&now, &then);
    assert_eq!(
        touched(&now, &then, &kept),
        [true, true, false, false, false, true, false, true]
    );
}

#[test]
fn blame_finds_the_change_that_brought_each_line_in() {
    let mut blame = Blame::new("Intro\n\nAgent paragraph.\n\nMine.\n");
    // Newest first: a person added "Mine.", before that an agent added its
    // paragraph, and before that a person made the note.
    blame.step(None, Some("Intro\n\nAgent paragraph.\n"));
    assert!(!blame.done());
    blame.step(Some(stamp("a")), Some("Intro\n"));
    blame.step(None, None);
    assert!(blame.done());
    assert_eq!(spans(&blame.marks()), [(2, 3, "a")]);

    // An agent's rewrite of one line of a person's paragraph is newer than
    // the paragraph, so it stays marked.
    let mut blame = Blame::new("One.\nTwo, rewritten.\nThree.\n");
    blame.step(Some(stamp("b")), Some("One.\nTwo.\nThree.\n"));
    blame.step(None, None);
    assert_eq!(spans(&blame.marks()), [(1, 2, "b")]);
}

#[test]
fn a_person_s_change_reviews_its_paragraph_for_good() {
    // An agent wrote two lines; a person changed the second; then an agent
    // rewrote the person's line. The first line stays reviewed.
    let mut blame = Blame::new("a1\na2 again\n");
    blame.step(Some(stamp("c")), Some("a1\na2 mine\n"));
    blame.step(None, Some("a1\na2\n"));
    blame.step(Some(stamp("a")), None);
    assert_eq!(spans(&blame.marks()), [(1, 2, "c")]);

    // A person removing a line reviews what is left of its paragraph, not
    // the paragraph beside it.
    let mut blame = Blame::new("a1\n\nb1\n");
    blame.step(None, Some("a1\na2\n\nb1\n"));
    blame.step(Some(stamp("a")), None);
    assert_eq!(spans(&blame.marks()), [(2, 3, "a")]);
}

#[test]
fn known_marks_carry_on_under_newer_changes() {
    // Cached: "X" and "Z" were an agent's. Since then a person added a line
    // to the paragraph of "Z".
    let known = [stamp("k").mark(0), stamp("k").mark(4)];
    let mut blame = Blame::new("X\n\nY\n\nZ\nmine\n");
    blame.step(None, Some("X\n\nY\n\nZ\n"));
    blame.known(&known);
    assert_eq!(spans(&blame.marks()), [(0, 1, "k")]);
}

#[test]
fn typing_not_yet_committed_unmarks_its_paragraph_and_moves_the_rest() {
    let committed = "A1\nA2\n\nB\n";
    let marks = [AgentMark {
        start: 0,
        end: 4,
        ..stamp("a").mark(0)
    }];
    // A new first paragraph moves the marks down; "B" is edited.
    let working = "Mine\n\nA1\nA2\n\nB, edited\n";
    assert_eq!(spans(&carry(&marks, committed, working)), [(2, 4, "a")]);
    assert_eq!(spans(&carry(&marks, committed, committed)), [(0, 4, "a")]);
    assert!(carry(&marks, committed, "").is_empty());
}
