//! The block parser: what a line of Markdown becomes as a paragraph.

use super::{b, bullet, code, i, line, look, number, para, plain, r, styled, table};
use crate::markdown::parse;

#[test]
fn a_line_is_a_paragraph_and_blank_lines_are_dropped() {
    table(
        vec![
            ("", vec![]),
            ("\n\n  \n\t\n", vec![]),
            ("hello", vec![plain("hello")]),
            ("a\nb", vec![plain("a"), plain("b")]),
            ("a\n\n\nb\n", vec![plain("a"), plain("b")]),
            ("   padded \t ", vec![plain("padded")]),
            ("\n\n  first\n\n", vec![plain("first")]),
            ("**x** y", vec![para(vec![b("x"), r(" y")])]),
            ("*x*", vec![para(vec![i("x")])]),
        ],
        parse,
    );
}

#[test]
fn bullets_and_numbers_at_three_levels() {
    table(
        vec![
            (
                "- one\n- two",
                vec![bullet(0, vec![r("one")]), bullet(0, vec![r("two")])],
            ),
            (
                "* one\n+ two",
                vec![bullet(0, vec![r("one")]), bullet(0, vec![r("two")])],
            ),
            (
                "1. one\n2. two\n10) ten",
                vec![
                    number(0, vec![r("one")]),
                    number(0, vec![r("two")]),
                    number(0, vec![r("ten")]),
                ],
            ),
            (
                "- a\n  - b\n    - c\n- d",
                vec![
                    bullet(0, vec![r("a")]),
                    bullet(1, vec![r("b")]),
                    bullet(2, vec![r("c")]),
                    bullet(0, vec![r("d")]),
                ],
            ),
            (
                "1. a\n  1. b\n    1. c",
                vec![
                    number(0, vec![r("a")]),
                    number(1, vec![r("b")]),
                    number(2, vec![r("c")]),
                ],
            ),
            (
                "- a\n\t- b\n\t\t- c",
                vec![
                    bullet(0, vec![r("a")]),
                    bullet(1, vec![r("b")]),
                    bullet(2, vec![r("c")]),
                ],
            ),
            (
                "- a\n  1. b\n- c",
                vec![
                    bullet(0, vec![r("a")]),
                    number(1, vec![r("b")]),
                    bullet(0, vec![r("c")]),
                ],
            ),
            (
                "- a\n              - far\n   - odd",
                vec![
                    bullet(0, vec![r("a")]),
                    bullet(5, vec![r("far")]),
                    bullet(1, vec![r("odd")]),
                ],
            ),
            (
                "5. five\n9. nine",
                vec![number(0, vec![r("five")]), number(0, vec![r("nine")])],
            ),
            ("-\tx", vec![bullet(0, vec![r("x")])]),
            (
                "- **bold** and `code`",
                vec![bullet(0, vec![b("bold"), r(" and "), code("code")])],
            ),
            ("2020. Year", vec![number(0, vec![r("Year")])]),
        ],
        parse,
    );
}

#[test]
fn lines_that_only_look_like_markers_are_text() {
    table(
        vec![
            ("-x", vec![plain("-x")]),
            ("+1", vec![plain("+1")]),
            ("1.5 million", vec![plain("1.5 million")]),
            ("1.x", vec![plain("1.x")]),
            (
                "12345678901. too long",
                vec![plain("12345678901. too long")],
            ),
            ("#tag", vec![plain("#tag")]),
            (">x", vec![plain(">x")]),
            ("---", vec![plain("---")]),
            ("a - b", vec![plain("a - b")]),
            ("\\- escaped", vec![plain("- escaped")]),
            ("\\# escaped", vec![plain("# escaped")]),
            ("\\> escaped", vec![plain("> escaped")]),
            ("1\\. escaped", vec![plain("1. escaped")]),
            ("\\* escaped", vec![plain("* escaped")]),
            ("```a```", vec![para(vec![code("a")])]),
        ],
        parse,
    );
}

#[test]
fn an_empty_marker_is_an_empty_item() {
    table(
        vec![
            ("-", vec![bullet(0, vec![r("")])]),
            ("- ", vec![bullet(0, vec![r("")])]),
            ("  1.", vec![number(1, vec![r("")])]),
            ("1)", vec![number(0, vec![r("")])]),
            ("#", vec![styled("title", vec![r("")])]),
            ("## ", vec![styled("subtitle", vec![r("")])]),
            (">", vec![styled("quote", vec![r("")])]),
            ("###", vec![]),
        ],
        parse,
    );
}

#[test]
fn headings_and_quotes_set_the_style() {
    table(
        vec![
            ("# Title", vec![styled("title", vec![r("Title")])]),
            (
                "## Sub *title*",
                vec![styled("subtitle", vec![r("Sub "), i("title")])],
            ),
            ("### Deep", vec![para(vec![b("Deep")])]),
            (
                "###### Deeper *x*",
                vec![para(vec![b("Deeper "), look("x", "bi")])],
            ),
            ("#### `c` end", vec![para(vec![look("c", "bc"), b(" end")])]),
            ("  # indented", vec![styled("title", vec![r("indented")])]),
            ("> quote", vec![styled("quote", vec![r("quote")])]),
            ("> **a** b", vec![styled("quote", vec![b("a"), r(" b")])]),
            (
                "> - not a list",
                vec![styled("quote", vec![r("- not a list")])],
            ),
            ("> > nested", vec![styled("quote", vec![r("> nested")])]),
            (
                "- # not a heading",
                vec![bullet(0, vec![r("# not a heading")])],
            ),
            (
                "# a\n- b\n> c",
                vec![
                    styled("title", vec![r("a")]),
                    bullet(0, vec![r("b")]),
                    styled("quote", vec![r("c")]),
                ],
            ),
        ],
        parse,
    );
}

#[test]
fn fenced_code_is_one_paragraph_per_line_and_never_parsed() {
    table(
        vec![
            ("```\ncode\n```", vec![line("code")]),
            ("```rust\nfn main() {}\n```", vec![line("fn main() {}")]),
            ("~~~\na\n~~~", vec![line("a")]),
            (
                "```\n  **x** - y\n\tb\n```",
                vec![line("  **x** - y"), line("\tb")],
            ),
            ("```\na\n\nb\n```", vec![line("a"), line(""), line("b")]),
            ("```\na\nb", vec![line("a"), line("b")]),
            ("```", vec![]),
            ("```\n\n```", vec![line("")]),
            (
                "````\na\n```\nb\n````\nc",
                vec![line("a"), line("```"), line("b"), plain("c")],
            ),
            (
                "```\na\n~~~\nb\n```",
                vec![line("a"), line("~~~"), line("b")],
            ),
            ("```\nx\n```\ny", vec![line("x"), plain("y")]),
            (
                "x\n```\n# y\n```\n- z",
                vec![plain("x"), line("# y"), bullet(0, vec![r("z")])],
            ),
            ("```\na\n  ```  \nb", vec![line("a"), plain("b")]),
            ("~~~~ tilde fence with words ~~~~\nx", vec![line("x")]),
            ("```\r\na\r\n```\r\n", vec![line("a")]),
        ],
        parse,
    );
}

#[test]
fn windows_line_endings_and_tabs_read_like_unix_ones() {
    table(
        vec![
            (
                "- a\r\n- b\r\n\r\nc\r\n",
                vec![bullet(0, vec![r("a")]), bullet(0, vec![r("b")]), plain("c")],
            ),
            (
                "# t\r\n\t- x",
                vec![styled("title", vec![r("t")]), bullet(1, vec![r("x")])],
            ),
            ("a\tb", vec![plain("a\tb")]),
        ],
        parse,
    );
}

#[test]
fn a_hard_break_keeps_the_next_line_in_the_same_paragraph() {
    table(
        vec![
            ("one  \ntwo", vec![plain("one\ntwo")]),
            ("one\\\ntwo", vec![plain("one\ntwo")]),
            ("a   \nb  \nc", vec![plain("a\nb\nc")]),
            (
                "- one  \ntwo\n- three",
                vec![bullet(0, vec![r("one\ntwo")]), bullet(0, vec![r("three")])],
            ),
            ("# a  \nb", vec![styled("title", vec![r("a\nb")])]),
            ("a  \n- b", vec![plain("a\n- b")]),
            ("a  \n    b", vec![plain("a\nb")]),
            ("**a  \nb**", vec![para(vec![b("a\nb")])]),
            ("a  \r\nb", vec![plain("a\nb")]),
            ("a  \n\nb", vec![plain("a"), plain("b")]),
            ("a  ", vec![plain("a")]),
            ("a\\", vec![plain("a\\")]),
            ("a\\\n\nb", vec![plain("a\\"), plain("b")]),
            ("a\\\\\nb", vec![plain("a\\"), plain("b")]),
            ("a\\\\\\\nb", vec![plain("a\\\nb")]),
            ("a \\\nb", vec![plain("a\nb")]),
            ("a\\  \nb", vec![plain("a\\\nb")]),
            ("```\na  \nb\n```", vec![line("a  "), line("b")]),
        ],
        parse,
    );
}
