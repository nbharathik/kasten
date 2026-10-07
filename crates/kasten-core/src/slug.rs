//! File names from titles: "The filename is a slug of the title".
//! Letters and digits of any script stay, everything else becomes one dash.

/// A slug stops at 80 characters or 120 bytes, whichever comes first: with
/// a number, a conflict stamp and an extension added, the file name still
/// fits in the 255 bytes most file systems allow.
const MAX_CHARS: usize = 80;
const MAX_BYTES: usize = 120;

/// A file-name-safe slug; `untitled` when nothing usable remains.
pub fn slugify(title: &str) -> String {
    let mut out = String::new();
    let mut chars = 0;
    let mut dash = false;
    for c in title.chars().flat_map(char::to_lowercase) {
        if c.is_alphanumeric() {
            let dash = dash && !out.is_empty();
            if out.len() + usize::from(dash) + c.len_utf8() > MAX_BYTES {
                break;
            }
            if dash {
                out.push('-');
            }
            out.push(c);
            chars += 1 + usize::from(dash);
        }
        dash = !c.is_alphanumeric();
        if chars >= MAX_CHARS {
            break;
        }
    }
    if out.is_empty() {
        "untitled".to_owned()
    } else if windows_device(&out) {
        // `con.md` cannot be made on Windows, and older versions write it
        // nowhere.
        format!("{out}-1")
    } else {
        out
    }
}

/// Whether Windows keeps `name` for a device: CON, PRN, AUX, NUL, COM0 to
/// COM9 and LPT0 to LPT9, in any case, with or without an extension.
pub fn windows_device(name: &str) -> bool {
    let base = name.split('.').next().unwrap_or(name).trim_end_matches(' ');
    let lower = base.to_lowercase();
    let numbered = |prefix: &str| {
        lower.strip_prefix(prefix).is_some_and(|n| {
            let mut digits = n.chars();
            matches!(
                (digits.next(), digits.next()),
                (Some('0'..='9' | '¹' | '²' | '³'), None)
            )
        })
    };
    matches!(
        lower.as_str(),
        "con" | "prn" | "aux" | "nul" | "conin$" | "conout$"
    ) || numbered("com")
        || numbered("lpt")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_keep_letters_of_any_script() {
        assert_eq!(
            slugify("Duplicate score for Photo-Sets"),
            "duplicate-score-for-photo-sets"
        );
        assert_eq!(slugify("  Über: Straße & Café!  "), "über-straße-café");
        assert_eq!(slugify("日本語 ノート"), "日本語-ノート");
        assert_eq!(slugify("../../etc/passwd"), "etc-passwd");
        assert_eq!(slugify("???"), "untitled");
        assert_eq!(slugify(&"a".repeat(200)).len(), 80);
        // At most 120 bytes, so a name with Kasten's additions still fits.
        let long = slugify(&"語".repeat(100));
        assert!(
            long.len() <= 120 && long.starts_with("語語"),
            "{}",
            long.len()
        );
    }

    #[test]
    fn knows_the_names_windows_keeps_for_devices() {
        for name in [
            "con",
            "CON",
            "Nul.md",
            "nul.tar.gz",
            "aux",
            "prn .md",
            "com1",
            "COM9.canvas",
            "lpt0",
            "com¹",
            "conin$",
        ] {
            assert!(windows_device(name), "{name}");
        }
        for name in [
            "console", "icon.md", "com10", "lpt", "comx", "null.md", "x.con",
        ] {
            assert!(!windows_device(name), "{name}");
        }
    }
}
