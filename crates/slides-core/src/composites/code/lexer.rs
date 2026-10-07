//! A small colouring lexer for the few languages the syntax definitions that
//! ship with the highlighter lack: TypeScript, Kotlin, Swift and TOML. It knows
//! comments, strings, numbers, a list of words for each language, calls and
//! annotations. That is less than a full grammar and more than none.

mod specs;
#[cfg(test)]
mod tests;

use super::highlight::{Tok, push};
use super::palette::Kind;
pub use specs::spec_for;

/// What a language is made of, for the lexer.
pub struct Spec {
    pub(super) keywords: &'static [&'static str],
    /// Keywords that are only keywords when they are not called: `get`, `set`, `from` ...
    pub(super) soft: &'static [&'static str],
    /// Built-in type names; any other capitalised word is a type too.
    pub(super) types: &'static [&'static str],
    pub(super) constants: &'static [&'static str],
    pub(super) line_comment: &'static str,
    pub(super) block_comment: bool,
    /// `'…'` is a string (in Swift it is not).
    pub(super) single_quotes: bool,
    /// Strings that run over lines: `` `…` `` for TypeScript.
    pub(super) backticks: bool,
    /// `"""…"""` (and `'''…'''` for TOML).
    pub(super) triple_quotes: bool,
    /// `@Name` is an annotation or decorator.
    pub(super) annotations: bool,
    pub(super) toml: bool,
}

/// A construct that runs over the end of a line.
#[derive(Clone, Copy, PartialEq)]
enum Open {
    Nothing,
    Block,
    /// A string that ends at this text.
    Str(&'static str),
}

/// The lines of code coloured, a token list for each.
pub fn lex(spec: &Spec, lines: &[&str]) -> Vec<Vec<Tok>> {
    let mut open = Open::Nothing;
    lines
        .iter()
        .map(|line| lex_line(spec, line, &mut open))
        .collect()
}

fn starts(chars: &[char], at: usize, text: &str) -> bool {
    !text.is_empty()
        && text
            .chars()
            .enumerate()
            .all(|(k, c)| chars.get(at + k) == Some(&c))
}

fn find(chars: &[char], from: usize, text: &str) -> Option<usize> {
    (from..chars.len()).find(|&at| starts(chars, at, text))
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '$'
}

fn text(chars: &[char], from: usize, to: usize) -> String {
    chars[from..to].iter().collect()
}

/// The end of a quoted string that starts at `at` and ends on this line (or at the line's end).
fn quoted(chars: &[char], at: usize) -> usize {
    let quote = chars[at];
    let mut i = at + 1;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 2,
            c if c == quote => return i + 1,
            _ => i += 1,
        }
    }
    chars.len()
}

fn lex_line(spec: &Spec, line: &str, open: &mut Open) -> Vec<Tok> {
    let cs: Vec<char> = line.chars().collect();
    let n = cs.len();
    let mut out = Vec::new();
    let mut i = 0;
    let mut first_word = true;
    while i < n {
        match *open {
            Open::Block => {
                let end = find(&cs, i, "*/").map(|e| e + 2);
                push(&mut out, text(&cs, i, end.unwrap_or(n)), Kind::Comment);
                if end.is_some() {
                    *open = Open::Nothing;
                }
                i = end.unwrap_or(n);
                continue;
            }
            Open::Str(closing) => {
                let mut j = i;
                let mut end = None;
                while j < n {
                    if cs[j] == '\\' && closing != "'''" {
                        j += 2;
                    } else if starts(&cs, j, closing) {
                        end = Some(j + closing.chars().count());
                        break;
                    } else {
                        j += 1;
                    }
                }
                let to = end.unwrap_or(n).min(n);
                push(&mut out, text(&cs, i, to), Kind::Str);
                if end.is_some() {
                    *open = Open::Nothing;
                }
                i = to;
                continue;
            }
            Open::Nothing => {}
        }
        let c = cs[i];
        if c.is_whitespace() {
            let end = (i..n).find(|&k| !cs[k].is_whitespace()).unwrap_or(n);
            push(&mut out, text(&cs, i, end), Kind::Plain);
            i = end;
            continue;
        }
        if starts(&cs, i, spec.line_comment) {
            push(&mut out, text(&cs, i, n), Kind::Comment);
            break;
        }
        if spec.block_comment && starts(&cs, i, "/*") {
            *open = Open::Block;
            push(&mut out, "/*".to_owned(), Kind::Comment);
            i += 2;
            continue;
        }
        if spec.toml && first_word && c == '[' {
            let end = find(&cs, i, "#").unwrap_or(n);
            let header = text(&cs, i, end);
            let trimmed = header.trim_end().chars().count();
            push(&mut out, text(&cs, i, i + trimmed), Kind::Keyword);
            i += trimmed;
            first_word = false;
            continue;
        }
        if spec.triple_quotes && (starts(&cs, i, "\"\"\"") || (spec.toml && starts(&cs, i, "'''")))
        {
            let delimiter = if c == '"' { "\"\"\"" } else { "'''" };
            *open = Open::Str(delimiter);
            push(&mut out, delimiter.to_owned(), Kind::Str);
            i += 3;
            continue;
        }
        if spec.backticks && c == '`' {
            *open = Open::Str("`");
            push(&mut out, "`".to_owned(), Kind::Str);
            i += 1;
            continue;
        }
        if c == '"' || (c == '\'' && spec.single_quotes) {
            let end = quoted(&cs, i);
            let kind = if spec.toml
                && first_word
                && cs[end.min(n)..].iter().find(|c| !c.is_whitespace()) == Some(&'=')
            {
                Kind::Type
            } else {
                Kind::Str
            };
            push(&mut out, text(&cs, i, end.min(n)), kind);
            i = end.min(n);
            first_word = false;
            continue;
        }
        let next_digit = cs.get(i + 1).is_some_and(char::is_ascii_digit);
        if c.is_ascii_digit() || (c == '.' && next_digit) {
            let end = (i + 1..n)
                .find(|&k| {
                    !(is_word(cs[k])
                        || cs[k] == '.'
                        || (spec.toml && matches!(cs[k], '-' | ':' | '+')))
                })
                .unwrap_or(n);
            push(&mut out, text(&cs, i, end), Kind::Number);
            i = end;
            first_word = false;
            continue;
        }
        if c == '@' && spec.annotations && cs.get(i + 1).is_some_and(|c| c.is_alphabetic()) {
            let end = (i + 1..n).find(|&k| !is_word(cs[k])).unwrap_or(n);
            push(&mut out, text(&cs, i, end), Kind::Function);
            i = end;
            first_word = false;
            continue;
        }
        if is_word(c) {
            let end = (i + 1..n)
                .find(|&k| !is_word(cs[k]) && !(spec.toml && cs[k] == '-'))
                .unwrap_or(n);
            let word = text(&cs, i, end);
            let after = cs[end..].iter().find(|c| !c.is_whitespace());
            let before = cs[..i].iter().rev().find(|c| !c.is_whitespace());
            let kind = classify(spec, &word, before.copied(), after.copied(), first_word);
            push(&mut out, word, kind);
            i = end;
            first_word = false;
            continue;
        }
        push(&mut out, c.to_string(), Kind::Plain);
        i += 1;
    }
    out
}

fn classify(
    spec: &Spec,
    word: &str,
    before: Option<char>,
    after: Option<char>,
    first: bool,
) -> Kind {
    if spec.toml {
        let key = first && after == Some('=');
        return match word {
            _ if key => Kind::Type,
            w if spec.constants.contains(&w) => Kind::Constant,
            _ => Kind::Plain,
        };
    }
    let member = before == Some('.');
    let called = after == Some('(') && spec.soft.contains(&word);
    if !member && !called && spec.keywords.contains(&word) {
        Kind::Keyword
    } else if !member && spec.constants.contains(&word) {
        Kind::Constant
    } else if spec.types.contains(&word)
        || (!member && word.chars().next().is_some_and(char::is_uppercase))
    {
        Kind::Type
    } else if after == Some('(') {
        Kind::Function
    } else {
        Kind::Plain
    }
}
