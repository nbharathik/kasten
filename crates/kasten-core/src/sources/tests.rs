use super::*;

#[test]
fn shortens_at_a_word() {
    assert_eq!(shortened("  Short.\n", 60, 50), "Short.");
    assert_eq!(
        shortened(&"word ".repeat(20), 60, 50),
        "word word word word word word word word word word…"
    );
    assert_eq!(
        shortened(&"x".repeat(80), 60, 50),
        format!("{}…", "x".repeat(50))
    );
    assert_eq!(shortened("one, two, three, four", 10, 8), "one…");
}

#[test]
fn names_the_sidecar_beside_its_pdf() {
    assert_eq!(
        sidecar_of("sources/a/b.pdf").unwrap(),
        "sources/a/b.highlights.json"
    );
    assert_eq!(
        sidecar_of("sources/B.PDF").unwrap(),
        "sources/B.highlights.json"
    );
    assert!(sidecar_of("assets/b.pdf").is_err());
    assert!(sidecar_of("sources/b.md").is_err());
}

#[test]
fn reads_leniently_and_skips_entries_without_an_id() {
    let car = Sidecar::parse(r#"{"highlights": [{"page": 2}, {"id": "a", "page": 2, "rects": [[1, 2, 3], [1, 2, 3, 4]]}]}"#).unwrap();
    let all = car.highlights();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].rects, [[1.0, 2.0, 3.0, 4.0]]);
    assert_eq!(all[0].color, "yellow");
    assert!(Sidecar::parse("[]").is_err());
    assert!(Sidecar::parse(r#"{"highlights": 3}"#).is_err());
    // An id goes into a card's frontmatter and link as it is, so only
    // letters, digits, - and _ are read.
    let odd = Sidecar::parse(
        r#"{"highlights": [{"id": "x}, locked: true", "page": 1}, {"id": "ok-1_B", "page": 1}]}"#,
    )
    .unwrap();
    let ids: Vec<String> = odd.highlights().into_iter().map(|h| h.id).collect();
    assert_eq!(ids, ["ok-1_B"]);
    assert_eq!(
        Sidecar::parse("{}").unwrap().to_text(),
        "{\n  \"highlights\": []\n}\n"
    );
}
