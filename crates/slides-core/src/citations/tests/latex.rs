use crate::citations::latex::plain;

#[test]
fn braces_that_protect_capitals_are_not_shown() {
    assert_eq!(
        plain("{BERT}: Pre-training of {D}eep Transformers"),
        "BERT: Pre-training of Deep Transformers"
    );
    assert_eq!(plain("{{Nested}} braces"), "Nested braces");
}

#[test]
fn accents_and_letters_become_the_characters_they_stand_for() {
    let cases = [
        ("{\\'e}cole", "école"),
        ("M{\\\"u}ller", "Müller"),
        ("\\\"Uber", "Über"),
        ("Erd\\H{o}s", "Erdős"),
        ("{\\L}ukasz Kaiser", "Łukasz Kaiser"),
        ("Fran\\c{c}ois", "François"),
        ("\\v{S}ari\\'c", "Šarić"),
        ("Bj{\\o}rn", "Bjørn"),
        ("Stra{\\ss}e", "Straße"),
        ("Garc\\'{\\i}a", "García"),
        ("Pe\\~na", "Peña"),
        ("\\`a la carte", "à la carte"),
        ("Ren\\'e", "René"),
        ("\\AA ngstr{\\\"o}m", "Ångström"),
        ("Kr\\^oli", "Krôli"),
        ("\\c c", "ç"),
    ];
    for (raw, shown) in cases {
        assert_eq!(plain(raw), shown, "{raw}");
    }
}

#[test]
fn an_accent_it_does_not_know_is_dropped_and_the_letter_stays() {
    assert_eq!(plain("\\'q"), "q");
    assert_eq!(plain("x\\'{}y"), "xy");
}

#[test]
fn escaped_characters_and_dashes() {
    assert_eq!(plain("AT\\&T"), "AT&T");
    assert_eq!(
        plain("100\\% of \\$5 in \\#1 and a\\_b"),
        "100% of $5 in #1 and a_b"
    );
    assert_eq!(plain("pages 1--3"), "pages 1–3");
    assert_eq!(plain("wait --- what"), "wait — what");
    assert_eq!(plain("Dr.~Who"), "Dr. Who");
    assert_eq!(plain("``quoted''"), "“quoted”");
    assert_eq!(plain("a\\{b\\}c"), "a{b}c");
}

#[test]
fn formatting_commands_keep_their_words() {
    assert_eq!(plain("\\textit{Nature} \\textbf{news}"), "Nature news");
    assert_eq!(plain("\\emph{a} \\url{http://x.y/z}"), "a http://x.y/z");
    assert_eq!(plain("\\foo{bar} \\baz qux"), "bar qux");
    assert_eq!(plain("\\LaTeX{} and \\TeX"), "LaTeX and TeX");
}

#[test]
fn math_is_shown_without_its_dollars_and_commands() {
    assert_eq!(plain("$k$-nearest neighbours"), "k-nearest neighbours");
    assert_eq!(
        plain("$\\alpha$-divergence and $\\Sigma_k$"),
        "α-divergence and Σ_k"
    );
    assert_eq!(plain("$O(n^2)$"), "O(n^2)");
}

#[test]
fn whitespace_of_every_kind_becomes_single_spaces() {
    assert_eq!(plain("  a\n\t  b \r\n c  "), "a b c");
    assert_eq!(plain("a\\\\b"), "a b");
    assert_eq!(plain("a\\ b\\,c"), "a b c");
    assert_eq!(plain(""), "");
}

#[test]
fn unicode_passes_through_and_nothing_hostile_panics() {
    assert_eq!(plain("Ünïcödé — 日本語 🎓"), "Ünïcödé — 日本語 🎓");
    let mut hostile: Vec<String> = [
        "\\",
        "\\\\\\",
        "{",
        "}}}{{{",
        "\\c",
        "\\c{",
        "\\'",
        "\\'{",
        "$",
        "\\v{\\",
        "--------",
        "\u{0}\u{7f}",
    ]
    .iter()
    .map(|s| (*s).to_owned())
    .collect();
    hostile.push("\\a{".repeat(10_000));
    hostile.push("{".repeat(100_000));
    hostile.push("\\'é\\c€".repeat(1000));
    for text in &hostile {
        let _ = plain(text);
    }
}
