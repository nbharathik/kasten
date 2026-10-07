//! Printing text that came from notes and agents. Control characters other
//! than line breaks and tabs, and the ones that reorder text, are written
//! as `\uXXXX` escapes, so nothing printed can move the cursor, erase
//! lines or disguise what is shown, such as a proposal's diff. The escape
//! is valid inside JSON strings too.

use std::borrow::Cow;

fn hidden(c: char) -> bool {
    (c.is_control() && c != '\n' && c != '\t')
        || matches!(c, '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
}

/// `text` safe to print.
pub fn shown(text: &str) -> Cow<'_, str> {
    if !text.chars().any(hidden) {
        return Cow::Borrowed(text);
    }
    let mut out = String::with_capacity(text.len() + 8);
    for c in text.chars() {
        if hidden(c) {
            out.push_str(&format!("\\u{:04x}", u32::from(c)));
        } else {
            out.push(c);
        }
    }
    Cow::Owned(out)
}

/// `println!`, with the text made safe to print.
macro_rules! say {
    ($($arg:tt)*) => {
        println!("{}", $crate::show::shown(&format!($($arg)*)))
    };
}

/// `eprintln!`, with the text made safe to print.
macro_rules! say_err {
    ($($arg:tt)*) => {
        eprintln!("{}", $crate::show::shown(&format!($($arg)*)))
    };
}

pub(crate) use {say, say_err};

#[cfg(test)]
mod tests {
    use super::shown;

    #[test]
    fn escapes_what_could_change_the_screen_and_keeps_the_rest() {
        assert_eq!(shown("Plain text\n\tindented"), "Plain text\n\tindented");
        assert_eq!(
            shown("keep\u{1b}[1A\u{1b}[2Kgone\r"),
            "keep\\u001b[1A\\u001b[2Kgone\\u000d"
        );
        assert_eq!(shown("a\u{202e}b\u{9b}c\u{7f}"), "a\\u202eb\\u009bc\\u007f");
        let json = serde_json::to_string(&"x\u{9b}y").unwrap();
        let back: String = serde_json::from_str(&shown(&json)).unwrap();
        assert_eq!(back, "x\u{9b}y", "still JSON");
    }
}
