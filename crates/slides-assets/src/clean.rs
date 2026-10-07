//! What a person or an agent may write into a picture's sidecar: tags, a
//! caption and a citation key, checked and tidied the same way wherever the
//! picture is kept.

/// The most tags one picture has.
pub const MAX_TAGS: usize = 32;
/// The longest tag, in characters.
pub const MAX_TAG_CHARS: usize = 60;
/// The longest caption, in characters.
pub const MAX_CAPTION_CHARS: usize = 2_000;
/// The longest citation key, in characters.
pub const MAX_KEY_CHARS: usize = 128;

/// Tags as they are kept: each trimmed, without a leading `#`, on one line;
/// empty ones dropped, and a tag that only differs in case from an earlier
/// one dropped, so the first spelling stands.
pub fn tags(given: &[String]) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for tag in given {
        let words: Vec<&str> = tag
            .trim()
            .trim_start_matches('#')
            .split_whitespace()
            .collect();
        let tag = words.join(" ");
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > MAX_TAG_CHARS {
            return Err(format!("A tag is at most {MAX_TAG_CHARS} characters"));
        }
        if tag.chars().any(char::is_control) {
            return Err("A tag is plain text on one line".to_owned());
        }
        if !out
            .iter()
            .any(|kept| kept.to_lowercase() == tag.to_lowercase())
        {
            out.push(tag);
        }
    }
    if out.len() > MAX_TAGS {
        return Err(format!("A picture has at most {MAX_TAGS} tags"));
    }
    Ok(out)
}

/// A caption trimmed; None when nothing is left.
pub fn caption(given: &str) -> Result<Option<String>, String> {
    let text = given.trim();
    if text.chars().count() > MAX_CAPTION_CHARS {
        return Err(format!(
            "A caption is at most {MAX_CAPTION_CHARS} characters"
        ));
    }
    if text
        .chars()
        .any(|c| c.is_control() && !matches!(c, '\n' | '\t'))
    {
        return Err("A caption is plain text".to_owned());
    }
    Ok((!text.is_empty()).then(|| text.to_owned()))
}

/// A citation key as BibTeX keys go: no spaces, commas, braces, quotes or
/// backslashes. None when nothing is left.
pub fn citation_key(given: &str) -> Result<Option<String>, String> {
    let key = given.trim();
    if key.chars().count() > MAX_KEY_CHARS {
        return Err(format!(
            "A citation key is at most {MAX_KEY_CHARS} characters"
        ));
    }
    if key
        .chars()
        .any(|c| c.is_whitespace() || c.is_control() || matches!(c, ',' | '{' | '}' | '"' | '\\'))
    {
        return Err(
            "A citation key has no spaces, commas, braces, quotes or backslashes".to_owned(),
        );
    }
    Ok((!key.is_empty()).then(|| key.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn owned(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn tags_are_tidied() {
        assert_eq!(
            tags(&owned(&[
                "Figure",
                " #Attention ",
                "figure",
                "",
                "  ",
                "two   words",
                "##x"
            ]))
            .unwrap(),
            ["Figure", "Attention", "two words", "x"]
        );
        assert!(tags(&owned(&[&"x".repeat(61)])).is_err());
        assert!(tags(&owned(&["a\u{7}b"])).is_err());
        let many: Vec<String> = (0..33).map(|n| format!("t{n}")).collect();
        assert!(tags(&many).is_err());
        assert_eq!(tags(&many[..32]).unwrap().len(), 32);
    }

    #[test]
    fn captions_and_keys() {
        assert_eq!(
            caption("  Attention.\n").unwrap().as_deref(),
            Some("Attention.")
        );
        assert_eq!(caption("  \n").unwrap(), None);
        assert_eq!(
            caption("two\nlines").unwrap().as_deref(),
            Some("two\nlines")
        );
        assert!(caption(&"c".repeat(2_001)).is_err());
        assert!(caption("bell\u{7}").is_err());
        assert_eq!(
            citation_key(" vaswani2017attention ").unwrap().as_deref(),
            Some("vaswani2017attention")
        );
        assert_eq!(
            citation_key("smith:2020/a+b_c-d.e").unwrap().as_deref(),
            Some("smith:2020/a+b_c-d.e")
        );
        assert_eq!(citation_key("").unwrap(), None);
        for bad in ["two words", "a,b", "a{b", "a\"b", "a\\b"] {
            assert!(citation_key(bad).is_err(), "{bad}");
        }
        assert!(citation_key(&"k".repeat(129)).is_err());
    }
}
