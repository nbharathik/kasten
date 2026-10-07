//! The requests a page makes of the folder host: which decks there are, read
//! one, save one, make one, trash one, keep and fetch pictures, read the
//! bibliography, and the stream of changes.

use std::path::PathBuf;
use std::sync::Arc;

use serde_json::json;
use slides_core::themes;

use super::events::Hub;
use super::files::FolderError;
use super::folder::Folder;
use super::http::{Request, Response};
use super::pictures::AssetEdit;
use super::ui;

pub struct Context {
    pub folder: Arc<Folder>,
    pub hub: Arc<Hub>,
    /// The built page to serve, if there is one.
    pub page: Option<PathBuf>,
}

pub enum Reply {
    Done(Response),
    /// Keep the connection open and send changes down it.
    Events,
}

/// Whether a `Host` or `Origin` names this machine.
pub fn is_local(value: &str) -> bool {
    let without_scheme = value.split_once("://").map_or(value, |(_, rest)| rest);
    let authority = without_scheme.split('/').next().unwrap_or("");
    let name = match authority.rsplit_once(':') {
        Some((name, port)) if port.chars().all(|c| c.is_ascii_digit()) => name,
        _ => authority,
    };
    matches!(name, "127.0.0.1" | "localhost" | "[::1]")
}

/// Refuses what a web page from somewhere else could try: another `Host`
/// (a name that resolves here after the page loaded), and a change made
/// without the header only our own page sends, which a browser only lets
/// through after the server has agreed to it.
fn guard(request: &Request) -> Option<Response> {
    if !request.header("host").is_some_and(is_local) {
        return Some(Response::error(
            403,
            "this server answers on the local address only",
        ));
    }
    if request.method != "GET" && request.method != "HEAD" {
        let from_here = request.header("origin").is_none_or(is_local);
        if request.header("x-slides").is_none() || !from_here {
            return Some(Response::error(
                403,
                "changes come from the page this server shows",
            ));
        }
    }
    None
}

impl From<FolderError> for Response {
    fn from(e: FolderError) -> Response {
        match e {
            FolderError::NotFound(m) => Response::error(404, &m),
            FolderError::Invalid(m) => Response::error(422, &m),
            FolderError::Io(m) => Response::error(500, &m),
        }
    }
}

fn need<'a>(request: &'a Request, name: &str) -> Result<&'a str, Response> {
    request
        .param(name)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| Response::error(400, &format!("the `{name}` parameter is missing")))
}

fn json_of<T: serde::Serialize>(value: &T) -> Response {
    match serde_json::to_value(value) {
        Ok(v) => Response::json(200, &v),
        Err(e) => Response::error(500, &e.to_string()),
    }
}

pub fn route(context: &Context, request: &Request) -> Reply {
    if let Some(refused) = guard(request) {
        return Reply::Done(refused);
    }
    let Some(endpoint) = request.path.strip_prefix("/api/") else {
        if request.method != "GET" && request.method != "HEAD" {
            return Reply::Done(Response::error(405, "the page is read-only"));
        }
        return Reply::Done(ui::serve(context.page.as_deref(), &request.path));
    };
    if endpoint == "events" && request.method == "GET" {
        return Reply::Events;
    }
    let done = api(context, request, endpoint).unwrap_or_else(|response| response);
    Reply::Done(done.with("Cache-Control", "no-store"))
}

fn api(context: &Context, request: &Request, endpoint: &str) -> Result<Response, Response> {
    let folder = &context.folder;
    let method = request.method.as_str();
    Ok(match (method, endpoint) {
        ("GET", "info") => Response::json(
            200,
            &json!({
                "name": folder.name(),
                "version": env!("CARGO_PKG_VERSION"),
                "themes": themes::all().iter().map(|t| t.name.clone()).collect::<Vec<_>>(),
            }),
        ),
        ("GET", "decks") => json_of(&folder.decks()),
        ("GET", "deck") => json_of(&folder.read(need(request, "path")?)?),
        ("POST", "decks") => {
            let title = request.param("title").unwrap_or("");
            let theme = request.param("theme").unwrap_or("Light");
            json_of(&folder.create(title, theme)?)
        }
        ("PUT", "deck") => {
            let saved = folder.save(
                need(request, "path")?,
                request
                    .text()
                    .map_err(|_| Response::error(400, "the body is not text"))?,
                request.param("base").unwrap_or(""),
            )?;
            json_of(&saved)
        }
        ("POST", "trash") => Response::json(
            200,
            &json!({ "trashed": folder.trash(need(request, "path")?)? }),
        ),
        ("GET", "asset") => {
            let (bytes, kind) = folder.asset(need(request, "path")?)?;
            // A picture opened on its own must not run the scripts an SVG can hold.
            Response::bytes(200, kind, bytes)
                .with(
                    "Content-Security-Policy",
                    "sandbox; default-src 'none'; style-src 'unsafe-inline'",
                )
                .with("X-Content-Type-Options", "nosniff")
        }
        ("GET", "assets") => json_of(&folder.assets()),
        // The bibliography beside the decks; a folder with no `.bib` file has an empty one.
        ("GET", "references") => Response::json(
            200,
            &json!({ "text": crate::refs::text_in(folder.root()).unwrap_or_default() }),
        ),
        // A picture pasted or chosen: kept once, the same bytes under any name being the same picture.
        ("POST", "asset") => json_of(&folder.keep_picture(
            need(request, "name")?,
            &request.body,
            request.param("source").unwrap_or("file"),
        )?),
        ("PUT", "asset-meta") => {
            let edit: AssetEdit = serde_json::from_str(
                request
                    .text()
                    .map_err(|_| Response::error(400, "the body is not text"))?,
            )
            .map_err(|e| {
                Response::error(400, &format!("that is not a change to a picture: {e}"))
            })?;
            json_of(&folder.set_asset_meta(need(request, "path")?, &edit)?)
        }
        // A small WebP copy of a picture (256 or 1024 pixels); a picture with none is not found.
        ("GET", "thumb") => {
            let size = request
                .param("size")
                .and_then(|s| s.parse().ok())
                .unwrap_or(256);
            match folder.thumb(need(request, "path")?, size)? {
                Some(copy) => Response::bytes(200, "image/webp", copy.to_vec()),
                None => Response::error(404, "that picture has no small copy"),
            }
        }
        ("GET", "usage") => json_of(&folder.usage()),
        (
            _,
            "info" | "decks" | "deck" | "trash" | "asset" | "assets" | "asset-meta" | "thumb"
            | "usage" | "references",
        ) => Response::error(405, "that method is not used here"),
        _ => Response::error(404, "there is no such request"),
    })
}

#[cfg(test)]
mod tests;
