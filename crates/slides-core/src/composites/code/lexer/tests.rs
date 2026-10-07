use super::specs::{KOTLIN, SWIFT, TOML, TS};
use super::*;

fn kinds(spec: &Spec, code: &str) -> Vec<(String, Kind)> {
    let lines: Vec<&str> = code.split('\n').collect();
    lex(spec, &lines)
        .into_iter()
        .flatten()
        .filter(|t| !t.text.trim().is_empty())
        .map(|t| (t.text, t.kind))
        .collect()
}

/// The kind of the token that is `word`, or else of the first one that holds it (plain words join their neighbours).
fn kind_of(tokens: &[(String, Kind)], word: &str) -> Option<Kind> {
    tokens
        .iter()
        .find(|(t, _)| t == word)
        .or_else(|| tokens.iter().find(|(t, _)| t.contains(word)))
        .map(|(_, k)| *k)
}

#[test]
fn typescript_words_strings_comments_and_numbers_have_their_own_kinds() {
    let t = kinds(
        &TS,
        "interface User { name: string; id: 42 } // who\nconst s = `a${1}\nb`;\n@Component()\nclass App {}",
    );
    assert_eq!(kind_of(&t, "interface"), Some(Kind::Keyword));
    assert_eq!(kind_of(&t, "User"), Some(Kind::Type));
    assert_eq!(kind_of(&t, "string"), Some(Kind::Type));
    assert_eq!(kind_of(&t, "42"), Some(Kind::Number));
    assert_eq!(kind_of(&t, "// who"), Some(Kind::Comment));
    assert_eq!(kind_of(&t, "@Component"), Some(Kind::Function));
    assert_eq!(kind_of(&t, "name"), Some(Kind::Plain));
    assert_eq!(
        kind_of(&t, "b`;"),
        None,
        "the string ends at the closing quote"
    );
    assert!(
        t.iter()
            .any(|(text, kind)| text == "b`" && *kind == Kind::Str),
        "{t:?}"
    );
}

#[test]
fn a_member_is_not_a_keyword_and_a_call_is_a_function() {
    let t = kinds(&TS, "Array.from(xs).map(f)");
    assert_eq!(kind_of(&t, "from"), Some(Kind::Function));
    assert_eq!(kind_of(&t, "map"), Some(Kind::Function));
    assert_eq!(kind_of(&t, "Array"), Some(Kind::Type));
}

#[test]
fn a_soft_keyword_that_is_called_is_a_function() {
    let t = kinds(
        &TS,
        "function get(id) { return set(id) }\nlet type = 1; for (const x of xs) {}",
    );
    assert_eq!(kind_of(&t, "get"), Some(Kind::Function));
    assert_eq!(kind_of(&t, "set"), Some(Kind::Function));
    assert_eq!(kind_of(&t, "of"), Some(Kind::Keyword));
    assert_eq!(kind_of(&t, "function"), Some(Kind::Keyword));
}

#[test]
fn block_comments_and_triple_quoted_strings_run_over_lines() {
    let t = kinds(
        &KOTLIN,
        "/* one\ntwo */ val x = \"\"\"a\nb\"\"\"\nfun main() {}",
    );
    assert_eq!(kind_of(&t, "/*"), Some(Kind::Comment));
    assert_eq!(kind_of(&t, "two */"), Some(Kind::Comment));
    assert_eq!(kind_of(&t, "val"), Some(Kind::Keyword));
    assert_eq!(kind_of(&t, "b\"\"\""), Some(Kind::Str));
    assert_eq!(kind_of(&t, "fun"), Some(Kind::Keyword));
    assert_eq!(kind_of(&t, "main"), Some(Kind::Function));
}

#[test]
fn swift_has_no_single_quoted_strings() {
    let t = kinds(&SWIFT, "let n = nil // none\nfunc f() -> Int { 'x' }");
    assert_eq!(kind_of(&t, "let"), Some(Kind::Keyword));
    assert_eq!(kind_of(&t, "nil"), Some(Kind::Constant));
    assert_eq!(kind_of(&t, "Int"), Some(Kind::Type));
    assert_ne!(kind_of(&t, "'"), Some(Kind::Str));
}

#[test]
fn toml_has_tables_keys_values_and_comments() {
    let t = kinds(
        &TOML,
        "[package] # the crate\nname = \"slides\"\nversion = 1.5\nok = true\ndate = 1979-05-27T07:32:00Z",
    );
    assert_eq!(kind_of(&t, "[package]"), Some(Kind::Keyword));
    assert_eq!(kind_of(&t, "# the crate"), Some(Kind::Comment));
    assert_eq!(kind_of(&t, "name"), Some(Kind::Type));
    assert_eq!(kind_of(&t, "\"slides\""), Some(Kind::Str));
    assert_eq!(kind_of(&t, "1.5"), Some(Kind::Number));
    assert_eq!(kind_of(&t, "true"), Some(Kind::Constant));
    assert_eq!(kind_of(&t, "1979-05-27T07:32:00Z"), Some(Kind::Number));
}

#[test]
fn only_the_four_languages_have_a_lexer() {
    for name in ["typescript", "ts", "tsx", "kotlin", "kt", "swift", "toml"] {
        assert!(spec_for(name).is_some(), "{name}");
    }
    assert!(spec_for("python").is_none());
}

#[test]
fn the_text_of_the_tokens_is_the_line_again() {
    let code = "  const a = \"x\\\"y\"; /* c */ let b = 1.5e3 // end";
    let tokens = lex(&TS, &[code]).remove(0);
    let joined: String = tokens.iter().map(|t| t.text.as_str()).collect();
    assert_eq!(joined, code);
}
