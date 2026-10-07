use super::*;

const HASH: &str = "0c534e157fd52021e0e721f7ffa4c88c83b48f5931dc317919878f209f4c1494";

fn full() -> Sidecar {
    let mut card = Sidecar::new("01K5ZK0000000000000000AS01");
    card.set_file("Figure 3.png", HASH, 87, Some((4, 3)));
    card.set_origin("pasted", "person", "2026-09-24T08:00:00Z");
    card
}

#[test]
fn a_sidecar_sits_in_a_hidden_folder_beside_its_picture() {
    assert_eq!(
        sidecar_path("assets/figure.png").as_deref(),
        Some("assets/.meta/figure.png.json")
    );
    assert_eq!(
        sidecar_path("assets/photo-organiser/Map.PNG").as_deref(),
        Some("assets/photo-organiser/.meta/Map.PNG.json")
    );
    assert_eq!(
        picture_path("assets/.meta/figure.png.json").as_deref(),
        Some("assets/figure.png")
    );
    assert_eq!(
        picture_path("assets/photo-organiser/.meta/Map.PNG.json").as_deref(),
        Some("assets/photo-organiser/Map.PNG")
    );
    for path in [
        "assets/figure.png",
        "assets/.meta/figure.png",
        "assets/.meta/.json",
        ".meta/x.png.json",
        "assets/other/x.png.json",
    ] {
        assert_eq!(picture_path(path), None, "{path}");
    }
    for picture in ["figure.png", "assets/", "assets/.hidden.png", ""] {
        assert_eq!(sidecar_path(picture), None, "{picture}");
    }
}

#[test]
fn written_in_house_style_one_key_to_a_line() {
    let text = full().to_text();
    assert_eq!(
        text,
        "{\n  \"id\": \"01K5ZK0000000000000000AS01\",\n  \"name\": \"Figure 3.png\",\n  \"sha256\": \"0c534e157fd52021e0e721f7ffa4c88c83b48f5931dc317919878f209f4c1494\",\n  \"bytes\": 87,\n  \"width\": 4,\n  \"height\": 3,\n  \"source\": \"pasted\",\n  \"createdBy\": \"person\",\n  \"created\": \"2026-09-24T08:00:00Z\",\n  \"tags\": []\n}\n"
    );
    assert_eq!(Sidecar::parse(&text).unwrap(), full());
    assert_eq!(Sidecar::parse(&text).unwrap().to_text(), text);
}

#[test]
fn values_read_back_through_their_accessors() {
    let mut card = full();
    card.set_tags(&["figure".to_owned(), "a, b".to_owned()]);
    card.set_caption(Some("A \"quoted\" caption"));
    card.set_citation_key(Some("vaswani2017attention"));
    card.set_deck(Some("Lecture 4"));
    let clip = Clip {
        pdf: "sources/attention.pdf".to_owned(),
        page: 3,
        rect: [72.0, 300.126, 400.0, 520.5],
    };
    card.set_clip(Some(&clip));
    let card = Sidecar::parse(&card.to_text()).unwrap();
    assert_eq!(card.id(), Some("01K5ZK0000000000000000AS01"));
    assert_eq!(card.name(), Some("Figure 3.png"));
    assert_eq!(card.sha256(), Some(HASH));
    assert_eq!((card.bytes(), card.size()), (Some(87), Some((4, 3))));
    assert_eq!(
        (card.source(), card.created_by(), card.created()),
        (Some("pasted"), Some("person"), Some("2026-09-24T08:00:00Z"))
    );
    assert_eq!(card.tags(), ["figure", "a, b"]);
    assert_eq!(card.caption(), Some("A \"quoted\" caption"));
    assert_eq!(card.citation_key(), Some("vaswani2017attention"));
    assert_eq!(card.deck(), Some("Lecture 4"));
    assert_eq!(
        card.clip(),
        Some(Clip {
            rect: [72.0, 300.13, 400.0, 520.5],
            ..clip
        })
    );
}

#[test]
fn keys_go_in_the_usual_order_however_they_come() {
    let mut card = Sidecar::new("a");
    card.set_citation_key(Some("k"));
    card.set_origin("file", "person", "2026-09-24T08:00:00Z");
    card.set_caption(Some("c"));
    card.set_file("x.png", HASH, 1, Some((1, 1)));
    let keys: Vec<&str> = card.doc.keys().map(String::as_str).collect();
    assert_eq!(
        keys,
        [
            "id",
            "name",
            "sha256",
            "bytes",
            "width",
            "height",
            "source",
            "createdBy",
            "created",
            "tags",
            "caption",
            "citationKey"
        ]
    );
}

#[test]
fn keys_it_does_not_know_stay_where_they_are() {
    let text = "{\n  \"id\": \"a\",\n  \"x-zotero\": {\"key\": \"ABC\", \"n\": [1, 2]},\n  \"tags\": [\"t\"],\n  \"later\": true\n}\n";
    let mut card = Sidecar::parse(text).unwrap();
    card.set_caption(Some("kept"));
    card.set_file("x.png", HASH, 1, None);
    assert_eq!(
        card.to_text(),
        "{\n  \"id\": \"a\",\n  \"name\": \"x.png\",\n  \"sha256\": \"0c534e157fd52021e0e721f7ffa4c88c83b48f5931dc317919878f209f4c1494\",\n  \"bytes\": 1,\n  \"x-zotero\": {\"key\": \"ABC\", \"n\": [1, 2]},\n  \"tags\": [\"t\"],\n  \"caption\": \"kept\",\n  \"later\": true\n}\n"
    );
}

#[test]
fn clearing_a_field_removes_its_key() {
    let mut card = full();
    card.set_caption(Some("c"));
    card.set_caption(None);
    card.set_file("x.png", HASH, 1, None);
    let text = card.to_text();
    assert!(
        !text.contains("caption") && !text.contains("width") && !text.contains("height"),
        "{text}"
    );
    assert_eq!(card.size(), None);
}

#[test]
fn what_is_not_a_sidecar_is_refused_and_odd_values_read_as_absent() {
    assert!(Sidecar::parse("").is_err());
    assert!(Sidecar::parse("[1]").is_err());
    assert!(Sidecar::parse("{ nope").is_err());
    assert_eq!(Sidecar::parse("{}").unwrap().to_text(), "{}\n");
    let odd = Sidecar::parse(
        "{\"sha256\": \"not a hash\", \"bytes\": \"12\", \"width\": 0, \"height\": 5, \"tags\": [\"a\", 3, \"b\"], \"clip\": {\"pdf\": \"p.pdf\"}, \"caption\": \"\"}",
    )
    .unwrap();
    assert_eq!((odd.sha256(), odd.bytes(), odd.size()), (None, None, None));
    assert_eq!(odd.tags(), ["a", "b"]);
    assert_eq!((odd.clip(), odd.caption()), (None, None));
}
