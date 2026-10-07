use super::*;
use crate::testing::with_cx;

#[test]
fn plain_lines_stay_and_blank_lines_become_one_gap() {
    assert_eq!(
        plain("Say this first.\n\n\nThen this."),
        ["Say this first.", "", "Then this."]
    );
    assert_eq!(plain("\n\nonly\n\n"), ["only"]);
    assert_eq!(plain(""), Vec::<String>::new());
}

#[test]
fn markers_come_off_and_the_words_stay() {
    assert_eq!(plain("# Heading\n## Sub"), ["Heading", "Sub"]);
    assert_eq!(
        plain("**bold** and *italic* and `code` and ~~gone~~"),
        ["bold and italic and code and gone"]
    );
    assert_eq!(plain("> quoted"), ["quoted"]);
    assert_eq!(plain("---\ntext\n***"), ["text"]);
}

#[test]
fn a_link_keeps_its_address_and_a_picture_only_its_words() {
    assert_eq!(
        plain("see [the docs](https://example.com/x)"),
        ["see the docs (https://example.com/x)"]
    );
    assert_eq!(plain("[https://a.b](https://a.b)"), ["https://a.b"]);
    assert_eq!(plain("![a chart](assets/c.png)"), ["a chart"]);
}

#[test]
fn bullets_and_numbers_keep_their_depth() {
    assert_eq!(
        plain("- one\n  - two\n    * three\n- four"),
        ["• one", "  – two", "    ▪ three", "• four"]
    );
    assert_eq!(plain("1. first\n2) second"), ["1. first", "2. second"]);
    assert_eq!(
        plain("Pause here.\n\n- ask the room"),
        ["Pause here.", "", "• ask the room"]
    );
}

#[test]
fn a_word_with_an_underscore_or_a_star_between_spaces_is_left_alone() {
    assert_eq!(plain("use snake_case_names"), ["use snake_case_names"]);
    assert_eq!(plain("2 * 3 = 6"), ["2 * 3 = 6"]);
    assert_eq!(plain("an _emphasised_ word"), ["an emphasised word"]);
    assert_eq!(plain(r"escaped \*star\*"), ["escaped *star*"]);
}

#[test]
fn code_fences_go_and_their_lines_stay_as_written() {
    assert_eq!(
        plain("```rust\nlet x = *y;\n```\nafter"),
        ["let x = *y;", "after"]
    );
}

#[test]
fn a_notes_slide_relates_to_the_master_and_its_slide_and_holds_the_paragraphs() {
    let (xml, rels) = with_cx(|cx| {
        let xml = String::from_utf8(write_slide(cx, &plain("one\n\ntwo"), "slide3.xml"))
            .unwrap_or_default();
        (xml, String::from_utf8(cx.rels.to_xml()).unwrap_or_default())
    });
    assert!(
        xml.contains(r#"<p:ph type="sldImg"/>"#) && xml.contains(r#"<p:ph type="body" idx="1"/>"#),
        "{xml}"
    );
    assert!(xml.contains(r#"<a:t>one</a:t></a:r></a:p><a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p><a:p><a:r>"#), "{xml}");
    assert!(
        rels.contains("../notesMasters/notesMaster1.xml") && rels.contains("../slides/slide3.xml"),
        "{rels}"
    );
}

#[test]
fn the_notes_master_shows_the_slide_in_the_decks_proportions() {
    let xml = with_cx(|cx| String::from_utf8(write_master(cx)).unwrap_or_default());
    assert!(
        xml.contains(r#"<a:ext cx="5486400" cy="3086100"/>"#),
        "{xml}"
    );
    assert!(
        xml.contains(r#"<p:ph type="sldImg" idx="2"/>"#)
            && xml.contains(r#"<p:ph type="body" sz="quarter" idx="3"/>"#),
        "{xml}"
    );
    assert_eq!(xml.matches("<a:lvl9pPr").count(), 1);
}
