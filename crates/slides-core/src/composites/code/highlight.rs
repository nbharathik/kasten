//! Colours code. Most languages use the syntax definitions that ship with the
//! `syntect` crate; the few it lacks (TypeScript, Kotlin, Swift, TOML) use a
//! small lexer; anything else is plain. The result is the same for the editor,
//! the command line and exports, because it is worked out here once.

use std::str::FromStr;
use std::sync::OnceLock;

use syntect::easy::HighlightLines;
use syntect::highlighting::{
    Color, ScopeSelectors, StyleModifier, Theme, ThemeItem, ThemeSettings,
};
use syntect::parsing::{SyntaxReference, SyntaxSet};

use super::lexer;
use super::palette::Kind;
use crate::composites::measure::columns;

/// How many lines are coloured. Past what a slide can show they are left plain.
const MAX_LINES: usize = 240;

/// Lines longer than this (in bytes) are left plain: they would shrink a block to nothing anyway.
const MAX_LINE: usize = 2000;

/// The distance between tab stops, in columns.
pub const TAB: usize = 4;

/// One stretch of a line with one kind.
#[derive(Clone, Debug, PartialEq)]
pub struct Tok {
    pub text: String,
    pub kind: Kind,
}

/// Adds `text` to the tokens of a line, joined to the last one when it is of the same kind.
pub fn push(line: &mut Vec<Tok>, text: String, kind: Kind) {
    if text.is_empty() {
        return;
    }
    match line.last_mut() {
        Some(last) if last.kind == kind => last.text.push_str(&text),
        _ => line.push(Tok { text, kind }),
    }
}

fn plain(line: &str) -> Vec<Tok> {
    let mut tokens = Vec::new();
    push(&mut tokens, line.to_owned(), Kind::Plain);
    tokens
}

/// Which scopes get which kind. The most specific selector that matches wins, so
/// `keyword.operator` (plain) beats `keyword`, and `keyword.operator.word` beats both.
const RULES: &[(&str, Kind)] = &[
    ("comment", Kind::Comment),
    ("markup.quote", Kind::Comment),
    ("string", Kind::Str),
    ("markup.raw", Kind::Str),
    ("constant.numeric", Kind::Number),
    ("constant", Kind::Constant),
    ("support.constant", Kind::Constant),
    ("variable.language", Kind::Constant),
    ("keyword", Kind::Keyword),
    ("keyword.operator", Kind::Plain),
    ("keyword.operator.word", Kind::Keyword),
    ("storage", Kind::Keyword),
    ("markup.heading", Kind::Keyword),
    ("entity.name.tag", Kind::Keyword),
    ("entity.name.tag.yaml", Kind::Type),
    ("meta.mapping.key string", Kind::Type),
    ("meta.structure.dictionary.key string", Kind::Type),
    ("entity.name.function", Kind::Function),
    ("support.function", Kind::Function),
    ("variable.function", Kind::Function),
    ("support.macro", Kind::Function),
    ("variable.annotation", Kind::Function),
    ("punctuation.definition.annotation", Kind::Function),
    ("markup.underline.link", Kind::Function),
    ("meta.diff.header", Kind::Function),
    ("entity.name.type", Kind::Type),
    ("entity.name.class", Kind::Type),
    ("entity.name.struct", Kind::Type),
    ("entity.name.enum", Kind::Type),
    ("entity.name.trait", Kind::Type),
    ("entity.name.interface", Kind::Type),
    ("entity.name.namespace", Kind::Type),
    ("entity.other.inherited-class", Kind::Type),
    ("entity.other.attribute-name", Kind::Type),
    ("support.class", Kind::Type),
    ("support.type", Kind::Type),
    ("meta.diff.range", Kind::Type),
    ("source.shell variable.other", Kind::Constant),
    ("source.shell variable.parameter.option", Kind::Type),
    ("markup.inserted", Kind::Inserted),
    ("markup.deleted", Kind::Deleted),
];

/// The colour a kind is coloured with inside syntect: its number, so the answer
/// can be read back as a kind and the palette chosen afterwards.
fn encoded(kind: Kind) -> Color {
    Color {
        r: kind as u8,
        g: 0,
        b: 0,
        a: 0xff,
    }
}

fn build_theme() -> Theme {
    let scopes = RULES
        .iter()
        .filter_map(|(selector, kind)| {
            Some(ThemeItem {
                scope: ScopeSelectors::from_str(selector).ok()?,
                style: StyleModifier {
                    foreground: Some(encoded(*kind)),
                    background: None,
                    font_style: None,
                },
            })
        })
        .collect();
    Theme {
        name: None,
        author: None,
        settings: ThemeSettings {
            foreground: Some(encoded(Kind::Plain)),
            ..ThemeSettings::default()
        },
        scopes,
    }
}

fn theme() -> &'static Theme {
    static THEME: OnceLock<Theme> = OnceLock::new();
    THEME.get_or_init(build_theme)
}

fn syntaxes() -> &'static SyntaxSet {
    static SET: OnceLock<SyntaxSet> = OnceLock::new();
    SET.get_or_init(SyntaxSet::load_defaults_newlines)
}

/// How a language is coloured.
enum Engine {
    Plain,
    Lexer(&'static lexer::Spec),
    Syntax(&'static SyntaxReference),
}

/// A language name as people write it: lower case, one word, no dot in front.
fn normal(language: &str) -> String {
    language
        .trim()
        .trim_start_matches('.')
        .split(|c: char| c.is_whitespace() || c == ',' || c == '{' || c == '(')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// The name or extension the syntax definitions know a language by; None for no colouring.
fn alias(name: &str) -> Option<&str> {
    Some(match name {
        "" | "text" | "txt" | "plain" | "plaintext" | "none" | "nohighlight" | "output"
        | "console" | "log" | "ascii" => return None,
        "python" | "python3" | "py3" => "py",
        "javascript" | "node" | "nodejs" | "mjs" | "cjs" | "jsx" => "js",
        "rust" => "rs",
        "golang" => "go",
        "h" => "c",
        "c++" | "cc" | "cxx" | "hpp" | "hh" | "hxx" => "cpp",
        "csharp" | "c#" => "cs",
        "ruby" => "rb",
        "shell" | "zsh" | "fish" | "shellscript" | "shell-session" => "sh",
        "postgres" | "postgresql" | "mysql" | "sqlite" | "plsql" => "sql",
        "jsonc" | "json5" => "json",
        "yml" => "yaml",
        "htm" | "xhtml" => "html",
        "svg" | "xsd" | "xslt" | "plist" => "xml",
        "scss" | "less" => "css",
        "markdown" | "mdown" => "md",
        "patch" => "diff",
        "objc" | "objective-c" | "objectivec" => "m",
        "makefile" | "mk" => "make",
        "batch" | "cmd" => "bat",
        "gradle" => "groovy",
        "graphviz" | "gv" => "dot",
        other => other,
    })
}

fn engine(language: &str) -> Engine {
    let name = normal(language);
    if let Some(spec) = lexer::spec_for(&name) {
        return Engine::Lexer(spec);
    }
    let Some(token) = alias(&name) else {
        return Engine::Plain;
    };
    let set = syntaxes();
    set.syntaxes()
        .iter()
        .rev()
        .find(|s| s.name.eq_ignore_ascii_case(token))
        .or_else(|| set.find_syntax_by_extension(token))
        .map_or(Engine::Plain, Engine::Syntax)
}

/// Whether `language` is one that gets colours.
#[cfg(test)]
pub fn is_known(language: &str) -> bool {
    !matches!(engine(language), Engine::Plain)
}

fn coloured(syntax: &SyntaxReference, lines: &[&str]) -> Vec<Vec<Tok>> {
    let set = syntaxes();
    let mut colouring = HighlightLines::new(syntax, theme());
    let mut broken = false;
    lines
        .iter()
        .map(|line| {
            if broken || line.len() > MAX_LINE {
                return plain(line);
            }
            let with_end = format!("{line}\n");
            match colouring.highlight_line(&with_end, set) {
                Ok(spans) => {
                    let mut tokens = Vec::new();
                    for (style, text) in spans {
                        push(
                            &mut tokens,
                            text.trim_end_matches('\n').to_owned(),
                            Kind::from_number(style.foreground.r),
                        );
                    }
                    tokens
                }
                Err(_) => {
                    // The grammar gave up on this line; the rest cannot be trusted either.
                    broken = true;
                    plain(line)
                }
            }
        })
        .collect()
}

/// The tokens with each tab replaced by spaces up to the next tab stop.
fn expand_tabs(tokens: Vec<Tok>) -> Vec<Tok> {
    if !tokens.iter().any(|t| t.text.contains('\t')) {
        return tokens;
    }
    let mut column = 0;
    let mut out = Vec::new();
    for token in tokens {
        let mut text = String::new();
        for c in token.text.chars() {
            if c == '\t' {
                let spaces = TAB - column % TAB;
                text.extend(std::iter::repeat_n(' ', spaces));
                column += spaces;
            } else {
                text.push(c);
                column += columns(c.encode_utf8(&mut [0; 4]));
            }
        }
        push(&mut out, text, token.kind);
    }
    out
}

/// The lines of code coloured for `language`: a list of tokens for each line, tabs
/// expanded to spaces. Every line comes back, in order; an empty line has no tokens.
pub fn highlight(language: &str, lines: &[&str]) -> Vec<Vec<Tok>> {
    let head = &lines[..lines.len().min(MAX_LINES)];
    let mut out = match engine(language) {
        Engine::Plain => head.iter().map(|line| plain(line)).collect(),
        Engine::Lexer(spec) => lexer::lex(spec, head),
        Engine::Syntax(syntax) => coloured(syntax, head),
    };
    out.extend(lines[head.len()..].iter().map(|line| plain(line)));
    out.into_iter().map(expand_tabs).collect()
}

#[cfg(test)]
mod tests;
