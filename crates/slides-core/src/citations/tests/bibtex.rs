use proptest::prelude::*;

use crate::citations::{Refs, bibtex};

fn keys(refs: &Refs) -> Vec<&str> {
    refs.keys().collect()
}

#[test]
fn reads_the_keys_of_bibtex_entries_and_skips_what_is_not_one() {
    let bib = "@string{ieee = \"IEEE\"}\n@comment{ignored}\n@article{vaswani2017,\n  title={Attention}\n}\n@Book {knuth:1984 ,\n}\n@inproceedings(he16, x={y})\n@preamble{\"x\"}\nan email a@b.c is not an entry";
    assert_eq!(
        keys(&Refs::from_bibtex(bib)),
        ["vaswani2017", "knuth:1984", "he16"],
        "in the order of the file"
    );
}

#[test]
fn every_common_entry_type_is_read_with_braces_or_quotes() {
    let bib = r#"
@article{a1, title = {A {T}itle}, author = "Doe, Jane", year = 2020, journal = {Nature}}
@inproceedings{a2, title = "Quoted {\"o}", booktitle = {Conf}, year = {2019}}
@book{a3, title={Book}, publisher={MIT Press}, year=2016}
@misc{a4, title={Misc}, howpublished={\url{http://x.y}}}
@techreport{a5, title={Report}, institution={Lab}, number={7}}
@phdthesis{a6, title={Thesis}, school={Uni}}
@MastersThesis{a7, title={Small}}
@incollection{a8, title={Chapter}}
"#;
    let refs = Refs::from_bibtex(bib);
    assert_eq!(
        keys(&refs),
        ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]
    );
    let a1 = refs.get("a1").unwrap();
    assert_eq!(a1.kind(), "article");
    assert_eq!(a1.field("title"), Some("A {T}itle"));
    assert_eq!(a1.field("year"), Some("2020"));
    assert_eq!(a1.field("author"), Some("Doe, Jane"));
    assert_eq!(
        refs.get("a2").unwrap().field("title"),
        Some("Quoted {\\\"o}")
    );
    assert_eq!(refs.get("a7").unwrap().kind(), "mastersthesis");
    assert_eq!(
        refs.get("a4").unwrap().field("howpublished"),
        Some("\\url{http://x.y}")
    );
}

#[test]
fn field_names_are_lowercase_and_unknown_fields_are_kept() {
    let refs = Refs::from_bibtex(
        "@Article{k, TITLE={T}, ArchivePrefix={arXiv}, EPrint={1706.03762}, x-custom_1={y}}",
    );
    let entry = refs.get("k").unwrap();
    assert_eq!(entry.field("title"), Some("T"));
    assert_eq!(entry.field("archiveprefix"), Some("arXiv"));
    assert_eq!(entry.field("eprint"), Some("1706.03762"));
    assert_eq!(entry.field("x-custom_1"), Some("y"));
    assert_eq!(entry.eprint().as_deref(), Some("1706.03762"));
}

#[test]
fn string_macros_and_concatenation_are_expanded() {
    let bib = r#"
@string{ieee = "IEEE"}
@string{ tpami = ieee # " Trans. Pattern Anal. Mach. Intell." }
@article{k1, journal = tpami, month = jan, note = "see " # ieee # " and {braces}", year = 2001}
@article{k2, journal = undefinedmacro}
"#;
    let refs = Refs::from_bibtex(bib);
    let k1 = refs.get("k1").unwrap();
    assert_eq!(
        k1.field("journal"),
        Some("IEEE Trans. Pattern Anal. Mach. Intell.")
    );
    assert_eq!(k1.field("month"), Some("January"));
    assert_eq!(k1.field("note"), Some("see IEEE and {braces}"));
    assert_eq!(
        refs.get("k2").unwrap().field("journal"),
        Some("undefinedmacro")
    );
    assert_eq!(keys(&refs), ["k1", "k2"], "a string is not a reference");
}

#[test]
fn braces_and_quotes_nest_and_a_quote_inside_braces_does_not_end_a_quoted_value() {
    let bib = r#"@article{k, title = "A {\"quoted\"} word", note = {a {b {c}} d}, x = "M\"uller"}"#;
    let refs = Refs::from_bibtex(bib);
    let k = refs.get("k").unwrap();
    assert_eq!(k.field("title"), Some("A {\\\"quoted\\\"} word"));
    assert_eq!(k.field("note"), Some("a {b {c}} d"));
    assert_eq!(k.field("x"), Some("M\\\"uller"));
}

#[test]
fn a_trailing_comma_a_missing_comma_and_odd_spacing_are_fine() {
    let refs = Refs::from_bibtex(
        "@article{ one ,\n  title = {T} ,\n  year = 2001 ,\n}\n@article{two,title={T}year=2002}\n@article  (  three  ,  title  =  {T}  )\n@article{four}",
    );
    assert_eq!(keys(&refs), ["one", "two", "three", "four"]);
    assert_eq!(refs.get("one").unwrap().field("year"), Some("2001"));
    assert_eq!(refs.get("three").unwrap().field("title"), Some("T"));
    assert!(refs.get("four").unwrap().field("title").is_none());
}

#[test]
fn an_entry_that_never_closes_does_not_swallow_the_ones_after_it() {
    let bib = "@article{broken,\n  title = {Never closed,\n  year = 2001\n\n@article{after1, title={Fine}}\n@article{after2, title={Also fine}}\n";
    let refs = Refs::from_bibtex(bib);
    assert_eq!(keys(&refs), ["broken", "after1", "after2"]);
    assert_eq!(
        refs.get("after2").unwrap().field("title"),
        Some("Also fine")
    );
}

#[test]
fn text_between_entries_is_ignored() {
    let bib = "% a comment line\nThis file was made by hand.\n@article{k, title={T}}\nmore words @ here\n@online{web, url={https://x.y}}\n";
    assert_eq!(keys(&Refs::from_bibtex(bib)), ["k", "web"]);
}

#[test]
fn a_key_in_two_entries_is_the_first_ones() {
    let refs =
        Refs::from_bibtex("@article{k, title={First}}\n@book{k, title={Second}}\n@article{other}");
    assert_eq!(keys(&refs), ["k", "other"]);
    assert_eq!(refs.get("k").unwrap().field("title"), Some("First"));
    assert_eq!(refs.len(), 2);
}

#[test]
fn keys_are_taken_as_written_and_may_hold_punctuation() {
    let refs =
        Refs::from_bibtex("@article{Smith_2020-a:b.c/d, title={T}}\n@article{ÄÖ2020, title={T}}");
    assert!(refs.contains("Smith_2020-a:b.c/d"));
    assert!(refs.contains("ÄÖ2020"));
    assert!(!refs.contains("smith_2020-a:b.c/d"));
}

#[test]
fn an_entry_without_a_key_or_a_type_is_no_entry() {
    for bib in [
        "@article{}",
        "@article{,}",
        "@{k, a=b}",
        "@ {k}",
        "@",
        "@@@",
        "@article",
        "@article k",
    ] {
        assert!(Refs::from_bibtex(bib).is_empty(), "{bib}");
    }
}

#[test]
fn a_long_value_is_cut_and_a_huge_file_is_read_only_as_far_as_the_limit() {
    let long = format!("@article{{k, title = {{{}}}}}", "x".repeat(200_000));
    let refs = Refs::from_bibtex(&long);
    let title = refs.get("k").unwrap().field("title").unwrap();
    assert!(title.len() <= bibtex::MOST_VALUE, "{}", title.len());

    let many: String = (0..bibtex::MOST_ENTRIES + 500)
        .map(|n| format!("@misc{{k{n}, title={{t}}}}\n"))
        .collect();
    assert_eq!(Refs::from_bibtex(&many).len(), bibtex::MOST_ENTRIES);

    let filler = " ".repeat(bibtex::MOST_BYTES + 10);
    let late = format!("{filler}@article{{late, title={{t}}}}");
    assert!(
        Refs::from_bibtex(&late).is_empty(),
        "past the limit nothing is read"
    );
}

#[test]
fn a_cut_never_lands_inside_a_character() {
    let text = format!(
        "@article{{k, title={{{}}}}}",
        "é".repeat(bibtex::MOST_VALUE)
    );
    let refs = Refs::from_bibtex(&text);
    assert!(
        refs.get("k")
            .unwrap()
            .field("title")
            .unwrap()
            .chars()
            .all(|c| c == 'é')
    );
    let padded = format!("{}é@article{{k}}", "a".repeat(bibtex::MOST_BYTES - 1));
    let _ = Refs::from_bibtex(&padded);
}

#[test]
fn hostile_text_is_read_without_panicking() {
    let deep = "{".repeat(50_000);
    let nested = format!("@article{{k, title={deep}");
    let closers = format!("@article{{k, title={}}}", "}".repeat(50_000));
    for bib in [
        "@article{k, title=",
        "@article{k, title={",
        "@article{k, title=\"",
        "@article{k, title=#",
        "@article{k, title={a}#",
        "@article{k, = {x}}",
        "@article{k, title={a}}}}}}}}",
        "@string{",
        "@string{a}",
        "@string{a=}",
        "@comment{",
        "@comment",
        "@preamble",
        "@article{k,,,,title={a},,,,}",
        "@article{k, title={é",
        "@é{k}",
        "@article{é",
        "\u{0}@article{k}\u{0}",
        nested.as_str(),
        closers.as_str(),
    ] {
        let _ = Refs::from_bibtex(bib);
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(400))]

    #[test]
    fn any_text_reads_without_panicking_and_every_key_is_in_the_text(text in "\\PC{0,400}") {
        let refs = Refs::from_bibtex(&text);
        for key in refs.keys() {
            prop_assert!(text.contains(key), "{key:?} is not in {text:?}");
        }
    }

    #[test]
    fn text_made_of_bibtex_pieces_reads_without_panicking(
        pieces in proptest::collection::vec(
            prop_oneof![
                Just("@article".to_owned()), Just("@string".to_owned()), Just("{".to_owned()), Just("}".to_owned()),
                Just("(".to_owned()), Just(")".to_owned()), Just(",".to_owned()), Just("=".to_owned()),
                Just("\"".to_owned()), Just("#".to_owned()), Just("\\".to_owned()), Just("\n@".to_owned()),
                Just(" ".to_owned()), Just("é".to_owned()), "[a-z]{1,6}",
            ],
            0..60,
        )
    ) {
        let text: String = pieces.concat();
        let refs = Refs::from_bibtex(&text);
        for key in refs.keys() {
            prop_assert!(text.contains(key));
        }
    }
}
