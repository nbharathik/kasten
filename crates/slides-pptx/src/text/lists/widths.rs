//! The room a list leaves in front of its text has to be wider than its widest
//! marker, or PowerPoint draws the marker into the text. The widest is not
//! always the last: "xxviii." is the widest of thirty Roman numerals, "aa." of
//! thirty letters (past "z." they need two).

use super::*;

fn item(kind: ListKind, level: u8) -> Paragraph {
    Paragraph {
        list: Some(kind),
        level: Some(level),
        ..Paragraph::plain("x")
    }
}

/// How far the first item of a numbered list of `n` items at `level` hangs at `points`.
fn hang(n: usize, level: u8, points: f64) -> f64 {
    let list: Vec<Paragraph> = (0..n).map(|_| item(ListKind::Number, level)).collect();
    hangs(&list, &vec![points; n])[0]
}

#[test]
fn thirty_roman_numerals_hang_for_xxviii() {
    let widest = (1..=30)
        .map(|n| marker("romanLcPeriod", n))
        .max_by(|a, b| width_in_ems(a).total_cmp(&width_in_ems(b)))
        .unwrap_or_default();
    assert_eq!(widest, "xxviii.");
    assert_eq!(widest_marker("romanLcPeriod", 30), "xxviii.");
    for points in [12.0, 14.0, 18.0, 22.0] {
        let hung = hang(30, 2, points);
        assert!(hung >= room_for("xxviii.", points), "{points} pt: {hung}");
        assert!(
            hung > hang(8, 2, points),
            "{points} pt: more than the room 'viii.' needs"
        );
    }
}

#[test]
fn letters_past_z_hang_for_two_letters() {
    assert_eq!(marker("alphaLcPeriod", 27), "aa.");
    assert!(
        width_in_ems("aa.") > width_in_ems("m."),
        "two letters are wider than the widest one"
    );
    for points in [12.0, 14.0, 18.0, 22.0] {
        let hung = hang(30, 1, points);
        assert!(hung >= room_for("aa.", points), "{points} pt: {hung}");
        assert!(
            hung > hang(26, 1, points),
            "{points} pt: 'aa.' needs more than 'm.'"
        );
        assert_eq!(
            hung,
            hang(27, 1, points),
            "the first two-letter marker is the widest of them"
        );
    }
}

#[test]
fn every_marker_of_every_scheme_fits_in_the_room_its_list_leaves() {
    for level in 0..3_u8 {
        let scheme = scheme(usize::from(level));
        for count in (1..=130).step_by(3) {
            for points in [12.0, 14.0, 18.0, 22.0, 28.0] {
                let hung = hang(count, level, points);
                for n in 1..=count as u32 {
                    let room = room_for(&marker(scheme, n), points);
                    assert!(
                        hung + 1e-9 >= room.min(MOST_HANGING),
                        "{scheme} up to {count} at {points} pt: {} needs {room}, the list hangs {hung}",
                        marker(scheme, n)
                    );
                }
            }
        }
    }
}
