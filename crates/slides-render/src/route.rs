//! What the page is told when it asks for something. The browser is never on a network: the page lives at an address
//! of its own (`http://slides-render.localhost/`), every request it makes is caught before it goes anywhere, and this
//! decides the answer: a file of the page, a picture of the deck, or a refusal. An address of any other kind, on
//! any other host, is refused, so a deck cannot make the browser fetch anything from anywhere.

use std::borrow::Cow;

use crate::bundle::{Page, page_path};
use crate::media::{Media, inside, media_type};

/// The page's own host. `.localhost` names are never looked up: they mean this computer.
pub const HOST: &str = "slides-render.localhost";

/// The address the page is loaded from.
pub const START: &str = "http://slides-render.localhost/index.html";

/// The prefix of the addresses a deck's pictures are asked for at: `media/assets/figure.png`.
pub const MEDIA: &str = "/media/";

/// What the page can do: run its own code and the engine, draw with its own styles and fonts, and read what it
/// was sent; nothing else, and nothing from anywhere else.
pub const POLICY: &str = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/// Where a request is to be answered from.
#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    /// A file of the page, by the path in the address.
    Page(String),
    /// A picture of the deck, by the path the deck names it with.
    Media(String),
    /// Not the page's: it is turned away.
    Refused,
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// The text a percent-encoded path stands for; `None` when the encoding is broken or is not text.
pub fn percent_decode(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let high = hex(*bytes.get(i + 1)?)?;
            let low = hex(*bytes.get(i + 2)?)?;
            out.push(high << 4 | low);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Where the request for `url` is answered from.
pub fn route(url: &str) -> Route {
    let Some((scheme, rest)) = url.split_once("://") else {
        return Route::Refused;
    };
    let (host, path) = rest
        .split_once('/')
        .map_or((rest, ""), |(host, path)| (host, path));
    if !scheme.eq_ignore_ascii_case("http") || !host.eq_ignore_ascii_case(HOST) {
        return Route::Refused;
    }
    let path = format!("/{}", path.split(['?', '#']).next().unwrap_or_default());
    if let Some(named) = path.strip_prefix(MEDIA) {
        return match percent_decode(named) {
            Some(decoded) if inside(&decoded).is_some() => Route::Media(decoded),
            _ => Route::Refused,
        };
    }
    match percent_decode(&path).and_then(|p| page_path(&p)) {
        Some(_) => Route::Page(path),
        None => Route::Refused,
    }
}

/// One answer: the status, the headers and the body.
#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Cow<'static, [u8]>,
}

/// What to do with a request.
#[derive(Debug)]
pub enum Answer {
    Send(Response),
    /// Fail the request as blocked.
    Block,
}

fn nothing(status: u16) -> Answer {
    Answer::Send(Response {
        status,
        headers: vec![
            ("Content-Type", "text/plain; charset=utf-8".to_owned()),
            ("Cache-Control", "no-store".to_owned()),
        ],
        body: Cow::Borrowed(b""),
    })
}

/// The most warnings kept about one render: a deck that names a hundred missing pictures gets the first few said.
const MOST_NOTES: usize = 12;

fn note(notes: &mut Vec<String>, text: String) {
    if notes.len() < MOST_NOTES && !notes.contains(&text) {
        notes.push(text);
    }
}

/// The answer to a request. `notes` gets what a person should be told of: a picture that is not there.
pub fn respond(url: &str, page: &Page, media: &dyn Media, notes: &mut Vec<String>) -> Answer {
    match route(url) {
        Route::Page(path) => match page.get(&percent_decode(&path).unwrap_or_default()) {
            Some(file) => {
                let mut headers = vec![
                    ("Content-Type", file.content_type.to_owned()),
                    ("Cache-Control", "no-cache".to_owned()),
                    ("X-Content-Type-Options", "nosniff".to_owned()),
                    ("Cross-Origin-Resource-Policy", "same-origin".to_owned()),
                ];
                if file.content_type.starts_with("text/html") {
                    headers.push(("Content-Security-Policy", POLICY.to_owned()));
                }
                Answer::Send(Response {
                    status: 200,
                    headers,
                    body: file.bytes,
                })
            }
            None => nothing(404),
        },
        Route::Media(path) => match media.read(&path) {
            Some(bytes) => {
                let kind = media_type(&bytes, &path);
                Answer::Send(Response {
                    status: 200,
                    headers: vec![
                        ("Content-Type", kind.to_owned()),
                        ("Cache-Control", "no-store".to_owned()),
                        ("X-Content-Type-Options", "nosniff".to_owned()),
                        ("Cross-Origin-Resource-Policy", "same-origin".to_owned()),
                        (
                            "Content-Security-Policy",
                            "default-src 'none'; style-src 'unsafe-inline'; sandbox".to_owned(),
                        ),
                    ],
                    body: Cow::Owned(bytes),
                })
            }
            None => {
                note(
                    notes,
                    format!("The picture {path} could not be found, so its place is left empty."),
                );
                nothing(404)
            }
        },
        Route::Refused => {
            // A `data:` or `blob:` address never reaches here; what does is a deck that names a web address.
            let shown: String = url.chars().take(80).collect();
            note(
                notes,
                format!(
                    "The deck asks for {shown}, which is not loaded: slides are drawn without a network."
                ),
            );
            Answer::Block
        }
    }
}

#[cfg(test)]
mod tests;
