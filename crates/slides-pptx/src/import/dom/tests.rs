use super::*;

fn read(xml: &str) -> Doc {
    parse(xml.as_bytes()).unwrap_or_else(|e| panic!("{e}"))
}

#[test]
fn names_in_known_namespaces_get_their_usual_prefix_whatever_the_file_chose() {
    let doc = read(
        r#"<?xml version="1.0"?><x:sld xmlns:x="http://schemas.openxmlformats.org/presentationml/2006/main"
            xmlns:q="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:rel="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <q:off x="1" rel:id="rId7"/></x:sld>"#,
    );
    assert_eq!(doc.root.name, "p:sld");
    let off = doc.root.child("a:off").unwrap_or_else(|| panic!("a:off"));
    assert_eq!(off.attr("x"), Some("1"));
    assert_eq!(off.attr("r:id"), Some("rId7"));
    assert!(doc.declarations.is_empty());
}

#[test]
fn a_default_namespace_counts_and_other_namespaces_keep_their_names() {
    let doc = read(
        r#"<sld xmlns="http://schemas.openxmlformats.org/presentationml/2006/main"><ext xmlns:foo="urn:foo" foo:bar="1"><foo:thing/></ext></sld>"#,
    );
    assert_eq!(doc.root.name, "p:sld");
    let ext = doc.root.child("p:ext").unwrap_or_else(|| panic!("ext"));
    assert_eq!(ext.attr("foo:bar"), Some("1"));
    assert!(ext.child("foo:thing").is_some());
    assert_eq!(ext.attr("xmlns:foo"), Some("urn:foo"));
}

#[test]
fn text_keeps_its_spaces_and_indentation_between_elements_is_dropped() {
    let doc = read(
        "<a:p xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">\n  <a:r>\n    <a:t> two  words </a:t>\n  </a:r>\n</a:p>",
    );
    let t = doc
        .root
        .at(&["a:r", "a:t"])
        .unwrap_or_else(|| panic!("a:t"));
    assert_eq!(t.text(), " two  words ");
    assert_eq!(doc.root.children.len(), 1, "no whitespace nodes");
}

#[test]
fn the_five_entities_and_character_references_are_decoded_in_text_and_attributes() {
    let doc =
        read(r#"<t v="a &lt; b &amp; &#x41;&#66;">1 &lt; 2 &amp; &quot;3&quot; &apos;&#8364;</t>"#);
    assert_eq!(doc.root.attr("v"), Some("a < b & AB"));
    assert_eq!(doc.root.text(), "1 < 2 & \"3\" '€");
}

#[test]
fn an_entity_the_file_defines_is_refused_and_so_is_a_document_type() {
    let bomb = r#"<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><t>&lol2;</t>"#;
    assert!(matches!(
        parse(bomb.as_bytes()),
        Err(DomError::Malformed(_))
    ));
    assert!(parse(b"<t>&nope;</t>").is_err());
    assert!(parse(br#"<t v="&nope;"/>"#).is_err());
}

#[test]
fn broken_documents_are_errors_not_panics() {
    for bad in [
        &b""[..],
        b"<a>",
        b"<a></b>",
        b"</a>",
        b"<a/><b/>",
        b"not xml",
        b"<a b=></a>",
        b"\xff\xfe<a/>",
        b"<a><b></a></b>",
    ] {
        assert!(parse(bad).is_err(), "{:?}", String::from_utf8_lossy(bad));
    }
}

#[test]
fn nesting_and_size_are_limited() {
    let deep = "<a>".repeat(MAX_DEPTH + 1) + &"</a>".repeat(MAX_DEPTH + 1);
    assert!(matches!(parse(deep.as_bytes()), Err(DomError::TooBig(_))));
    let fine = "<a>".repeat(MAX_DEPTH) + &"</a>".repeat(MAX_DEPTH);
    assert!(parse(fine.as_bytes()).is_ok());
    let wide = format!("<a>{}</a>", "<b/>".repeat(MAX_NODES + 1));
    assert!(matches!(parse(wide.as_bytes()), Err(DomError::TooBig(_))));
}

#[test]
fn a_fragment_declares_the_prefixes_it_uses_and_reads_back_the_same() {
    let doc = read(
        r#"<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:foo="urn:foo">
        <p:sp><a:blip r:embed="rId2" foo:x="&lt;1&gt;"/><a:t>a &amp; b</a:t></p:sp></p:sld>"#,
    );
    let sp = doc.root.child("p:sp").unwrap_or_else(|| panic!("sp"));
    let text = fragment(sp, &doc.declarations);
    assert!(text.starts_with("<p:sp xmlns:p="), "{text}");
    assert!(
        text.contains(
            r#"xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#
        ),
        "{text}"
    );
    assert!(text.contains(r#"xmlns:foo="urn:foo""#), "{text}");
    // The declaration the fragment carries for a namespace of its own is an attribute again.
    let mut again = read(&text).root;
    assert_eq!(again.attr("xmlns:foo"), Some("urn:foo"));
    again.attrs.retain(|(k, _)| !k.starts_with("xmlns"));
    assert_eq!(again, *sp);
}

#[test]
fn newlines_and_tabs_in_attributes_survive_a_write() {
    let mut n = Node::new("t");
    n.set_attr("v", "a\nb\tc\"d");
    let text = fragment(&n, &[]);
    assert_eq!(read(&text).root.attr("v"), Some("a\nb\tc\"d"));
}
