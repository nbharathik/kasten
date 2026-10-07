//! A page's text as Markdown that shows what the page showed and does
//! nothing more. The vault is read by other Markdown apps too,
//! and some show HTML and follow any link, so text cannot open a link or
//! a tag, links go only to web and mail addresses, and code cannot end
//! its fence early.

use super::resolve;

/// Text, escaped: backslashes and brackets, so no link can form, and a
/// `<` that could open a tag. `<3` stays as it is.
pub(super) fn plain(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' | '[' | ']' => {
                out.push('\\');
                out.push(c);
            }
            '<' if chars
                .peek()
                .is_some_and(|n| n.is_ascii_alphabetic() || matches!(n, '/' | '!' | '?')) =>
            {
                out.push_str("\\<");
            }
            _ => out.push(c),
        }
    }
    out
}

/// Where a link or image may lead: a web or mail address, made absolute,
/// with the characters that would end it early encoded. Anything else,
/// such as `javascript:` or `data:`, leads nowhere.
pub(super) fn target(base: &str, href: &str) -> Option<String> {
    let url = resolve(base, href);
    let lower = url.to_ascii_lowercase();
    if !["https://", "http://", "mailto:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
    {
        return None;
    }
    let mut out = String::with_capacity(url.len());
    for c in url.chars() {
        match c {
            '(' | ')' | '<' | '>' | '\\' => out.push_str(&format!("%{:02X}", c as u32)),
            c if c.is_whitespace() || c.is_control() => {
                let mut bytes = [0; 4];
                for byte in c.encode_utf8(&mut bytes).bytes() {
                    out.push_str(&format!("%{byte:02X}"));
                }
            }
            c => out.push(c),
        }
    }
    Some(out)
}

/// Inline code in as many backticks as it needs, so none inside ends it.
pub(super) fn code_span(code: &str) -> String {
    let fence = "`".repeat(longest_run(code) + 1);
    let pad = if code.starts_with('`') || code.ends_with('`') {
        " "
    } else {
        ""
    };
    format!("{fence}{pad}{code}{pad}{fence}")
}

/// A code block fenced by more backticks than it holds in a row, and its
/// language as letters, digits and `+#._-` only.
pub(super) fn code_block(code: &str, lang: &str) -> String {
    let fence = "`".repeat((longest_run(code) + 1).max(3));
    let lang: String = lang
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || "+#._-".contains(*c))
        .collect();
    format!("{fence}{lang}\n{code}\n{fence}")
}

fn longest_run(text: &str) -> usize {
    text.split(|c| c != '`').map(str::len).max().unwrap_or(0)
}
