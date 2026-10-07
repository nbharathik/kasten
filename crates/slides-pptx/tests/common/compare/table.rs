//! Comparing two tables: the same shape, the same widths of columns, and the words and fills of each cell.

use slides_core::{Deck, TableEl, VAlign};

use super::Diff;
use super::elements::Pair;
use super::text::{self, Side};

fn table_fractions(t: &TableEl, w: f64, h: f64) -> (Vec<i64>, Vec<i64>) {
    let total = |v: &[f64]| v.iter().sum::<f64>().max(1e-9);
    let cols = total(&t.columns);
    let heights: Vec<f64> = t.rows.iter().map(|r| r.height.unwrap_or(0.0)).collect();
    let rows = total(&heights);
    let _ = (w, h);
    (
        t.columns
            .iter()
            .map(|c| (c / cols * 100.0).round() as i64)
            .collect(),
        heights
            .iter()
            .map(|c| (c / rows * 100.0).round() as i64)
            .collect(),
    )
}

pub fn compare_table(diff: &mut Diff, at: &str, pair: &Pair, a: &TableEl, b: &TableEl, width: f64) {
    if a.header_row != b.header_row
        || a.rows.len() != b.rows.len()
        || a.columns.len() != b.columns.len()
    {
        diff.note(
            at,
            format!(
                "table shape {}x{} header {} came back as {}x{} header {}",
                a.rows.len(),
                a.columns.len(),
                a.header_row,
                b.rows.len(),
                b.columns.len(),
                b.header_row
            ),
        );
        return;
    }
    let (ca, _) = table_fractions(a, width, 1.0);
    let (cb, _) = table_fractions(b, width, 1.0);
    if ca.iter().zip(&cb).any(|(x, y)| (x - y).abs() > 1) {
        diff.note(at, format!("column shares {ca:?} came back as {cb:?}"));
    }
    for (r, (ra, rb)) in a.rows.iter().zip(&b.rows).enumerate() {
        if ra.cells.len() != rb.cells.len() {
            diff.note(
                at,
                format!(
                    "row {r} has {} cells, came back with {}",
                    ra.cells.len(),
                    rb.cells.len()
                ),
            );
            continue;
        }
        for (c, (xa, xb)) in ra.cells.iter().zip(&rb.cells).enumerate() {
            let cell = format!("{at}/row {r}/cell {c}");
            if (xa.col_span.unwrap_or(1), xa.row_span.unwrap_or(1))
                != (xb.col_span.unwrap_or(1), xb.row_span.unwrap_or(1))
            {
                diff.note(
                    &cell,
                    format!(
                        "spans {:?}/{:?} came back as {:?}/{:?}",
                        xa.col_span, xa.row_span, xb.col_span, xb.row_span
                    ),
                );
            }
            let fill = |d: &Deck, f: &Option<slides_core::Fill>| {
                f.as_ref().map(|f| {
                    (
                        d.theme
                            .resolve_color(&f.color)
                            .unwrap_or_default()
                            .to_ascii_lowercase(),
                        (f.alpha.unwrap_or(1.0) * 100.0).round() as i64,
                    )
                })
            };
            if fill(pair.a.0, &xa.fill) != fill(pair.b.0, &xb.fill) {
                diff.note(
                    &cell,
                    format!("fill {:?} came back as {:?}", xa.fill, xb.fill),
                );
            }
            // A header row is written in bold.
            let mut ta = xa.text.clone();
            if a.header_row && r == 0 {
                for run in ta.paragraphs.iter_mut().flat_map(|p| p.runs.iter_mut()) {
                    run.bold = true;
                }
            }
            text::compare(
                diff,
                &cell,
                &Side {
                    deck: pair.a.0,
                    text: &ta,
                    base: "body",
                    valign: VAlign::Top,
                    index_of: pair.index_a,
                },
                &Side {
                    deck: pair.b.0,
                    text: &xb.text,
                    base: "body",
                    valign: VAlign::Top,
                    index_of: pair.index_b,
                },
            );
        }
    }
}
