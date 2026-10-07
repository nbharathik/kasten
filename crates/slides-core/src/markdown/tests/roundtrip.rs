//! The serializer undoes the parser: writing what `parse` read and reading
//! it again gives the same paragraphs, for whatever Markdown-ish text comes
//! in. Failures are kept as examples at the end.

use proptest::prelude::*;

use super::Show;
use crate::markdown::{parse, to_markdown};

/// How many strings each property tries; `PROPTEST_CASES` raises it.
fn cases() -> u32 {
    std::env::var("PROPTEST_CASES")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(1500)
}

fn pick(tokens: &[&'static str]) -> impl Strategy<Value = &'static str> + use<> {
    prop::sample::select(tokens.to_vec())
}

/// A string of the tokens Markdown is made of, mixed with words, spaces and
/// every kind of line ending.
fn soup() -> impl Strategy<Value = String> {
    let words = pick(&[
        "a",
        "foo",
        "Bar9",
        "x_y",
        "snake_case",
        "5",
        "1.",
        "é",
        "日本",
        "x",
        "1",
        "word",
    ]);
    let inline = pick(&[
        "**",
        "*",
        "__",
        "_",
        "~~",
        "~",
        "`",
        "``",
        "[",
        "](http://x.y)",
        "](u)",
        "](",
        "]",
        "(",
        ")",
        "<u>",
        "</u>",
        "<b>",
        "</i>",
        "<s>",
        "<https://x.y>",
        "<",
        ">",
        "$",
        "$$",
        "\\",
        "\\*",
        "\\\\",
        "\\#",
        "\\-",
        "$5",
        "$x$",
        "$a$b$",
        "&",
        "|",
    ]);
    let block = pick(&[
        "- ",
        "* ",
        "+ ",
        "1. ",
        "2) ",
        "  ",
        "    ",
        "\t",
        "# ",
        "## ",
        "### ",
        "> ",
        "```",
        "```rust\n",
        "~~~",
        "````",
        "#",
        "-",
        ">",
        "  - ",
        "    1. ",
        "\t- ",
    ]);
    let space = pick(&[" ", "  ", " ", "\t"]);
    let ending = pick(&["\n", "\n", "\r\n", "\n\n", "  \n", "\\\n", "\n  "]);
    let token = prop_oneof![
        4 => words,
        4 => inline,
        3 => block,
        2 => space,
        3 => ending,
    ];
    prop::collection::vec(token, 0..36).prop_map(|tokens| tokens.concat())
}

/// The same, with the block tokens where they matter: at the start of lines.
fn lines() -> impl Strategy<Value = String> {
    let start = pick(&[
        "", "", "", "- ", "* ", "1. ", "  - ", "    - ", "\t1) ", "# ", "## ", "### ", "> ",
        "```\n", "~~~x\n", "  ",
    ]);
    let rest = prop::collection::vec(
        pick(&[
            "a",
            "b c",
            "**",
            "*",
            "_",
            "~~",
            "`",
            "[",
            "](u)",
            "<u>",
            "</u>",
            "$",
            "\\",
            " ",
            "x_y",
            "5",
            "<https://x.y>",
        ]),
        0..6,
    )
    .prop_map(|v| v.concat());
    let end = pick(&["\n", "\n", "\n", "  \n", "\\\n", "\n\n", "\r\n"]);
    prop::collection::vec((start, rest, end), 0..7).prop_map(|lines| {
        lines
            .into_iter()
            .map(|(s, r, e)| format!("{s}{r}{e}"))
            .collect()
    })
}

fn stable(md: &str) -> Result<(), TestCaseError> {
    let read = parse(md);
    let written = to_markdown(&read);
    let again = parse(&written);
    prop_assert!(
        again == read,
        "\nsource  {md:?}\nwritten {written:?}\nread    {}\nagain   {}",
        read.show(),
        again.show()
    );
    // Writing what was read is a fixed point.
    prop_assert_eq!(to_markdown(&again), written);
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(cases()))]

    #[test]
    fn parse_of_to_markdown_of_parse_is_parse(md in soup()) {
        stable(&md)?;
    }

    #[test]
    fn the_same_holds_for_text_shaped_like_lines(md in lines()) {
        stable(&md)?;
    }

    #[test]
    fn the_same_holds_for_any_text(md in ".*") {
        stable(&md)?;
    }
}
