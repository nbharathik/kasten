use super::*;

fn kinds_of(language: &str, code: &str) -> Vec<(String, Kind)> {
    let lines: Vec<&str> = code.split('\n').collect();
    highlight(language, &lines)
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
fn keywords_and_strings_get_different_kinds_in_python() {
    let t = kinds_of(
        "python",
        "import os\n# hi\ndef f(x: int) -> str:\n    return 'a' + str(42) if x else None",
    );
    assert_eq!(kind_of(&t, "import"), Some(Kind::Keyword));
    assert_eq!(kind_of(&t, "def"), Some(Kind::Keyword));
    assert_eq!(kind_of(&t, "'a'"), Some(Kind::Str), "{t:?}");
    assert_eq!(kind_of(&t, "42"), Some(Kind::Number));
    assert_eq!(kind_of(&t, "f"), Some(Kind::Function));
    assert_eq!(kind_of(&t, "None"), Some(Kind::Constant));
    assert_eq!(
        kind_of(&t, "# hi\n".trim_end()),
        Some(Kind::Comment),
        "{t:?}"
    );
    assert_eq!(kind_of(&t, "x"), Some(Kind::Plain));
    assert_ne!(Kind::Keyword, Kind::Str);
}

#[test]
fn every_language_the_editor_offers_is_known_and_the_rest_are_plain() {
    for name in [
        "python",
        "javascript",
        "typescript",
        "rust",
        "go",
        "java",
        "c",
        "cpp",
        "csharp",
        "ruby",
        "php",
        "swift",
        "kotlin",
        "bash",
        "shell",
        "sql",
        "json",
        "yaml",
        "toml",
        "html",
        "css",
        "markdown",
        "diff",
        // The short names people type.
        "py",
        "js",
        "ts",
        "tsx",
        "jsx",
        "sh",
        "zsh",
        "rs",
        "kt",
        "c++",
        "c#",
        "cs",
        "rb",
        "yml",
        "md",
        "golang",
        "Python",
        "  RUST ",
        ".py",
        "python3",
        "objc",
        "scss",
    ] {
        assert!(is_known(name), "{name} should be coloured");
    }
    for name in [
        "",
        "text",
        "txt",
        "plain",
        "brainfuck",
        "not a language at all",
        "console",
    ] {
        assert!(!is_known(name), "{name} should be plain");
    }
    // A name followed by options, as fences write it.
    assert!(is_known("python {1,3}"));
}

#[test]
fn a_name_finds_the_right_syntax_not_a_cousin() {
    let name = |language: &str| match engine(language) {
        Engine::Syntax(s) => s.name.clone(),
        Engine::Lexer(_) => "lexer".to_owned(),
        Engine::Plain => "plain".to_owned(),
    };
    assert_eq!(name("c"), "C");
    assert_eq!(name("h"), "C");
    assert_eq!(name("cpp"), "C++");
    assert_eq!(name("c++"), "C++");
    assert_eq!(name("cs"), "C#");
    assert_eq!(name("sh"), "Bourne Again Shell (bash)");
    assert_eq!(name("js"), "JavaScript");
    assert_eq!(name("ts"), "lexer");
    assert_eq!(name("html"), "HTML");
    assert_eq!(name("php"), "PHP");
}

#[test]
fn json_keys_differ_from_values_and_a_diff_marks_what_went_and_what_came() {
    let t = kinds_of("json", "{\"name\": \"x\", \"n\": 1, \"ok\": true}");
    assert_eq!(kind_of(&t, "\"name\""), Some(Kind::Type), "{t:?}");
    assert_eq!(kind_of(&t, "\"x\""), Some(Kind::Str));
    assert_eq!(kind_of(&t, "1"), Some(Kind::Number));
    assert_eq!(kind_of(&t, "true"), Some(Kind::Constant));
    let d = kinds_of("diff", "@@ -1,2 +1,2 @@\n-old\n+new\n same");
    assert_eq!(kind_of(&d, "-old"), Some(Kind::Deleted), "{d:?}");
    assert_eq!(kind_of(&d, "+new"), Some(Kind::Inserted));
    assert_eq!(kind_of(&d, "same"), Some(Kind::Plain));
}

#[test]
fn colouring_carries_over_lines() {
    let t = kinds_of("python", "s = \"\"\"one\ntwo\"\"\"\nx = 1");
    assert!(
        t.iter()
            .any(|(text, kind)| text.starts_with("two") && *kind == Kind::Str),
        "{t:?}"
    );
    let js = kinds_of("js", "/* one\ntwo */ let a = 1;");
    assert!(
        js.iter()
            .any(|(text, kind)| text.starts_with("two") && *kind == Kind::Comment),
        "{js:?}"
    );
}

#[test]
fn tabs_become_spaces_up_to_the_next_stop_of_four() {
    let out = highlight("text", &["\tx", "ab\tc", "abcd\te", "日\tx"]);
    let text = |i: usize| out[i].iter().map(|t| t.text.as_str()).collect::<String>();
    assert_eq!(text(0), "    x");
    assert_eq!(text(1), "ab  c");
    assert_eq!(text(2), "abcd    e");
    assert_eq!(text(3), "日  x", "a wide letter takes two columns");
    let make = highlight("make", &["all:\n", "\techo hi"]);
    assert!(make[1][0].text.starts_with("    "));
}

#[test]
fn what_comes_back_is_the_code_again_line_for_line() {
    let code = "fn main() {\n\tlet s = \"a\\tb\"; // c\n\n    println!(\"{}\", s);\n}\n";
    for language in [
        "rust",
        "python",
        "text",
        "typescript",
        "sql",
        "html",
        "toml",
        "brainfuck",
    ] {
        let lines: Vec<&str> = code.split('\n').collect();
        let out = highlight(language, &lines);
        assert_eq!(out.len(), lines.len(), "{language}");
        for (line, tokens) in lines.iter().zip(&out) {
            let joined: String = tokens.iter().map(|t| t.text.as_str()).collect();
            assert_eq!(joined, line.replace('\t', "    "), "{language}: {line:?}");
        }
    }
}

#[test]
fn a_huge_block_and_a_huge_line_are_coloured_only_as_far_as_is_useful() {
    let many: Vec<String> = (0..1000).map(|i| format!("x = {i}  # n")).collect();
    let lines: Vec<&str> = many.iter().map(String::as_str).collect();
    let out = highlight("python", &lines);
    assert_eq!(out.len(), 1000);
    assert!(out[0].len() > 1, "the first lines are coloured");
    assert_eq!(out[999].len(), 1, "the last are plain");
    let long = "y = 1 ".repeat(5000);
    let out = highlight("python", &[long.as_str()]);
    assert_eq!(out[0].len(), 1);
}

#[test]
fn tokens_of_the_same_kind_are_joined() {
    let mut line = Vec::new();
    push(&mut line, "a".into(), Kind::Plain);
    push(&mut line, "b".into(), Kind::Plain);
    push(&mut line, "".into(), Kind::Keyword);
    push(&mut line, "c".into(), Kind::Keyword);
    assert_eq!(
        line,
        [
            Tok {
                text: "ab".into(),
                kind: Kind::Plain
            },
            Tok {
                text: "c".into(),
                kind: Kind::Keyword
            }
        ]
    );
}

#[test]
fn every_rule_is_a_selector_the_highlighter_understands() {
    for (selector, _) in RULES {
        assert!(ScopeSelectors::from_str(selector).is_ok(), "{selector}");
    }
    assert_eq!(build_theme().scopes.len(), RULES.len());
}
