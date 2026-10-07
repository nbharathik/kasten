use super::*;
use crate::composites::expand as expand_element;
use crate::model::{Base, Extra};

fn card(title: &str, body: Option<&str>) -> Card {
    Card {
        title: title.to_owned(),
        body: body.map(str::to_owned),
        extra: Extra::new(),
    }
}

fn grid(cards: Vec<Card>, columns: Option<u32>, w: f64, h: f64) -> CardGridEl {
    CardGridEl {
        base: Base::new("e-grid").place(64.0, 148.0, w, h),
        cards,
        columns,
        extra: Extra::new(),
    }
}

fn parts_of(el: CardGridEl) -> Vec<Element> {
    let theme = crate::themes::light();
    expand_element(&theme, "blank", &Element::CardGrid(el)).unwrap_or_default()
}

fn six() -> Vec<Card> {
    (1..=6)
        .map(|i| {
            card(
                &format!("Card {i}"),
                Some("A line about the card, long enough to wrap onto a second line."),
            )
        })
        .collect()
}

fn words(part: &Element) -> &crate::model::Text {
    part.text().expect("a card has words")
}

#[test]
fn the_columns_follow_the_number_of_cards() {
    let by_count: Vec<usize> = (0..=13).map(auto_columns).collect();
    assert_eq!(by_count, [1, 1, 2, 3, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4]);
}

#[test]
fn six_cards_are_two_rows_of_three_equal_cells_with_sixteen_between() {
    let parts = parts_of(grid(six(), None, 832.0, 344.0));
    assert_eq!(parts.len(), 6);
    let rects: Vec<_> = parts
        .iter()
        .map(|p| p.base().rect().expect("a box"))
        .collect();
    // (832 - 2 * 16) / 3 across, (344 - 16) / 2 down.
    assert_eq!(rects[0], (64.0, 148.0, 266.67, 164.0));
    assert!((rects[1].0 - (64.0 + 266.67 + 16.0)).abs() < 0.021);
    assert_eq!(rects[3].1, 148.0 + 164.0 + 16.0);
    assert!(
        rects
            .iter()
            .all(|r| (r.2 - 266.67).abs() < 0.021 && r.3 == 164.0)
    );
    let last = rects[5];
    assert!(
        (last.0 + last.2 - (64.0 + 832.0)).abs() < 0.021,
        "the last cell ends at the right edge"
    );
    assert!((last.1 + last.3 - (148.0 + 344.0)).abs() < 0.011);
}

#[test]
fn a_card_is_a_rounded_grey_rectangle_with_a_heading_and_a_line() {
    let parts = parts_of(grid(six(), None, 832.0, 344.0));
    let Element::Shape(first) = &parts[0] else {
        panic!("a shape")
    };
    assert_eq!(first.shape, "roundRect");
    let style = first.base.style.as_ref().expect("a style");
    assert_eq!(style.radius, Some(12.0));
    assert_eq!(style.fill.as_ref().map(|f| f.color.as_str()), Some("bg2"));
    assert!(style.stroke.is_none(), "no outline");
    let text = words(&parts[0]);
    assert_eq!(text.paragraphs.len(), 2);
    let (heading, line) = (&text.paragraphs[0].runs[0], &text.paragraphs[1].runs[0]);
    assert_eq!(
        (heading.t.as_str(), heading.bold, heading.font.as_deref()),
        ("Card 1", true, Some("heading"))
    );
    assert_eq!((line.bold, line.font.as_deref()), (false, Some("body")));
    assert!(heading.size > line.size);
    // 16 units from the edge to the words, counting the rounded corner.
    let ins = text.insets.as_ref().expect("insets");
    assert!(
        (ins.left + 0.292_89 * 12.0 - 16.0).abs() < 0.006,
        "the insets are rounded to a hundredth"
    );
}

#[test]
fn every_card_is_set_at_one_size_the_largest_between_twelve_and_twenty_that_fits() {
    let sized = |cards: Vec<Card>, w: f64, h: f64| -> f64 {
        let parts = parts_of(grid(cards, None, w, h));
        let s: Vec<f64> = parts
            .iter()
            .map(|p| {
                words(p).paragraphs.last().expect("a paragraph").runs[0]
                    .size
                    .expect("a size")
            })
            .collect();
        assert!(
            s.windows(2).all(|p| p[0] == p[1]),
            "one size for all: {s:?}"
        );
        s[0]
    };
    let roomy = sized(vec![card("A", Some("b"))], 832.0, 344.0);
    assert_eq!(roomy, 20.0);
    let tight = sized(six(), 832.0, 250.0);
    assert!((12.0..20.0).contains(&tight), "{tight}");
    assert_eq!(sized(six(), 300.0, 100.0), 12.0, "the floor");
    // One fuller card sets the size for all of them.
    let mut mixed = six();
    mixed[5].body = Some("word ".repeat(60));
    assert!(sized(mixed, 832.0, 344.0) < sized(six(), 832.0, 344.0));
}

#[test]
fn the_words_fit_their_card_by_the_estimate() {
    let cards = six();
    let parts = parts_of(grid(cards.clone(), None, 832.0, 344.0));
    let body = words(&parts[0]).paragraphs[1].runs[0].size.expect("a size");
    let (room_w, room_h) = (266.67 - 32.0, 164.0 - 32.0);
    for c in &cards {
        assert!(words_height(c, body, room_w) <= room_h, "{body}");
    }
}

#[test]
fn columns_can_be_named_and_are_kept_within_reason() {
    let two = parts_of(grid(six(), Some(2), 832.0, 344.0));
    let ys: std::collections::BTreeSet<i64> = two
        .iter()
        .map(|p| (p.base().y.expect("y") * 100.0) as i64)
        .collect();
    assert_eq!(ys.len(), 3, "six cards in two columns are three rows");
    let wide = parts_of(grid(six(), Some(99), 832.0, 344.0));
    assert!(
        wide.iter().all(|p| p.base().y == wide[0].base().y),
        "at most one row of six"
    );
    let zero = parts_of(grid(six(), Some(0), 832.0, 344.0));
    assert_eq!(zero.len(), 6);
    assert_eq!(
        zero[3].base().rect().map(|r| r.0),
        Some(64.0),
        "zero means the automatic three"
    );
}

#[test]
fn a_card_with_only_a_heading_is_centred_and_none_leaves_no_parts() {
    let heads = parts_of(grid(
        vec![card("One", None), card("Two", None), card("Three", None)],
        None,
        832.0,
        344.0,
    ));
    assert_eq!(words(&heads[0]).valign, Some(VAlign::Middle));
    assert_eq!(words(&heads[0]).paragraphs.len(), 1);
    assert_eq!(words(&heads[0]).paragraphs[0].space_after, Some(0.0));
    let some = parts_of(grid(six(), None, 832.0, 344.0));
    assert_eq!(words(&some[0]).valign, Some(VAlign::Top));
    assert!(parts_of(grid(Vec::new(), None, 832.0, 344.0)).is_empty());
}

#[test]
fn cards_stay_inside_the_box_even_when_it_is_tiny() {
    for (w, h) in [(0.0, 0.0), (20.0, 20.0), (832.0, 10.0), (5.0, 344.0)] {
        for p in parts_of(grid(six(), None, w, h)) {
            let (x, y, pw, ph) = p.base().rect().expect("a box");
            assert!(
                x >= 64.0 - 0.011
                    && y >= 148.0 - 0.011
                    && x + pw <= 64.0 + w + 0.011
                    && y + ph <= 148.0 + h + 0.011,
                "{w}x{h}"
            );
        }
    }
}
