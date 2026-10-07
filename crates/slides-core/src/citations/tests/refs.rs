use super::SAMPLE;
use crate::citations::Refs;

#[test]
fn the_sample_has_six_works_in_the_order_of_the_file() {
    let refs = Refs::from_bibtex(SAMPLE);
    assert_eq!(refs.len(), 6);
    assert!(!refs.is_empty());
    assert_eq!(
        refs.keys().collect::<Vec<_>>(),
        [
            "vaswani2017attention",
            "devlin2019bert",
            "brown2020language",
            "goodfellow2016deep",
            "lecun2015deep",
            "anthropic2024"
        ]
    );
    assert!(refs.contains("lecun2015deep") && !refs.contains("LeCun2015deep"));
}

#[test]
fn keys_alone_make_a_bibliography_too() {
    let refs = Refs::new(["b", "a", "b"]);
    assert_eq!(refs.keys().collect::<Vec<_>>(), ["b", "a"]);
    assert!(refs.contains("a") && !refs.contains("c"));
    assert_eq!(refs.get("a").map(|e| e.key()), Some("a"));
    assert_eq!(refs, Refs::new(["b", "a"]));
    assert!(Refs::default().is_empty());
}

#[test]
fn suggests_a_key_that_is_a_typo_away_or_a_prefix() {
    let refs = Refs::new(["vaswani2017attention", "he2016resnet", "lecun1998"]);
    assert_eq!(refs.closest("vaswani2017"), Some("vaswani2017attention"));
    assert_eq!(refs.closest("lecun1999"), Some("lecun1998"));
    assert_eq!(
        refs.closest("Lecun1998"),
        Some("lecun1998"),
        "case is not a difference"
    );
    assert_eq!(refs.closest("smith2001"), None);
    assert!(refs.contains("he2016resnet") && !refs.contains("He2016resnet"));
}

#[test]
fn the_nearest_key_wins_and_a_tie_goes_to_the_first_alphabetically() {
    let refs = Refs::new(["abcd", "abce", "abxx"]);
    assert_eq!(refs.closest("abcf"), Some("abcd"));
    assert_eq!(refs.closest("abcd"), Some("abcd"));
    assert_eq!(Refs::default().closest("anything"), None);
}

#[test]
fn every_work_is_listed_with_what_the_editor_shows() {
    let refs = Refs::from_bibtex(SAMPLE);
    let all = refs.references();
    assert_eq!(all.len(), 6);
    let vaswani = &all[0];
    assert_eq!(vaswani.key, "vaswani2017attention");
    assert_eq!(vaswani.kind, "inproceedings");
    assert_eq!(vaswani.title, "Attention is all you need");
    assert_eq!(vaswani.authors.len(), 8);
    assert_eq!(vaswani.authors[0], "Ashish Vaswani");
    assert_eq!(vaswani.authors[6], "Łukasz Kaiser");
    assert_eq!(vaswani.year.as_deref(), Some("2017"));
    assert_eq!(
        vaswani.venue.as_deref(),
        Some("Advances in Neural Information Processing Systems")
    );
    assert_eq!(vaswani.short, "Vaswani et al., 2017 (NeurIPS)");
    assert!(
        vaswani
            .full
            .starts_with("A. Vaswani et al. Attention is all you need.")
    );

    let bert = &all[1];
    assert_eq!(
        bert.title,
        "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding"
    );
    let brown = &all[2];
    assert_eq!(
        brown.authors,
        ["Tom B. Brown", "Benjamin Mann", "Nick Ryder"]
    );
    let anthropic = &all[5];
    assert_eq!(anthropic.authors, ["Anthropic"]);
    assert_eq!(anthropic.eprint, None);
}

#[test]
fn the_arxiv_identifier_doi_and_address_are_kept() {
    let refs = Refs::from_bibtex(
        "@misc{k, title={T}, author={A B}, year={2017}, eprint={1706.03762}, archivePrefix={arXiv}, primaryClass={cs.CL}, doi={10.1000/xyz}, url={https://arxiv.org/abs/1706.03762}}",
    );
    let r = &refs.references()[0];
    assert_eq!(r.eprint.as_deref(), Some("1706.03762"));
    assert_eq!(r.doi.as_deref(), Some("10.1000/xyz"));
    assert_eq!(r.url.as_deref(), Some("https://arxiv.org/abs/1706.03762"));
    assert_eq!(r.venue.as_deref(), Some("arXiv:1706.03762"));
    assert_eq!(r.short, "B, 2017 (arXiv)");
    assert_eq!(r.full, "A. B. T. arXiv:1706.03762, 2017.");
}

#[test]
fn the_year_comes_from_year_or_from_date() {
    let year = |bib: &str| Refs::from_bibtex(bib).references()[0].year.clone();
    assert_eq!(year("@misc{k, year={2017}}").as_deref(), Some("2017"));
    assert_eq!(year("@misc{k, year={2017a}}").as_deref(), Some("2017"));
    assert_eq!(year("@misc{k, date={2019-06-12}}").as_deref(), Some("2019"));
    assert_eq!(
        year("@misc{k, year={in press}}").as_deref(),
        Some("in press")
    );
    assert_eq!(year("@misc{k, title={T}}"), None);
    assert_eq!(year("@misc{k, year={}}"), None);
}

#[test]
fn an_editor_stands_in_for_missing_authors() {
    let refs = Refs::from_bibtex(
        "@proceedings{k, editor={Smith, Ann and Jones, Bob}, title={Proc}, year={2000}}",
    );
    assert_eq!(refs.references()[0].authors, ["Ann Smith", "Bob Jones"]);
    assert_eq!(refs.references()[0].short, "Smith and Jones, 2000");
}
