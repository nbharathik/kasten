use serde_json::{Value, json};

use super::*;

fn cell(col: Option<u32>, row: Option<u32>) -> Value {
    let mut cell = json!({ "text": { "paragraphs": [] } });
    if let Some(n) = col {
        cell["colSpan"] = json!(n);
    }
    if let Some(n) = row {
        cell["rowSpan"] = json!(n);
    }
    cell
}

fn plain(n: usize) -> Vec<Value> {
    (0..n).map(|_| cell(None, None)).collect()
}

fn table(columns: usize, rows: Vec<Vec<Value>>) -> TableEl {
    let rows: Vec<Value> = rows.into_iter().map(|c| json!({ "cells": c })).collect();
    serde_json::from_value(json!({ "id": "t", "columns": vec![10.0; columns], "rows": rows }))
        .unwrap_or_else(|e| panic!("a table: {e}"))
}

fn spans(t: &TableEl) -> Vec<Vec<(usize, usize)>> {
    t.rows
        .iter()
        .map(|r| {
            r.cells
                .iter()
                .map(|c| (span_of(c.col_span), span_of(c.row_span)))
                .collect()
        })
        .collect()
}

#[test]
fn a_table_that_follows_the_rules_has_no_problem_and_fit_leaves_it_alone() {
    let mut t = table(
        3,
        vec![
            vec![cell(Some(2), None), cell(None, Some(2))],
            vec![cell(None, None), cell(None, None)],
            vec![cell(Some(3), None)],
        ],
    );
    assert_eq!(t.problem(), None);
    let before = t.clone();
    assert!(!t.fit());
    assert_eq!(t, before);
    // A table with nothing in it is not a problem here; an export says it left it out.
    assert_eq!(table(0, vec![]).problem(), None);
}

#[test]
fn a_table_without_widths_has_as_many_columns_as_its_widest_row() {
    let t = table(
        0,
        vec![plain(2), vec![cell(Some(3), None), cell(None, None)]],
    );
    assert_eq!(t.column_count(), 4);
    assert_eq!(t.problem(), None);
}

#[test]
fn too_many_columns_rows_or_places_are_refused_in_words_that_say_what_to_change() {
    let wide = table(MOST_TABLE_COLUMNS + 1, vec![]);
    let text = wide.problem().unwrap_or_default();
    assert!(
        text.contains("1000 columns") && text.contains("1001") && text.contains("Split"),
        "{text}"
    );
    let tall = table(1, vec![Vec::new(); MOST_TABLE_ROWS + 1]);
    let text = tall.problem().unwrap_or_default();
    assert!(
        text.contains("10000 rows") && text.contains("10001"),
        "{text}"
    );
    // Each within its own limit, and together too many.
    let big = table(200, vec![Vec::new(); 300]);
    let text = big.problem().unwrap_or_default();
    assert!(
        text.contains("50000 places") && text.contains("200 columns and 300 rows"),
        "{text}"
    );
    assert!(table(200, vec![Vec::new(); 250]).problem().is_none());
}

#[test]
fn a_span_too_wide_to_count_is_a_problem_and_costs_nothing() {
    for row in [
        vec![cell(Some(u32::MAX), None)],
        vec![cell(Some(u32::MAX), None), cell(Some(u32::MAX), None)],
    ] {
        let mut t = table(0, vec![row]);
        assert!(t.column_count() >= u32::MAX as usize);
        let text = t.problem().unwrap_or_default();
        assert!(text.contains("columns") && text.contains("Split"), "{text}");
        assert!(!t.fit(), "a table beyond the limits is not trimmed");
    }
}

#[test]
fn a_span_of_nothing_or_past_the_end_is_refused_with_how_far_it_may_reach() {
    let zero = table(2, vec![vec![cell(Some(0), None)]]);
    let text = zero.problem().unwrap_or_default();
    assert!(
        text.contains("Row 1, cell 1") && text.contains("colSpan is 0"),
        "{text}"
    );
    let zero = table(2, vec![plain(2), vec![cell(None, Some(0))]]);
    assert!(
        zero.problem()
            .unwrap_or_default()
            .contains("Row 2, cell 1: rowSpan is 0")
    );

    let across = table(3, vec![vec![cell(None, None), cell(Some(3), None)]]);
    let text = across.problem().unwrap_or_default();
    assert!(
        text.contains("Row 1, cell 2: colSpan is 3, but only 2 columns are left")
            && text.contains("Give colSpan 2 or less"),
        "{text}"
    );
    let down = table(
        2,
        vec![plain(2), vec![cell(None, Some(2)), cell(None, None)]],
    );
    let text = down.problem().unwrap_or_default();
    assert!(
        text.contains("Row 2, cell 1: rowSpan is 2, but only 1 row is left")
            && text.contains("or add rows"),
        "{text}"
    );
}

#[test]
fn a_cell_that_has_no_place_left_in_its_row_is_refused() {
    // The second row's first place is covered from above, so only one cell fits.
    let t = table(
        2,
        vec![
            vec![cell(None, Some(2)), cell(None, None)],
            vec![cell(None, None), cell(None, None)],
        ],
    );
    let text = t.problem().unwrap_or_default();
    assert!(text.contains("Row 2, cell 2 has no place left"), "{text}");
    assert!(
        text.contains("2 columns") && text.contains("add a column"),
        "{text}"
    );
}

#[test]
fn fit_cuts_a_table_back_until_it_has_no_problem() {
    let mut t = table(
        3,
        vec![
            vec![cell(Some(0), None), cell(Some(9), None)],
            vec![
                cell(None, Some(7)),
                cell(None, None),
                cell(None, None),
                cell(None, None),
            ],
            vec![cell(Some(1), Some(1)), cell(Some(2), Some(0))],
        ],
    );
    assert!(t.problem().is_some());
    assert!(t.fit());
    assert_eq!(t.problem(), None, "{:?}", spans(&t));
    assert_eq!(
        spans(&t),
        vec![
            vec![(1, 1), (2, 1)],
            // The fourth cell had no place; the rowSpan stops at the last row.
            vec![(1, 2), (1, 1), (1, 1)],
            // The first place is covered from above; the last cell's span stops at the end of the row.
            vec![(1, 1), (1, 1)],
        ]
    );
    // A span of 1 that was written stays as it was; one that was cut to 1 is not written.
    assert_eq!(t.rows[2].cells[0].col_span, Some(1));
    assert_eq!(t.rows[0].cells[0].col_span, None);
    assert!(!t.fit(), "a second time there is nothing to cut");
}

#[test]
fn whatever_the_spans_are_fit_ends_at_a_table_without_problem() {
    // A small deterministic generator, so the cases are the same every time.
    let mut state = 0x2545_f491_4f6c_dd1d_u64;
    let mut next = |n: u64| {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state % n
    };
    for _ in 0..300 {
        let columns = next(5) as usize;
        let rows = (0..next(6))
            .map(|_| {
                (0..next(6))
                    .map(|_| {
                        let span = |x: u64| match x {
                            0 => Some(0),
                            1 => None,
                            2 => Some(2),
                            3 => Some(5),
                            _ => Some(u32::MAX),
                        };
                        cell(span(next(5)), span(next(5)))
                    })
                    .collect()
            })
            .collect();
        let mut t = table(columns, rows);
        if t.column_count() > MOST_TABLE_COLUMNS {
            continue;
        }
        t.fit();
        assert_eq!(t.problem(), None, "{:?}", spans(&t));
    }
}
