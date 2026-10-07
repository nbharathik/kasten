//! Reading the lines of a note for a deck: pictures, citations, and the plain
//! words of a line.

/// A picture a line names: the words that describe it and the address as written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Picture {
    pub alt: String,
    pub src: String,
}

const PICTURES: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/// Whether a file name is one of the pictures a deck can show.
pub(super) fn is_picture(name: &str) -> bool {
    name.rsplit_once('.')
        .is_some_and(|(_, ext)| PICTURES.contains(&ext.trim().to_ascii_lowercase().as_str()))
}

/// The pictures on a line, `![alt](src)` and `![[name.png|alt]]`, and the line without them.
pub(super) fn pictures_in(line: &str) -> (Vec<Picture>, String) {
    let mut found = Vec::new();
    let mut rest = String::new();
    let mut at = 0;
    while at < line.len() {
        let tail = &line[at..];
        if let Some(after) = tail.strip_prefix("![[")
            && let Some(end) = after.find("]]")
        {
            let (name, alt) = after[..end].split_once('|').unwrap_or((&after[..end], ""));
            if is_picture(name) {
                found.push(Picture {
                    alt: alt.trim().to_owned(),
                    src: name.trim().to_owned(),
                });
                at += 3 + end + 2;
                continue;
            }
        } else if let Some(after) = tail.strip_prefix("![")
            && let Some(close) = after.find("](")
            && let Some(end) = after[close + 2..].find(')')
        {
            let target = after[close + 2..close + 2 + end].trim();
            let src = target
                .split_whitespace()
                .next()
                .unwrap_or("")
                .trim_matches(['<', '>']);
            if !src.is_empty() {
                found.push(Picture {
                    alt: after[..close].trim().to_owned(),
                    src: src.to_owned(),
                });
                at += 2 + close + 2 + end + 1;
                continue;
            }
        }
        let Some(ch) = tail.chars().next() else { break };
        rest.push(ch);
        at += ch.len_utf8();
    }
    (found, rest)
}

/// The LaTeX commands that cite.
const CITES: [&str; 8] = [
    "cite",
    "citep",
    "citet",
    "parencite",
    "textcite",
    "autocite",
    "citeauthor",
    "citeyear",
];

fn key_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | ':' | '.' | '+' | '/' | '-')
}

/// A key as it is written, without the punctuation of the sentence round it.
fn clean_key(raw: &str) -> Option<String> {
    let key = raw
        .trim()
        .trim_matches(|c: char| !(c.is_alphanumeric() || c == '_'));
    let dated = key.len() == 10
        && key.bytes().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        });
    (key.chars().count() > 1 && !dated).then(|| key.to_owned())
}

fn add(keys: &mut Vec<String>, raw: &str) {
    if let Some(key) = clean_key(raw)
        && !keys.contains(&key)
    {
        keys.push(key);
    }
}

/// The keys a bracket group names with `@`: `@key` at the start or after a space, `;`, `[` or `-`.
fn at_keys(group: &str, keys: &mut Vec<String>) {
    for (i, _) in group.match_indices('@') {
        let before = group[..i].chars().next_back();
        if before.is_none_or(|c| c.is_whitespace() || matches!(c, ';' | '[' | '-' | '(')) {
            let key: String = group[i + 1..]
                .chars()
                .take_while(|c| key_char(*c))
                .collect();
            add(keys, &key);
        }
    }
}

/// Pandoc's `[@key]`, `[see @a; @b, p. 3]` and LaTeX's `\cite{a,b}`, in the order they come.
pub(super) fn cited_keys(text: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let mut from = 0;
    while from < text.len() {
        let rest = &text[from..];
        let Some(open) = rest.find(['[', '\\']) else {
            break;
        };
        let at = from + open;
        let tail = &text[at..];
        if let Some(group) = tail.strip_prefix('[') {
            let previous = text[..at].chars().next_back();
            if previous != Some('!')
                && !group.starts_with('[')
                && let Some(end) = group.find(']')
            {
                at_keys(&group[..end], &mut keys);
                from = at + 1 + end;
                continue;
            }
            from = at + 1;
        } else {
            let after = &tail[1..];
            let name: String = after
                .chars()
                .take_while(char::is_ascii_alphabetic)
                .collect();
            from = at + 1 + name.len();
            if !CITES.contains(&name.as_str()) {
                continue;
            }
            let mut rest = &text[from..];
            rest = rest.strip_prefix('*').unwrap_or(rest);
            for _ in 0..2 {
                if rest.starts_with('[')
                    && let Some(end) = rest.find(']')
                {
                    rest = &rest[end + 1..];
                }
            }
            if let Some(inner) = rest.strip_prefix('{')
                && let Some(end) = inner.find('}')
            {
                for key in inner[..end].split(',') {
                    add(&mut keys, key);
                }
            }
        }
    }
    keys
}

/// A line's words without markup that has no meaning on a slide: wiki links
/// become their alias or title, links their text, HTML and comments go, and so
/// do the citations (they are footers).
pub(super) fn plain(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    while let Some(at) = rest.find(['[', '<', '\\']) {
        out.push_str(&rest[..at]);
        let tail = &rest[at..];
        if let Some(after) = tail.strip_prefix("[[")
            && let Some(end) = after.find("]]")
        {
            let inner = &after[..end];
            let shown = inner.split_once('|').map_or_else(
                || inner.split('#').next().unwrap_or(inner),
                |(_, alias)| alias,
            );
            out.push_str(shown.trim());
            rest = &after[end + 2..];
        } else if let Some(after) = tail.strip_prefix("<!--") {
            rest = after.find("-->").map_or("", |end| &after[end + 3..]);
        } else if tail.starts_with('<')
            && tail[1..].starts_with(|c: char| c.is_ascii_alphabetic() || c == '/')
        {
            rest = tail.find('>').map_or("", |end| &tail[end + 1..]);
        } else if tail.starts_with("\\cite") {
            let name_end = tail[1..]
                .find(|c: char| !c.is_ascii_alphabetic())
                .map_or(tail.len(), |n| n + 1);
            if CITES.contains(&&tail[1..name_end]) {
                let mut after = &tail[name_end..];
                after = after.strip_prefix('*').unwrap_or(after);
                while after.starts_with('[') {
                    after = after.find(']').map_or("", |end| &after[end + 1..]);
                }
                rest = after
                    .strip_prefix('{')
                    .and_then(|inner| inner.find('}').map(|end| &inner[end + 1..]))
                    .unwrap_or(after);
            } else {
                out.push('\\');
                rest = &tail[1..];
            }
        } else if let Some(after) = tail.strip_prefix('[')
            && let Some(close) = after.find(']')
        {
            let text = &after[..close];
            let after_close = &after[close + 1..];
            if let Some(paren) = after_close.strip_prefix('(')
                && let Some(end) = paren.find(')')
            {
                out.push_str(text);
                rest = &paren[end + 1..];
            } else if text.contains('@') {
                // A pandoc citation: a footer, not words.
                rest = after_close;
            } else {
                out.push('[');
                rest = after;
            }
        } else {
            out.push_str(&tail[..1]);
            rest = &tail[1..];
        }
    }
    out.push_str(rest);
    let joined = out.split_whitespace().collect::<Vec<_>>().join(" ");
    joined
        .replace(" ,", ",")
        .replace(" .", ".")
        .replace(" ;", ";")
}

/// The first sentence of some prose, cut at a word when it is long.
pub(super) fn first_sentence(text: &str, most: usize) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut end = flat.len();
    let bytes = flat.as_bytes();
    for i in 0..bytes.len().saturating_sub(2) {
        if matches!(bytes[i], b'.' | b'!' | b'?')
            && bytes[i + 1] == b' '
            && flat[i + 2..].starts_with(|c: char| c.is_uppercase())
        {
            end = i + 1;
            break;
        }
    }
    let sentence = &flat[..end];
    if sentence.chars().count() <= most {
        return sentence.to_owned();
    }
    let cut = sentence
        .char_indices()
        .nth(most)
        .map_or(sentence.len(), |(i, _)| i);
    let head = sentence[..cut].trim_end();
    let head = head.rsplit_once(' ').map_or(head, |(words, _)| words);
    format!("{}…", head.trim_end_matches([',', ';', ':']))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pictures_are_read_in_both_forms_and_taken_off_the_line() {
        let (found, rest) = pictures_in(
            "See ![Figure 1](../assets/fig1.png \"title\") and ![[chart.PNG|A chart]] here ![x](notes.md)",
        );
        assert_eq!(
            found,
            [
                Picture {
                    alt: "Figure 1".into(),
                    src: "../assets/fig1.png".into()
                },
                Picture {
                    alt: "A chart".into(),
                    src: "chart.PNG".into()
                },
                Picture {
                    alt: "x".into(),
                    src: "notes.md".into()
                },
            ]
        );
        assert_eq!(rest, "See  and  here ");
        let (none, same) = pictures_in("![[Some note]] is an embed of a note");
        assert!(none.is_empty());
        assert_eq!(same, "![[Some note]] is an embed of a note");
        assert!(is_picture("a.jpeg") && !is_picture("a.pdf") && !is_picture("png"));
    }

    #[test]
    fn keys_are_read_from_pandoc_brackets_and_latex_commands() {
        let text = "Attention [@vaswani2017attention] beats it [see @he2016resnet, p. 3; @bad key]. As \\citet[p. 2]{devlin2019bert, brown2020language} said \\cite{he2016resnet}.";
        assert_eq!(
            cited_keys(text),
            [
                "vaswani2017attention",
                "he2016resnet",
                "bad",
                "devlin2019bert",
                "brown2020language"
            ]
        );
        // A link, an image, a day and an address are not citations.
        assert!(
            cited_keys(
                "[a link](https://x.org/@user) ![img](a@b.png) [[Note]] @2026-10-01 me@x.org"
            )
            .is_empty()
        );
        assert!(cited_keys("[@2026-10-01]").is_empty());
    }

    #[test]
    fn plain_words_lose_links_html_comments_and_citations() {
        assert_eq!(
            plain(
                "See [[Related work notes|the reading list]], [[Other note#Part]] and [a site](https://x.org) <b>now</b> <!-- hidden --> [@k1] \\cite{k2}."
            ),
            "See the reading list, Other note and a site now."
        );
        assert_eq!(plain("a [b and c"), "a [b and c");
        assert_eq!(plain("2 < 3 and 4 > 1"), "2 < 3 and 4 > 1");
    }

    #[test]
    fn a_sentence_is_the_first_one_or_a_cut_at_a_word() {
        assert_eq!(
            first_sentence("Links beat folders. Nine in ten. Really.", 80),
            "Links beat folders."
        );
        assert_eq!(
            first_sentence("e.g. this is one sentence about things", 80),
            "e.g. this is one sentence about things"
        );
        let long = first_sentence(&"word ".repeat(60), 30);
        assert!(long.ends_with('…') && long.chars().count() <= 31, "{long}");
    }
}
