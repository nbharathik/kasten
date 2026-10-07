//! Command-line arguments, parsed by hand: the command is small enough not to
//! need a parsing crate.

use std::collections::BTreeMap;

/// Flags that take no value.
const SWITCHES: &[&str] = &[
    "json", "help", "version", "dry-run", "previews", "grid", "notes", "estimate",
];

#[derive(Debug, Default)]
pub struct Args {
    pub positional: Vec<String>,
    flags: BTreeMap<String, String>,
}

impl Args {
    pub fn parse(args: impl IntoIterator<Item = String>) -> Result<Args, String> {
        let mut out = Args::default();
        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            if let Some(name) = arg.strip_prefix("--") {
                if let Some((name, value)) = name.split_once('=') {
                    out.flags.insert(name.to_owned(), value.to_owned());
                } else if SWITCHES.contains(&name) {
                    out.flags.insert(name.to_owned(), String::new());
                } else {
                    let value = args
                        .next()
                        .ok_or_else(|| format!("--{name} needs a value"))?;
                    out.flags.insert(name.to_owned(), value);
                }
            } else if arg == "-h" {
                out.flags.insert("help".to_owned(), String::new());
            } else if arg == "-V" {
                out.flags.insert("version".to_owned(), String::new());
            } else {
                out.positional.push(arg);
            }
        }
        Ok(out)
    }

    pub fn has(&self, name: &str) -> bool {
        self.flags.contains_key(name)
    }

    pub fn value(&self, name: &str) -> Option<&str> {
        self.flags
            .get(name)
            .map(String::as_str)
            .filter(|v| !v.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(words: &[&str]) -> Args {
        Args::parse(words.iter().map(|w| (*w).to_owned())).unwrap()
    }

    #[test]
    fn splits_words_flags_and_switches() {
        let a = parse(&[
            "op",
            "talk.deck",
            "--theme",
            "Dark",
            "--title=My talk",
            "--json",
            "set_title",
        ]);
        assert_eq!(a.positional, ["op", "talk.deck", "set_title"]);
        assert_eq!(a.value("theme"), Some("Dark"));
        assert_eq!(a.value("title"), Some("My talk"));
        assert!(a.has("json") && !a.has("dry-run"));
    }

    #[test]
    fn a_flag_without_its_value_is_an_error() {
        assert!(Args::parse(["--theme".to_owned()]).is_err());
    }
}
