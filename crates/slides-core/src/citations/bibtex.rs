//! A tolerant BibTeX reader. It finds the entries in a text and their fields
//! and does no more: a file written by hand, by a reference manager or by a
//! model has odd spacing, a missing comma, an entry that never closes, and
//! none of that may cost the entries around it. Nothing here recurses, panics
//! or reads without limit, so any text at all is safe to give it.

use std::collections::{BTreeMap, HashMap};

/// The most bytes of a text that are read, and the most entries taken from it.
pub const MOST_BYTES: usize = 8 * 1024 * 1024;
pub const MOST_ENTRIES: usize = 20_000;
/// The most bytes of one field's value kept, and the most fields kept for one entry.
pub const MOST_VALUE: usize = 16 * 1024;
const MOST_FIELDS: usize = 64;

/// An entry as written: its type in lower case, its key, and its fields by
/// lower-case name, with `@string` macros put in and the value's outer braces
/// or quotes taken off. Braces and commands inside a value are left as written.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Raw {
    pub kind: String,
    pub key: String,
    pub fields: BTreeMap<String, String>,
}

/// The largest prefix of `text` that is at most `max` bytes and ends between characters.
fn cut(text: &str, max: usize) -> &str {
    let mut end = max.min(text.len());
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

fn month(name: &str) -> Option<&'static str> {
    let short = name.get(..3)?;
    let at = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ]
    .iter()
    .position(|m| m.eq_ignore_ascii_case(short))?;
    (name.len() == 3).then_some(MONTHS[at])
}

fn is_blank(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\n' | b'\r' | 0x0b | 0x0c)
}

/// A byte that ends a key or a macro name.
fn ends_word(byte: u8) -> bool {
    is_blank(byte) || matches!(byte, b',' | b'}' | b')' | b'{' | b'(' | b'"' | b'#' | b'=')
}

fn in_field_name(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b':' | b'.')
}

struct Reader<'a> {
    text: &'a str,
    bytes: &'a [u8],
    at: usize,
    strings: HashMap<String, String>,
}

impl<'a> Reader<'a> {
    fn new(text: &'a str) -> Reader<'a> {
        let text = cut(text, MOST_BYTES);
        Reader {
            text,
            bytes: text.as_bytes(),
            at: 0,
            strings: HashMap::new(),
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.at).copied()
    }

    fn skip_blank(&mut self) {
        while self.peek().is_some_and(is_blank) {
            self.at += 1;
        }
    }

    /// Whether an entry begins at the `@` at `at`: letters, then a brace or a parenthesis.
    fn entry_begins(&self, at: usize) -> bool {
        let mut i = at + 1;
        let first = i;
        while self.bytes.get(i).is_some_and(u8::is_ascii_alphabetic) {
            i += 1;
        }
        if i == first {
            return false;
        }
        while self.bytes.get(i).copied().is_some_and(is_blank) {
            i += 1;
        }
        matches!(self.bytes.get(i), Some(b'{' | b'('))
    }

    /// Whether a line that starts an entry begins after the newline at `at`: the sign
    /// that a value never closed and the next entry has begun.
    fn new_entry_after(&self, at: usize) -> bool {
        self.bytes.get(at + 1) == Some(&b'@') && self.entry_begins(at + 1)
    }

    /// Moves to just after the next `@`, or to the end.
    fn find_at(&mut self) -> bool {
        let rest = self.bytes.get(self.at..).unwrap_or_default();
        match rest.iter().position(|b| *b == b'@') {
            Some(offset) => {
                self.at += offset + 1;
                true
            }
            None => {
                self.at = self.bytes.len();
                false
            }
        }
    }

    /// Reads a group whose opening brace has been read; returns the text inside it and
    /// whether it was cut short by the end or by the next entry.
    fn braced(&mut self) -> (&'a str, bool) {
        let start = self.at;
        let mut depth = 1usize;
        while let Some(byte) = self.peek() {
            match byte {
                b'\\' => self.at += 1,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        let inside = &self.text[start..self.at];
                        self.at += 1;
                        return (inside, false);
                    }
                }
                b'\n' if self.new_entry_after(self.at) => {
                    let inside = &self.text[start..self.at];
                    self.at += 1;
                    return (inside, true);
                }
                _ => {}
            }
            self.at += 1;
        }
        self.at = self.bytes.len();
        (&self.text[start.min(self.at)..], true)
    }

    /// Reads a quoted value whose opening quote has been read. Braces protect quotes.
    fn quoted(&mut self) -> (&'a str, bool) {
        let start = self.at;
        let mut depth = 0usize;
        while let Some(byte) = self.peek() {
            match byte {
                b'\\' => self.at += 1,
                b'{' => depth += 1,
                b'}' => depth = depth.saturating_sub(1),
                b'"' if depth == 0 => {
                    let inside = &self.text[start..self.at];
                    self.at += 1;
                    return (inside, false);
                }
                b'\n' if self.new_entry_after(self.at) => {
                    let inside = &self.text[start..self.at];
                    self.at += 1;
                    return (inside, true);
                }
                _ => {}
            }
            self.at += 1;
        }
        self.at = self.bytes.len();
        (&self.text[start.min(self.at)..], true)
    }

    /// Skips a group opened by `open` (a brace or a parenthesis), which has been read.
    fn skip_group(&mut self, open: u8) {
        if open == b'{' {
            self.braced();
            return;
        }
        let mut depth = 0usize;
        while let Some(byte) = self.peek() {
            self.at += 1;
            match byte {
                b'\\' => self.at += 1,
                b'{' => depth += 1,
                b'}' => depth = depth.saturating_sub(1),
                b')' if depth == 0 => return,
                b'\n' if self.new_entry_after(self.at - 1) => return,
                _ => {}
            }
        }
        self.at = self.bytes.len();
    }

    fn name(&mut self) -> &'a str {
        let start = self.at;
        while self.peek().is_some_and(|b| !ends_word(b)) {
            self.at += 1;
        }
        &self.text[start..self.at]
    }

    /// A field's value: braces, quotes, a number or a macro, joined by `#`.
    /// The second half says the value was cut short by the end or the next entry.
    fn value(&mut self) -> (Option<String>, bool) {
        let mut out = String::new();
        let mut any = false;
        loop {
            self.skip_blank();
            let (piece, broken): (String, bool) = match self.peek() {
                Some(b'{') => {
                    self.at += 1;
                    let (inside, broken) = self.braced();
                    (cut(inside, MOST_VALUE).to_owned(), broken)
                }
                Some(b'"') => {
                    self.at += 1;
                    let (inside, broken) = self.quoted();
                    (cut(inside, MOST_VALUE).to_owned(), broken)
                }
                Some(byte) if !ends_word(byte) => {
                    let word = self.name();
                    let key = word.to_ascii_lowercase();
                    let value = if word.bytes().all(|b| b.is_ascii_digit()) {
                        word.to_owned()
                    } else if let Some(text) = self.strings.get(&key) {
                        text.clone()
                    } else {
                        month(word).map_or_else(|| word.to_owned(), str::to_owned)
                    };
                    (value, false)
                }
                _ => break,
            };
            any = true;
            if out.len() < MOST_VALUE {
                out.push_str(&piece);
                out = cut(&out, MOST_VALUE).to_owned();
            }
            if broken {
                return (Some(out), true);
            }
            self.skip_blank();
            if self.peek() == Some(b'#') {
                self.at += 1;
            } else {
                break;
            }
        }
        (any.then_some(out), false)
    }

    /// `@string{name = value}`.
    fn string(&mut self) {
        self.skip_blank();
        let name = self.name().to_ascii_lowercase();
        self.skip_blank();
        if !name.is_empty() && self.peek() == Some(b'=') {
            self.at += 1;
            if let (Some(value), _) = self.value() {
                self.strings.insert(name, value);
            }
        }
        self.skip_rest();
    }

    /// After what an entry read, skips to its closing delimiter.
    fn skip_rest(&mut self) {
        while let Some(byte) = self.peek() {
            match byte {
                b'}' | b')' => {
                    self.at += 1;
                    return;
                }
                b'@' => return,
                b'\\' => self.at += 2,
                b'{' => {
                    self.at += 1;
                    self.braced();
                }
                _ => self.at += 1,
            }
        }
        self.at = self.bytes.len();
    }

    /// The fields of an entry whose key has been read, up to its closing delimiter.
    fn fields(&mut self) -> BTreeMap<String, String> {
        let mut fields = BTreeMap::new();
        loop {
            self.skip_blank();
            match self.peek() {
                None | Some(b'@') => break,
                Some(b',') => {
                    self.at += 1;
                    continue;
                }
                Some(b'}' | b')') => {
                    self.at += 1;
                    break;
                }
                _ => {}
            }
            let start = self.at;
            while self.peek().is_some_and(in_field_name) {
                self.at += 1;
            }
            if self.at == start {
                break;
            }
            let name = self.text[start..self.at].to_ascii_lowercase();
            self.skip_blank();
            if self.peek() != Some(b'=') {
                break;
            }
            self.at += 1;
            let (value, broken) = self.value();
            if let Some(value) = value
                && fields.len() < MOST_FIELDS
            {
                fields.entry(name).or_insert(value);
            }
            if broken {
                break;
            }
        }
        fields
    }

    /// An entry whose type and opening delimiter have been read.
    fn entry(&mut self, kind: String) -> Option<Raw> {
        self.skip_blank();
        let start = self.at;
        while self.peek().is_some_and(|b| !ends_word(b) || b == b'#') {
            self.at += 1;
        }
        let key = self.text[start..self.at].to_owned();
        if key.is_empty() {
            self.skip_rest();
            return None;
        }
        Some(Raw {
            kind,
            key,
            fields: self.fields(),
        })
    }

    fn read(mut self) -> Vec<Raw> {
        let mut entries = Vec::new();
        while entries.len() < MOST_ENTRIES && self.find_at() {
            self.skip_blank();
            let start = self.at;
            while self.peek().is_some_and(|b| b.is_ascii_alphanumeric()) {
                self.at += 1;
            }
            if self.at == start {
                continue;
            }
            let kind = self.text[start..self.at].to_ascii_lowercase();
            self.skip_blank();
            let Some(open @ (b'{' | b'(')) = self.peek() else {
                continue;
            };
            self.at += 1;
            match kind.as_str() {
                "comment" | "preamble" => self.skip_group(open),
                "string" => self.string(),
                _ => entries.extend(self.entry(kind)),
            }
        }
        entries
    }
}

/// The entries in `text`, in the order they are written.
pub fn read(text: &str) -> Vec<Raw> {
    Reader::new(text).read()
}
