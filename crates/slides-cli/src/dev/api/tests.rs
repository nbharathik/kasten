use super::*;
use std::fs;

fn context(name: &str) -> Context {
    let dir = std::env::temp_dir().join(format!("slides-api-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    Context {
        folder: Arc::new(Folder::open(&dir).unwrap()),
        hub: Arc::new(Hub::default()),
        page: None,
    }
}

fn request(method: &str, target: &str, headers: &[(&str, &str)], body: &[u8]) -> Request {
    Request::for_test(method, target, headers, body)
}

const HOME: &[(&str, &str)] = &[("host", "127.0.0.1:5175"), ("x-slides", "1")];

fn answer(context: &Context, request: &Request) -> Response {
    match route(context, request) {
        Reply::Done(r) => r,
        Reply::Events => panic!("expected an answer"),
    }
}

fn body(response: &Response) -> serde_json::Value {
    serde_json::from_slice(&response.body).unwrap()
}

#[test]
fn only_this_machine_may_ask() {
    assert!(is_local("127.0.0.1:5175") && is_local("localhost") && is_local("[::1]:80"));
    assert!(is_local("http://localhost:5174") && is_local("http://127.0.0.1:1/x"));
    assert!(
        !is_local("evil.example") && !is_local("127.0.0.1.evil.example:80") && !is_local("null")
    );
    let context = context("guard");
    let stranger = request("GET", "/api/decks", &[("host", "evil.example")], b"");
    assert_eq!(answer(&context, &stranger).status, 403);
    let no_header = request(
        "POST",
        "/api/decks?title=x",
        &[("host", "127.0.0.1:1")],
        b"",
    );
    assert_eq!(answer(&context, &no_header).status, 403);
    let foreign = request(
        "POST",
        "/api/decks?title=x",
        &[
            ("host", "127.0.0.1:1"),
            ("x-slides", "1"),
            ("origin", "https://evil.example"),
        ],
        b"",
    );
    assert_eq!(answer(&context, &foreign).status, 403);
}

#[test]
fn makes_lists_reads_saves_and_trashes_a_deck() {
    let context = context("flow");
    let made = answer(
        &context,
        &request("POST", "/api/decks?title=Big+talk&theme=Dark", HOME, b""),
    );
    assert_eq!(made.status, 200);
    let deck = body(&made);
    assert_eq!(deck["path"], "big-talk.deck");

    let listed = body(&answer(&context, &request("GET", "/api/decks", HOME, b"")));
    assert_eq!(listed[0]["title"], "Big talk");

    let read = body(&answer(
        &context,
        &request("GET", "/api/deck?path=big-talk.deck", HOME, b""),
    ));
    assert_eq!(read["hash"], deck["hash"]);

    let edited = deck["text"]
        .as_str()
        .unwrap()
        .replace("Big talk", "Bigger talk");
    let target = format!(
        "/api/deck?path=big-talk.deck&base={}",
        deck["hash"].as_str().unwrap()
    );
    let saved = body(&answer(
        &context,
        &request("PUT", &target, HOME, edited.as_bytes()),
    ));
    assert_eq!(saved["status"], "written");

    // The same base again is now out of date.
    let stale = body(&answer(
        &context,
        &request(
            "PUT",
            &target,
            HOME,
            deck["text"].as_str().unwrap().as_bytes(),
        ),
    ));
    assert_eq!(stale["status"], "conflict");
    assert!(
        stale["copy"]
            .as_str()
            .unwrap()
            .starts_with("big-talk (conflict ")
    );

    let trashed = body(&answer(
        &context,
        &request("POST", "/api/trash?path=big-talk.deck", HOME, b""),
    ));
    assert!(trashed["trashed"].as_str().unwrap().starts_with(".trash/"));
}

#[test]
fn keeps_and_serves_pictures() {
    let context = context("assets");
    let kept = body(&answer(
        &context,
        &request("POST", "/api/asset?name=logo.png", HOME, b"PNGDATA"),
    ));
    assert_eq!(kept["path"], "assets/logo.png");
    let got = answer(
        &context,
        &request("GET", "/api/asset?path=assets/logo.png", HOME, b""),
    );
    assert_eq!(
        (got.status, got.body.as_slice()),
        (200, b"PNGDATA".as_slice())
    );
    assert_eq!(
        answer(
            &context,
            &request("GET", "/api/asset?path=assets/../x.png", HOME, b"")
        )
        .status,
        422
    );
    assert_eq!(
        answer(
            &context,
            &request("GET", "/api/asset?path=assets/none.png", HOME, b"")
        )
        .status,
        404
    );
    assert_eq!(
        body(&answer(&context, &request("GET", "/api/assets", HOME, b"")))[0]["name"],
        "logo.png"
    );
}

#[test]
fn says_when_a_request_is_wrong() {
    let context = context("wrong");
    assert_eq!(
        answer(&context, &request("GET", "/api/deck", HOME, b"")).status,
        400
    );
    assert_eq!(
        answer(&context, &request("GET", "/api/nothing", HOME, b"")).status,
        404
    );
    assert_eq!(
        answer(
            &context,
            &request("DELETE", "/api/deck?path=x.deck", HOME, b"")
        )
        .status,
        405
    );
    assert_eq!(
        answer(
            &context,
            &request("GET", "/api/deck?path=../x.deck", HOME, b"")
        )
        .status,
        422
    );
    assert!(matches!(
        route(&context, &request("GET", "/api/events", HOME, b"")),
        Reply::Events
    ));
}

#[test]
fn serves_the_bibliography_beside_the_decks_and_an_empty_one_when_there_is_none() {
    let context = context("references");
    let none = answer(&context, &request("GET", "/api/references", HOME, b""));
    assert_eq!(none.status, 200);
    assert_eq!(
        body(&none)["text"],
        "",
        "no .bib file is an empty bibliography"
    );

    fs::write(
        context.folder.root().join("refs.bib"),
        "@article{a, title={One}}",
    )
    .unwrap();
    fs::write(
        context.folder.root().join("more.bib"),
        "@article{b, title={Two}}",
    )
    .unwrap();
    let text = body(&answer(
        &context,
        &request("GET", "/api/references", HOME, b""),
    ));
    let text = text["text"].as_str().unwrap();
    assert!(
        text.find("@article{b").unwrap() < text.find("@article{a").unwrap(),
        "the files in the order of their names: {text}"
    );
    let put = request("POST", "/api/references", HOME, b"");
    assert_eq!(answer(&context, &put).status, 405);
}

const PIXEL: &[u8] = include_bytes!("../../../../../fixtures/assets/pixel.png");
const WIDE: &[u8] = include_bytes!("../../../../../fixtures/assets/wide.png");
const LOGO: &[u8] = include_bytes!("../../../../../fixtures/assets/logo.svg");

#[test]
fn a_picture_pasted_twice_is_one_picture_with_a_sidecar() {
    let context = context("pasted-twice");
    let post = |name: &str, bytes: &[u8]| {
        body(&answer(
            &context,
            &request(
                "POST",
                &format!("/api/asset?name={name}&source=pasted"),
                HOME,
                bytes,
            ),
        ))
    };
    let first = post("Pasted%20image%201.png", PIXEL);
    assert_eq!(
        (first["path"].as_str(), first["created"].as_bool()),
        (Some("assets/Pasted image 1.png"), Some(true))
    );
    let second = post("Pasted%20image%202.png", PIXEL);
    assert_eq!(
        (second["path"].as_str(), second["created"].as_bool()),
        (Some("assets/Pasted image 1.png"), Some(false))
    );
    let listed = body(&answer(&context, &request("GET", "/api/assets", HOME, b"")));
    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(listed[0]["source"], "pasted");
    assert_eq!(
        (listed[0]["width"].as_u64(), listed[0]["height"].as_u64()),
        (Some(4), Some(3))
    );
    assert_eq!(listed[0]["sha256"].as_str().map(str::len), Some(64));
    let bad = answer(
        &context,
        &request("POST", "/api/asset?name=x.png&source=agent", HOME, PIXEL),
    );
    assert_eq!(bad.status, 422);
}

#[test]
fn a_pictures_notes_thumbnail_and_use_are_asked_for_and_changed_through_the_api() {
    let context = context("gallery");
    let path = "assets/wide.png";
    answer(
        &context,
        &request("POST", "/api/asset?name=wide.png", HOME, WIDE),
    );
    answer(
        &context,
        &request("POST", "/api/asset?name=logo.svg", HOME, LOGO),
    );

    let edit = br#"{"tags":["Figure"],"caption":"Attention","citationKey":"vaswani2017"}"#;
    let changed = body(&answer(
        &context,
        &request("PUT", &format!("/api/asset-meta?path={path}"), HOME, edit),
    ));
    assert_eq!(
        (changed["caption"].as_str(), changed["citationKey"].as_str()),
        (Some("Attention"), Some("vaswani2017"))
    );
    assert_eq!(changed["tags"], serde_json::json!(["Figure"]));
    let wrong = answer(
        &context,
        &request(
            "PUT",
            &format!("/api/asset-meta?path={path}"),
            HOME,
            b"{ nope",
        ),
    );
    assert_eq!(wrong.status, 400);
    let refused = answer(
        &context,
        &request(
            "PUT",
            &format!("/api/asset-meta?path={path}"),
            HOME,
            br#"{"citationKey":"two words"}"#,
        ),
    );
    assert_eq!(refused.status, 422);
    let no_header = request(
        "PUT",
        &format!("/api/asset-meta?path={path}"),
        &[("host", "127.0.0.1:1")],
        edit,
    );
    assert_eq!(answer(&context, &no_header).status, 403);

    let thumb = answer(
        &context,
        &request(
            "GET",
            &format!("/api/thumb?path={path}&size=256"),
            HOME,
            b"",
        ),
    );
    assert_eq!(thumb.status, 200);
    assert_eq!(&thumb.body[8..12], b"WEBP");
    let none = answer(
        &context,
        &request("GET", "/api/thumb?path=assets/logo.svg&size=256", HOME, b""),
    );
    assert_eq!(none.status, 404);
    let odd = answer(
        &context,
        &request("GET", &format!("/api/thumb?path={path}&size=99"), HOME, b""),
    );
    assert_eq!(odd.status, 422);

    let usage = body(&answer(&context, &request("GET", "/api/usage", HOME, b"")));
    assert!(
        usage.as_object().unwrap().is_empty(),
        "no deck uses anything yet"
    );
    assert_eq!(
        answer(&context, &request("DELETE", "/api/usage", HOME, b"")).status,
        405
    );
}
