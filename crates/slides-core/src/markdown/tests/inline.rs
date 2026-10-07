//! The inline parser: a table of inputs and the runs they give, then two
//! properties.

use proptest::prelude::*;

use super::{b, code, i, linked, look, math, r, table};
use crate::markdown::inline::inline;

#[test]
fn the_basic_markers() {
    table(
        vec![
            ("", vec![]),
            ("plain text", vec![r("plain text")]),
            ("**bold**", vec![b("bold")]),
            ("__bold__", vec![b("bold")]),
            ("*it*", vec![i("it")]),
            ("_it_", vec![i("it")]),
            ("***both***", vec![look("both", "bi")]),
            ("___both___", vec![look("both", "bi")]),
            ("~~gone~~", vec![look("gone", "s")]),
            ("<u>under</u>", vec![look("under", "u")]),
            ("`code`", vec![code("code")]),
            ("$x^2$", vec![math("x^2")]),
            ("$$\\frac{a}{b}$$", vec![math("\\frac{a}{b}")]),
            (
                "[text](https://x.y)",
                vec![linked(r("text"), "https://x.y")],
            ),
            (
                "<https://x.y>",
                vec![linked(r("https://x.y"), "https://x.y")],
            ),
            (
                "<b>hi</b><i>x</i><s>y</s>",
                vec![b("hi"), i("x"), look("y", "s")],
            ),
        ],
        inline,
    );
}

#[test]
fn emphasis_nests_and_mixes() {
    table(
        vec![
            (
                "**bold *and italic* bold**",
                vec![b("bold "), look("and italic", "bi"), b(" bold")],
            ),
            (
                "*italic **and bold** italic*",
                vec![i("italic "), look("and bold", "bi"), i(" italic")],
            ),
            ("**bold *ital***", vec![b("bold "), look("ital", "bi")]),
            ("*ital **bold***", vec![i("ital "), look("bold", "bi")]),
            ("***a** b*", vec![look("a", "bi"), i(" b")]),
            ("***a* b**", vec![look("a", "bi"), b(" b")]),
            ("~~**both**~~", vec![look("both", "sb")]),
            ("<u>*it*</u>", vec![look("it", "ui")]),
            ("*a `b` c*", vec![i("a "), look("b", "ic"), i(" c")]),
            ("a*b*c", vec![r("a"), i("b"), r("c")]),
            ("**bold**text", vec![b("bold"), r("text")]),
            ("**a**<u></u>**b**", vec![b("ab")]),
            ("**héllo** wörld", vec![b("héllo"), r(" wörld")]),
            ("**a\nb**", vec![b("a\nb")]),
            // Crossed markers nest the way CommonMark nests them.
            ("**a *b** c*", vec![i("a b c")]),
        ],
        inline,
    );
}

#[test]
fn a_marker_that_does_not_close_stays_text() {
    table(
        vec![
            ("**unclosed", vec![r("**unclosed")]),
            ("unclosed*", vec![r("unclosed*")]),
            ("a * b * c", vec![r("a * b * c")]),
            ("2*3", vec![r("2*3")]),
            ("**", vec![r("**")]),
            ("****", vec![r("****")]),
            ("~single~ and H~2~O", vec![r("~single~ and H~2~O")]),
            ("~~~", vec![r("~~~")]),
            ("<u>unclosed", vec![r("<u>unclosed")]),
            ("</u>", vec![r("</u>")]),
            ("a`b", vec![r("a`b")]),
        ],
        inline,
    );
}

#[test]
fn underscores_inside_a_word_are_text() {
    table(
        vec![
            ("snake_case_name", vec![r("snake_case_name")]),
            ("_a_b", vec![r("_a_b")]),
            ("a_b_", vec![r("a_b_")]),
            ("__init__", vec![b("init")]),
            ("use _this_ one", vec![r("use "), i("this"), r(" one")]),
        ],
        inline,
    );
}

#[test]
fn code_spans_keep_their_contents_literal() {
    table(
        vec![
            ("`**not bold**`", vec![code("**not bold**")]),
            ("``a`b``", vec![code("a`b")]),
            ("` a `", vec![code("a")]),
            ("`  `", vec![code("  ")]),
            ("`a\\*b`", vec![code("a\\*b")]),
            (
                "say `x` then `y`",
                vec![r("say "), code("x"), r(" then "), code("y")],
            ),
            ("``open", vec![r("``open")]),
        ],
        inline,
    );
}

#[test]
fn a_dollar_starts_math_only_when_it_looks_like_math() {
    table(
        vec![
            ("the $x$ term", vec![r("the "), math("x"), r(" term")]),
            ("$5 and $6", vec![r("$5 and $6")]),
            ("it costs $5.", vec![r("it costs $5.")]),
            ("a $ b $ c", vec![r("a $ b $ c")]),
            ("$1$2", vec![r("$1$2")]),
            ("$a$b", vec![math("a"), r("b")]),
            ("$e^{i\\pi}+1=0$.", vec![math("e^{i\\pi}+1=0"), r(".")]),
            ("$a\\$b$", vec![math("a\\$b")]),
            ("$$a$b$$", vec![math("a$b")]),
            ("$$$$", vec![r("$$$$")]),
            ("$x", vec![r("$x")]),
            ("$ x$", vec![r("$ x$")]),
            ("\\$5 and \\$6", vec![r("$5 and $6")]),
        ],
        inline,
    );
}

#[test]
fn links_take_emphasis_in_their_text_and_do_not_nest() {
    table(
        vec![
            (
                "[link **bold**](u)",
                vec![linked(r("link "), "u"), linked(b("bold"), "u")],
            ),
            ("**[link](u)**", vec![linked(b("link"), "u")]),
            ("[**a**](u)", vec![linked(b("a"), "u")]),
            ("[a [b](c) d](e)", vec![linked(r("a [b](c) d"), "e")]),
            (
                "[q](https://w.org/a_(b))",
                vec![linked(r("q"), "https://w.org/a_(b)")],
            ),
            ("[a](b c)", vec![r("[a](b c)")]),
            ("[not a link]", vec![r("[not a link]")]),
            ("[](x) and [a]()", vec![r("[](x) and [a]()")]),
            ("\\[x\\](y)", vec![r("[x](y)")]),
            ("![alt](pic.png)", vec![r("!"), linked(r("alt"), "pic.png")]),
            (
                "<https://a.b/c?d=1&e=2> and more",
                vec![
                    linked(r("https://a.b/c?d=1&e=2"), "https://a.b/c?d=1&e=2"),
                    r(" and more"),
                ],
            ),
            ("<x:y> 1 < 2 > 0", vec![r("<x:y> 1 < 2 > 0")]),
        ],
        inline,
    );
}

#[test]
fn a_backslash_escapes_a_marker_and_nothing_else() {
    table(
        vec![
            ("\\*not italic\\*", vec![r("*not italic*")]),
            ("back\\\\slash", vec![r("back\\slash")]),
            ("C:\\dir", vec![r("C:\\dir")]),
            ("trailing\\", vec![r("trailing\\")]),
            ("\\`no code\\`", vec![r("`no code`")]),
            (
                "\\_a\\_ \\~ \\< \\> \\# \\( \\)",
                vec![r("_a_ ~ < > # ( )")],
            ),
            ("1\\. and \\- and \\+", vec![r("1. and - and +")]),
            ("\\**a**", vec![r("*"), i("a"), r("*")]),
            ("a  b", vec![r("a  b")]),
        ],
        inline,
    );
}

fn words() -> impl Strategy<Value = String> {
    "[A-Za-z0-9 ,.;:!?'\"%&=@/^{}|+#-]{0,60}"
}

fn soup() -> impl Strategy<Value = String> {
    let tokens = prop::sample::select(vec![
        "**",
        "*",
        "__",
        "_",
        "~~",
        "~",
        "`",
        "``",
        "[",
        "](u)",
        "](",
        "]",
        "(",
        ")",
        "<u>",
        "</u>",
        "<b>",
        "</i>",
        "<https://x.y>",
        "<",
        ">",
        "$",
        "$$",
        "\\",
        "\\*",
        "\n",
        " ",
        "  ",
        "a",
        "bc",
        "5",
        "é",
    ]);
    prop::collection::vec(tokens, 0..40).prop_map(|v| v.concat())
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(1000))]

    #[test]
    fn nothing_makes_it_panic(text in ".*", mixed in soup()) {
        let _ = inline(&text);
        let _ = inline(&mixed);
    }

    #[test]
    fn text_without_markers_comes_back_as_one_plain_run(text in words()) {
        let runs = inline(&text);
        if text.is_empty() {
            prop_assert!(runs.is_empty());
        } else {
            prop_assert_eq!(runs, vec![r(&text)]);
        }
    }

    #[test]
    fn no_run_is_empty_and_neighbours_differ(text in soup()) {
        let runs = inline(&text);
        prop_assert!(runs.iter().all(|run| !run.t.is_empty()));
        for pair in runs.windows(2) {
            let same = |a: &crate::model::Run, b: &crate::model::Run| {
                (a.bold, a.italic, a.strike, a.underline, a.code, a.math, &a.link)
                    == (b.bold, b.italic, b.strike, b.underline, b.code, b.math, &b.link)
            };
            prop_assert!(!same(&pair[0], &pair[1]), "{:?}", pair);
        }
    }
}

#[test]
fn long_runs_of_unfinished_markers_stay_fast() {
    // Every one of these would blow up a parser that tries again after each
    // marker that fails to close.
    for unit in [
        "*a ", "a* ", "_a ", "[a ", "`a", "$a ", "<u>", "~~a ", "**a *b ",
    ] {
        let text = unit.repeat(5000);
        let runs = inline(&text);
        let plain: String = runs.iter().map(|r| r.t.as_str()).collect();
        assert!(plain.len() >= text.len() / 2, "{unit:?}");
    }
}
