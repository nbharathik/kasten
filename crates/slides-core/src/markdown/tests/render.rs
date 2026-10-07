//! The serializer: what paragraphs are written as.

use super::{
    b, bullet, code, i, line, linked, look, math, number, para, plain, r, styled, table_of,
};
use crate::markdown::to_markdown;
use crate::model::{Paragraph, Run};

fn write(paragraphs: &[Paragraph]) -> String {
    to_markdown(paragraphs)
}

fn one(runs: &[Run]) -> String {
    to_markdown(&[para(runs.to_owned())])
}

#[test]
fn paragraphs_are_lines_and_lists_are_indented_two_spaces_a_level() {
    table_of(
        vec![
            (vec![], ""),
            (vec![plain("hello")], "hello"),
            (vec![plain("a"), plain("b")], "a\nb"),
            (
                vec![
                    bullet(0, vec![r("a")]),
                    bullet(1, vec![r("b")]),
                    bullet(2, vec![r("c")]),
                ],
                "- a\n  - b\n    - c",
            ),
            (
                vec![
                    number(0, vec![r("a")]),
                    number(0, vec![r("b")]),
                    number(0, vec![r("c")]),
                ],
                "1. a\n2. b\n3. c",
            ),
            (
                vec![number(0, vec![r("a")]), plain("x"), number(0, vec![r("b")])],
                "1. a\nx\n1. b",
            ),
            (
                vec![
                    number(0, vec![r("a")]),
                    number(1, vec![r("b")]),
                    number(1, vec![r("c")]),
                    number(0, vec![r("d")]),
                ],
                "1. a\n  1. b\n  2. c\n2. d",
            ),
            (
                vec![
                    bullet(0, vec![r("a")]),
                    number(1, vec![r("b")]),
                    number(1, vec![r("c")]),
                    bullet(0, vec![r("d")]),
                ],
                "- a\n  1. b\n  2. c\n- d",
            ),
            (
                vec![
                    styled("title", vec![r("T")]),
                    styled("subtitle", vec![r("S")]),
                    styled("quote", vec![r("Q")]),
                ],
                "# T\n## S\n> Q",
            ),
            (
                vec![
                    bullet(0, vec![r("")]),
                    number(1, vec![r("")]),
                    styled("title", vec![r("")]),
                    plain(""),
                    plain("x"),
                ],
                "-\n  1.\n#\nx",
            ),
            (vec![styled("quote", vec![r("- x")])], "> - x"),
        ],
        |ps| write(ps),
    );
}

#[test]
fn runs_are_written_with_the_fewest_markers() {
    table_of(
        vec![
            (
                vec![
                    r("a "),
                    b("b"),
                    r(" "),
                    i("c"),
                    r(" "),
                    look("d", "s"),
                    r(" "),
                    look("e", "u"),
                    r(" "),
                    code("f"),
                    r(" "),
                    math("g"),
                    r(" "),
                    linked(r("h"), "https://x.y/z"),
                ],
                "a **b** *c* ~~d~~ <u>e</u> `f` $g$ [h](https://x.y/z)",
            ),
            (
                vec![look("x", "bi"), r(" "), look("y", "sb")],
                "***x*** ~~**y**~~",
            ),
            (vec![look("a", "bu")], "<u>**a**</u>"),
            (
                vec![linked(r("https://x.y"), "https://x.y")],
                "<https://x.y>",
            ),
            (
                vec![linked(r("see "), "u"), linked(b("this"), "u")],
                "[see **this**](u)",
            ),
            (
                vec![b("bold "), look("both", "bi"), b(" bold")],
                "**bold *both* bold**",
            ),
            (vec![code("a`b")], "``a`b``"),
            (vec![code("`a")], "`` `a ``"),
            (vec![code(" a ")], "`  a  `"),
            (vec![look("a", "bc")], "**`a`**"),
            (
                vec![r("x"), math("y"), r(" and "), math("a$b")],
                "x$y$ and $$a$b$$",
            ),
        ],
        |runs| one(runs),
    );
}

#[test]
fn text_that_would_read_as_markup_is_escaped() {
    table_of(
        vec![
            (
                vec![plain("1 * 2 _ x_y ~ [a] $5 <b> `c`")],
                "1 \\* 2 \\_ x_y ~ \\[a] \\$5 \\<b> \\`c\\`",
            ),
            (
                vec![
                    plain("- a"),
                    plain("+ b"),
                    plain("* c"),
                    plain("# d"),
                    plain("## e"),
                    plain("> f"),
                    plain("1. g"),
                    plain("2) h"),
                ],
                "\\- a\n\\+ b\n\\* c\n\\# d\n\\## e\n\\> f\n1\\. g\n2\\) h",
            ),
            (
                vec![
                    plain("-a"),
                    plain("#tag"),
                    plain("1.5"),
                    plain(">x"),
                    plain("a - b"),
                ],
                "-a\n#tag\n1.5\n>x\na - b",
            ),
            (
                vec![plain("C:\\dir and a\\*b and end\\")],
                "C:\\dir and a\\\\\\*b and end\\\\",
            ),
            (vec![plain("~~~")], "\\~\\~\\~"),
            (vec![plain("```")], "\\`\\`\\`"),
            (vec![plain("a~~b")], "a\\~\\~b"),
            (vec![plain("x < 3 and 5 > 2")], "x < 3 and 5 > 2"),
        ],
        |ps| write(ps),
    );
}

#[test]
fn a_line_break_inside_a_paragraph_is_a_hard_break() {
    table_of(
        vec![
            (vec![plain("a\nb")], "a\\\nb"),
            (vec![bullet(0, vec![r("a\nb")]), plain("c")], "- a\\\nb\nc"),
            (vec![styled("title", vec![r("a\nb")])], "# a\\\nb"),
            (vec![para(vec![b("a\nb")])], "**a\\\nb**"),
            (vec![plain("a\\\nb")], "a\\  \nb"),
            (vec![plain("a\n\nb")], "a\\\n\\\nb"),
            (vec![plain("a\n")], "a\\\n<u></u>"),
            // What starts a line after a break would start a list or a heading.
            (
                vec![plain("a\n- b\n## c\n1. d\n> e\n\n* f")],
                "a\\\n\\- b\\\n\\## c\\\n1\\. d\\\n\\> e\\\n\\\n\\* f",
            ),
            (vec![plain("a \nb")], "a <u></u>\\\nb"),
        ],
        |ps| write(ps),
    );
}

#[test]
fn consecutive_code_lines_share_a_fence_longer_than_any_backtick_run() {
    table_of(
        vec![
            (
                vec![line("a"), line("  b"), plain("x")],
                "```\na\n  b\n```\nx",
            ),
            (vec![plain("x"), line("a")], "x\n```\na\n```\n"),
            (vec![line("```")], "````\n```\n````\n"),
            (vec![line("a"), line(""), line("b")], "```\na\n\nb\n```\n"),
            (vec![line("`` x ````")], "`````\n`` x ````\n`````\n"),
            (
                vec![number(0, vec![r("a")]), line("x"), number(0, vec![r("b")])],
                "1. a\n```\nx\n```\n1. b",
            ),
        ],
        |ps| write(ps),
    );
}

#[test]
fn what_markdown_cannot_say_is_dropped_and_what_it_says_awkwardly_uses_tags() {
    let styled_run = Run {
        color: Some("accent1".to_owned()),
        size: Some(20.0),
        font: Some("code".to_owned()),
        ..r("word")
    };
    table_of(
        vec![
            (vec![styled_run], "word"),
            (vec![b("a "), r("b")], "<b>a </b>b"),
            (vec![r("a"), i(" b")], "a<i> b</i>"),
            (vec![b("a"), i("b")], "**a**<i>b</i>"),
            (vec![r("a"), i("b"), r("c")], "a*b*c"),
            (vec![math("x"), r("5 apples")], "$x$<u></u>5 apples"),
            (
                vec![r("~5 min and "), look("~x", "s")],
                "\\~5 min and ~~\\~x~~",
            ),
        ],
        |runs| one(runs),
    );
}
