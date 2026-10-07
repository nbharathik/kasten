//! A table is refused when its size or its spans would cost more than a table may: the
//! operations that add or change one say what to change, and nothing in the deck changes.

use serde_json::{Value, json};

use super::{add, bytes, engine};

fn cell(span: Option<u64>) -> Value {
    let mut cell = json!({ "text": { "paragraphs": [] } });
    if let Some(n) = span {
        cell["colSpan"] = json!(n);
    }
    cell
}

fn table(columns: Value, rows: Vec<Value>) -> Value {
    json!({ "type": "table", "x": 40, "y": 40, "w": 600, "h": 300, "columns": columns, "rows": rows })
}

/// Why the operation was refused, with the deck checked to be as it was.
fn refused(op: &str, input: Value) -> String {
    let mut e = engine();
    let slide = add(&mut e, "title-only", json!({ "title": "T" }));
    let before = bytes(e.deck());
    let mut input = input;
    input["slide"] = json!(slide);
    let err = e.apply(op, input).expect_err("refused").to_string();
    assert_eq!(bytes(e.deck()), before, "nothing changed");
    assert!(!e.can_redo());
    err
}

#[test]
fn a_table_of_a_hundred_thousand_columns_and_rows_is_refused_before_it_costs_anything() {
    let rows = vec![json!({ "cells": [] }); 100_000];
    let err = refused(
        "add_elements",
        json!({ "elements": [table(json!(vec![10.0; 100_000]), rows)] }),
    );
    assert!(err.contains("at most 1000 columns"), "{err}");
    assert!(err.contains("100000"), "{err}");
    assert!(
        err.contains("Split"),
        "the sentence says what to change: {err}"
    );
}

#[test]
fn many_rows_alone_or_many_places_together_are_refused_too() {
    let err = refused(
        "add_elements",
        json!({ "elements": [table(json!([10, 10]), vec![json!({ "cells": [] }); 10_001])] }),
    );
    assert!(err.contains("at most 10000 rows"), "{err}");
    let err = refused(
        "add_elements",
        json!({ "elements": [table(json!(vec![10; 300]), vec![json!({ "cells": [] }); 200])] }),
    );
    assert!(err.contains("50000 places"), "{err}");
}

#[test]
fn a_span_of_four_billion_is_refused_in_words_and_never_laid_out() {
    for columns in [json!([]), json!([10, 10])] {
        let rows = vec![json!({ "cells": [cell(Some(u64::from(u32::MAX)))] })];
        let err = refused(
            "add_elements",
            json!({ "elements": [table(columns.clone(), rows)] }),
        );
        assert!(
            err.contains("columns")
                && (err.contains("at most 1000") || err.contains("colSpan is 4294967295")),
            "{err}"
        );
    }
}

#[test]
fn a_span_of_nothing_or_past_the_last_column_is_refused() {
    let zero = json!({ "cells": [cell(Some(0))] });
    let err = refused(
        "add_elements",
        json!({ "elements": [table(json!([10, 10]), vec![zero])] }),
    );
    assert!(
        err.contains("colSpan is 0") && err.contains("Row 1, cell 1"),
        "{err}"
    );
    let past = json!({ "cells": [cell(None), cell(Some(2))] });
    let err = refused(
        "add_elements",
        json!({ "elements": [table(json!([10, 10]), vec![past])] }),
    );
    assert!(err.contains("only 1 column is left"), "{err}");
}

#[test]
fn a_pasted_table_is_held_to_the_same_limits() {
    let rows = vec![json!({ "cells": [] }); 10_001];
    let mut pasted = table(json!([10]), rows);
    pasted["id"] = json!("e-pasted");
    let err = refused("paste_elements", json!({ "elements": [pasted] }));
    assert!(err.contains("at most 10000 rows"), "{err}");
}

#[test]
fn changing_a_table_into_one_that_breaks_the_rules_is_refused() {
    let mut e = engine();
    let slide = add(&mut e, "title-only", json!({ "title": "T" }));
    let mut fine = table(json!([10, 10]), vec![json!({ "cells": [cell(Some(2))] })]);
    fine["id"] = json!("e-table");
    e.apply(
        "add_elements",
        json!({ "slide": slide, "elements": [fine] }),
    )
    .unwrap_or_else(|err| panic!("a table with a span that fits: {err}"));
    let before = bytes(e.deck());
    let wide = json!({ "cells": [cell(Some(3))] });
    let err = e
        .apply(
            "patch_elements",
            json!({ "slide": slide, "patches": [{ "id": "e-table", "patch": { "rows": [wide] } }] }),
        )
        .expect_err("refused")
        .to_string();
    assert!(
        err.contains("colSpan is 3") && err.contains("only 2 columns are left"),
        "{err}"
    );
    assert_eq!(bytes(e.deck()), before);
    // Fixed as the sentence says, it goes through.
    let fixed = json!({ "cells": [cell(Some(2))] });
    e.apply(
        "patch_elements",
        json!({ "slide": slide, "patches": [{ "id": "e-table", "patch": { "rows": [fixed] } }] }),
    )
    .unwrap_or_else(|err| panic!("{err}"));
}
