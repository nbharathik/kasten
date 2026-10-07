//! The short name of a venue, for a citation that has room for only a few
//! words: `Vaswani et al., 2017 (NeurIPS)`. A journal or conference is shortened
//! by the acronym its entry gives in parentheses, or by the name of a well
//! known one; a short name stands as it is; a long name nobody knows is left out
//! rather than cut in the middle.

/// Well-known venues: words that only that venue's name holds, and its acronym.
/// The first that matches wins, so a name that holds another's words (the
/// North American chapter of the ACL) comes before it.
const KNOWN: &[(&str, &str)] = &[
    ("neural information processing systems", "NeurIPS"),
    ("computer vision and pattern recognition", "CVPR"),
    ("european conference on computer vision", "ECCV"),
    ("international conference on computer vision", "ICCV"),
    ("international conference on machine learning", "ICML"),
    (
        "international conference on learning representations",
        "ICLR",
    ),
    (
        "north american chapter of the association for computational linguistics",
        "NAACL",
    ),
    (
        "european chapter of the association for computational linguistics",
        "EACL",
    ),
    ("empirical methods in natural language processing", "EMNLP"),
    ("association for computational linguistics", "ACL"),
    ("aaai", "AAAI"),
    (
        "international joint conference on artificial intelligence",
        "IJCAI",
    ),
    ("artificial intelligence and statistics", "AISTATS"),
    ("uncertainty in artificial intelligence", "UAI"),
    ("knowledge discovery and data mining", "KDD"),
    ("acoustics, speech and signal processing", "ICASSP"),
    ("journal of machine learning research", "JMLR"),
    (
        "transactions on pattern analysis and machine intelligence",
        "TPAMI",
    ),
    ("transactions on machine learning research", "TMLR"),
    ("robotics: science and systems", "RSS"),
    ("operating systems design and implementation", "OSDI"),
    ("symposium on operating systems principles", "SOSP"),
];

/// The longest a venue is shown as it is written.
const LONGEST_AS_WRITTEN: usize = 24;

/// The acronym in the last parentheses of a name: `Human Language Technologies (NAACL-HLT)`
/// gives `NAACL-HLT`, and `Workshop (WSDM 2020)` gives `WSDM`.
fn parenthesised(venue: &str) -> Option<String> {
    let close = venue.rfind(')')?;
    let open = venue[..close].rfind('(')?;
    let word = venue[open + 1..close].split_whitespace().next()?;
    let long_enough = (2..=14).contains(&word.chars().count());
    let shaped = word
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '&' | '+'))
        && word.chars().filter(|c| c.is_uppercase()).count() >= 2;
    (long_enough && shaped).then(|| word.to_owned())
}

/// A short name for a venue, or None when it has no short form and is too long to show whole.
pub fn short_venue(venue: &str) -> Option<String> {
    let venue = venue.trim();
    if venue.is_empty() {
        return None;
    }
    if let Some(acronym) = parenthesised(venue) {
        return Some(acronym);
    }
    let lower = venue.to_lowercase();
    if lower.contains("arxiv") {
        return Some("arXiv".to_owned());
    }
    if let Some((_, acronym)) = KNOWN.iter().find(|(words, _)| lower.contains(words)) {
        return Some((*acronym).to_owned());
    }
    (venue.chars().count() <= LONGEST_AS_WRITTEN).then(|| venue.to_owned())
}
