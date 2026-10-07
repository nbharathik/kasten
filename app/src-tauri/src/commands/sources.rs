//! PDFs in `sources/` and their highlights, through
//! kasten-core. An imported PDF comes as the request's raw body and goes to
//! the reader as raw bytes, as pasted files do, not as JSON.

use kasten_core::sources::{Highlight, HighlightEdit, NewHighlight, SourceHighlights, SourceInfo};
use kasten_core::{Instant, NoteFile};
use tauri::State;
use tauri::ipc::{InvokeBody, Request, Response};

use super::assets::percent_decode;
use super::notes::{HUMAN, OpenVault};

/// Keeps the request's body as a PDF in `sources/` and returns its vault
/// path. Its name comes in the `x-name` header, percent-encoded.
#[tauri::command(async)]
pub fn import_source(state: State<'_, OpenVault>, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The PDF's bytes did not arrive".into());
    };
    let name = request
        .headers()
        .get("x-name")
        .and_then(|value| value.to_str().ok())
        .and_then(percent_decode)
        .ok_or("The PDF's name did not arrive")?;
    state.run(|k| k.import_source(&HUMAN, &name, bytes, Instant::now()))
}

/// A source's bytes, for the reader.
#[tauri::command(async)]
pub fn read_source(state: State<'_, OpenVault>, path: String) -> Result<Response, String> {
    state.run(|k| k.read_source(&path)).map(Response::new)
}

#[tauri::command(async)]
pub fn list_sources(state: State<'_, OpenVault>) -> Result<Vec<SourceInfo>, String> {
    state.run(|k| k.sources())
}

#[tauri::command(async)]
pub fn source_highlights(
    state: State<'_, OpenVault>,
    source: String,
) -> Result<Vec<Highlight>, String> {
    state.run(|k| k.highlights(&source))
}

#[tauri::command(async)]
pub fn all_highlights(state: State<'_, OpenVault>) -> Result<Vec<SourceHighlights>, String> {
    state.run(|k| k.all_highlights())
}

#[tauri::command(async)]
pub fn add_highlight(
    state: State<'_, OpenVault>,
    source: String,
    highlight: NewHighlight,
) -> Result<Highlight, String> {
    state.run(|k| k.add_highlight(&HUMAN, &source, &highlight, Instant::now()))
}

#[tauri::command(async)]
pub fn edit_highlight(
    state: State<'_, OpenVault>,
    source: String,
    id: String,
    edit: HighlightEdit,
) -> Result<Highlight, String> {
    state.run(|k| k.edit_highlight(&HUMAN, &source, &id, &edit, Instant::now()))
}

#[tauri::command(async)]
pub fn remove_highlight(
    state: State<'_, OpenVault>,
    source: String,
    id: String,
) -> Result<(), String> {
    state.run(|k| k.remove_highlight(&HUMAN, &source, &id, Instant::now()))
}

/// The highlight's card, made on first asking. `date` is the person's day,
/// for the card's template placeholders.
#[tauri::command(async)]
pub fn highlight_card(
    state: State<'_, OpenVault>,
    source: String,
    id: String,
    date: String,
) -> Result<NoteFile, String> {
    state.run(|k| k.highlight_card(&HUMAN, &source, &id, &date, Instant::now()))
}
