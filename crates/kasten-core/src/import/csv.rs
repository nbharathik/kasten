//! CSV as Notion exports databases (RFC 4180): commas between fields,
//! quotes around fields with commas, quotes or line breaks in them, `""`
//! for a quote, and a byte-order mark in front.

/// The rows of `text`, each a list of fields; blank lines are left out.
pub(crate) fn rows(text: &str) -> Vec<Vec<String>> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut rows = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match (c, quoted) {
            ('"', true) if chars.peek() == Some(&'"') => {
                field.push('"');
                chars.next();
            }
            ('"', true) => quoted = false,
            ('"', false) if field.is_empty() => quoted = true,
            (',', false) => row.push(std::mem::take(&mut field)),
            ('\r', false) if chars.peek() == Some(&'\n') => {}
            ('\n', false) => {
                row.push(std::mem::take(&mut field));
                if row.iter().any(|f| !f.is_empty()) {
                    rows.push(std::mem::take(&mut row));
                } else {
                    row.clear();
                }
            }
            (c, _) => field.push(c),
        }
    }
    row.push(field);
    if row.iter().any(|f| !f.is_empty()) {
        rows.push(row);
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_notion_csv() {
        let text = "\u{feff}Name,Tags,Notes\r\nA,\"x, y\",\"said \"\"hi\"\"\nthen left\"\r\n\r\n\"B, the second\",,\nC,z,";
        assert_eq!(
            rows(text),
            [
                vec!["Name", "Tags", "Notes"],
                vec!["A", "x, y", "said \"hi\"\nthen left"],
                vec!["B, the second", "", ""],
                vec!["C", "z", ""],
            ]
        );
        assert!(rows("").is_empty());
    }
}
