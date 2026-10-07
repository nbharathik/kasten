//! The people an `author` or `editor` field names: `Vaswani, Ashish and
//! Noam Shazeer and others`. Names are read the way BibTeX reads them (with the
//! particles of `Ludwig van Beethoven` and the suffix of `Smith, Jr., John`),
//! braces keep a name whole (`{Google Brain}`), and `others` means "et al."

use super::latex::plain;

/// One person, or one organisation whose name is a single last name.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Person {
    pub first: String,
    /// `van`, `de la`: the lower-case words before the last name.
    pub von: String,
    pub last: String,
    /// `Jr.`
    pub jr: String,
}

/// The names in a field, and whether it ended with `others`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Authors {
    pub people: Vec<Person>,
    pub et_al: bool,
}

/// The most words a name is read from: a field of nonsense stays small.
const MOST_WORDS: usize = 64;

/// Splits at white space outside braces.
fn words(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let (mut depth, mut start) = (0usize, None);
    for (i, c) in text.char_indices() {
        match c {
            '{' => {
                depth += 1;
                start.get_or_insert(i);
            }
            '}' => {
                depth = depth.saturating_sub(1);
                start.get_or_insert(i);
            }
            c if c.is_whitespace() && depth == 0 => {
                if let Some(s) = start.take() {
                    out.push(&text[s..i]);
                }
            }
            _ => {
                start.get_or_insert(i);
            }
        }
    }
    if let Some(s) = start {
        out.push(&text[s..]);
    }
    out
}

/// Splits at the commas outside braces.
fn commas(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let (mut depth, mut start) = (0usize, 0);
    for (i, c) in text.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                out.push(&text[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    out.push(&text[start..]);
    out
}

/// Whether a word begins with a lower-case letter, which makes it a particle.
/// A word that begins with a brace is a name kept whole, never a particle.
fn is_particle(word: &str) -> bool {
    word.chars().next().is_some_and(char::is_lowercase)
}

fn joined(words: &[&str]) -> String {
    plain(&words.join(" "))
}

fn person(name: &str) -> Person {
    let parts = commas(name);
    let ws: Vec<Vec<&str>> = parts.iter().map(|p| words(p)).collect();
    match ws.as_slice() {
        [] => Person::default(),
        [one] => match one.as_slice() {
            [] => Person::default(),
            [only] => Person {
                last: plain(only),
                ..Person::default()
            },
            all => {
                let (init, _) = all.split_at(all.len() - 1);
                match init.iter().position(|w| is_particle(w)) {
                    Some(start) => {
                        // The particles run to the last lower-case word before the surname.
                        let end = init.iter().rposition(|w| is_particle(w)).unwrap_or(start);
                        Person {
                            first: joined(&all[..start]),
                            von: joined(&all[start..=end]),
                            last: joined(&all[end + 1..]),
                            jr: String::new(),
                        }
                    }
                    None => Person {
                        first: joined(init),
                        last: joined(&all[all.len() - 1..]),
                        ..Person::default()
                    },
                }
            }
        },
        [last, rest @ ..] => {
            // `von Last, First` or `von Last, Jr, First`.
            let cut = last.len().saturating_sub(1);
            let von_end = last[..cut].iter().rposition(|w| is_particle(w));
            let (von, surname) = match von_end {
                Some(end) => (&last[..=end], &last[end + 1..]),
                None => (&last[..0], &last[..]),
            };
            let (jr, first) = match rest {
                [first] => (&[][..], first.as_slice()),
                [jr, first, ..] => (jr.as_slice(), first.as_slice()),
                [] => (&[][..], &[][..]),
            };
            Person {
                first: joined(first),
                von: joined(von),
                last: joined(surname),
                jr: joined(jr),
            }
        }
    }
}

/// The names in the text of an `author` or `editor` field.
pub fn parse_list(raw: &str) -> Authors {
    let mut authors = Authors::default();
    let mut name: Vec<&str> = Vec::new();
    let mut count = 0;
    // The names are separated by the word `and`; the words of each are put together again.
    let flush = |name: &mut Vec<&str>, authors: &mut Authors| {
        if name.is_empty() {
            return;
        }
        let text = name.join(" ");
        name.clear();
        if text == "others" {
            authors.et_al = true;
        } else {
            authors.people.push(person(&text));
        }
    };
    for word in words(raw) {
        if word.eq_ignore_ascii_case("and") {
            flush(&mut name, &mut authors);
            continue;
        }
        count += 1;
        if count > MOST_WORDS * 8 {
            break;
        }
        name.push(word);
    }
    flush(&mut name, &mut authors);
    authors.people.truncate(MOST_WORDS);
    authors
}

/// The initials of given names: `Ming-Wei` is `M.-W.`, `J.R.R.` is `J. R. R.`
fn initials(first: &str) -> String {
    first
        .split_whitespace()
        .map(|word| {
            word.split('-')
                .map(|part| {
                    part.split('.')
                        .filter_map(|piece| piece.chars().find(|c| c.is_alphabetic()))
                        .map(|c| format!("{}.", c.to_uppercase()))
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join("-")
        })
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

impl Person {
    /// `van Beethoven`: what the person is cited by.
    pub fn last_name(&self) -> String {
        [self.von.as_str(), self.last.as_str()]
            .iter()
            .filter(|s| !s.is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// `Ludwig van Beethoven`, in the order it is said.
    pub fn full_name(&self) -> String {
        [self.first.clone(), self.last_name()]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// `L. van Beethoven`.
    pub fn initialed(&self) -> String {
        [initials(&self.first), self.last_name()]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

impl Authors {
    pub fn is_empty(&self) -> bool {
        self.people.is_empty()
    }

    /// Last names: `Vaswani`, `Devlin and Chang`, and `Vaswani et al.` for three or more.
    pub fn short(&self) -> String {
        match (self.people.as_slice(), self.et_al) {
            ([], _) => String::new(),
            ([one], false) => one.last_name(),
            ([one, two], false) => format!("{} and {}", one.last_name(), two.last_name()),
            ([first, ..], _) => format!("{} et al.", first.last_name()),
        }
    }

    /// With initials, for a whole reference: up to three names, then the first and `et al.`
    pub fn full(&self) -> String {
        match (self.people.as_slice(), self.et_al) {
            ([], _) => String::new(),
            ([one], false) => one.initialed(),
            ([one, two], false) => format!("{} and {}", one.initialed(), two.initialed()),
            ([one, two, three], false) => format!(
                "{}, {}, and {}",
                one.initialed(),
                two.initialed(),
                three.initialed()
            ),
            ([first, ..], _) => format!("{} et al.", first.initialed()),
        }
    }

    /// Each person as their name is said, for a list to choose from.
    pub fn named(&self) -> Vec<String> {
        self.people.iter().map(Person::full_name).collect()
    }
}
