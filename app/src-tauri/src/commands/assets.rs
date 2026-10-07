//! Files pasted or dropped into a page, kept in the vault's `assets/` folder
//! by kasten-core, and the gallery's view of the pictures among them. The
//! bytes travel as the request's raw body, not as JSON.

use std::collections::BTreeMap;

use kasten_core::Instant;
use kasten_core::assets::{AddedAsset, AssetEdit, AssetInfo, AssetUsage, NewAsset};
use tauri::State;
use tauri::ipc::{InvokeBody, Request, Response};

use super::notes::{HUMAN, OpenVault};

/// Keeps the request's body as a file in `assets/` and returns its vault
/// path. The file's name comes in the `x-name` header, percent-encoded,
/// since header values are ASCII.
#[tauri::command(async)]
pub fn save_asset(state: State<'_, OpenVault>, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The file's bytes did not arrive".into());
    };
    let name = request
        .headers()
        .get("x-name")
        .and_then(|value| value.to_str().ok())
        .and_then(percent_decode)
        .ok_or("The file's name did not arrive")?;
    state.run(|k| k.save_asset(&HUMAN, &name, bytes, Instant::now()))
}

/// Keeps the request's body as a picture (or file) in `assets/` with a
/// sidecar that remembers where it came from: the name comes in `x-name`
/// and what the file remembers (`NewAsset` as JSON: how it came in, a
/// caption, tags, a citation key, the paper and rectangle of a clip) in
/// `x-meta`, both percent-encoded. The same bytes already kept anywhere in
/// `assets/` come back as they are, with `created` false.
#[tauri::command(async)]
pub fn add_asset(state: State<'_, OpenVault>, request: Request<'_>) -> Result<AddedAsset, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The file's bytes did not arrive".into());
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .and_then(percent_decode)
    };
    let name = header("x-name").ok_or("The file's name did not arrive")?;
    let meta = match header("x-meta") {
        Some(json) => serde_json::from_str::<NewAsset>(&json)
            .map_err(|err| format!("What the file remembers could not be read: {err}"))?,
        None => NewAsset::default(),
    };
    state.run(|k| k.add_asset(&HUMAN, &name, bytes, &meta, Instant::now()))
}

/// The pictures in `assets/` with what their sidecars say, newest first.
#[tauri::command(async)]
pub fn list_assets(state: State<'_, OpenVault>) -> Result<Vec<AssetInfo>, String> {
    state.run(|k| k.assets())
}

/// One picture in full, its hash included.
#[tauri::command(async)]
pub fn asset_info(state: State<'_, OpenVault>, path: String) -> Result<AssetInfo, String> {
    state.run(|k| k.asset(&path))
}

/// Changes a picture's tags, caption or citation key.
#[tauri::command(async)]
pub fn set_asset_meta(
    state: State<'_, OpenVault>,
    path: String,
    edit: AssetEdit,
) -> Result<AssetInfo, String> {
    state.run(|k| k.set_asset_meta(&HUMAN, &path, &edit, Instant::now()))
}

/// A WebP thumbnail (256 or 1024 pixels) of a picture, as the response's raw
/// body; an empty body when the picture has none to show (a vector picture),
/// and the original is what to show then. The asset protocol cannot read the
/// cache the thumbnails are kept in, so they travel as bytes.
#[tauri::command(async)]
pub fn asset_thumb(
    state: State<'_, OpenVault>,
    path: String,
    size: u32,
) -> Result<Response, String> {
    state
        .run(|k| k.asset_thumb(&path, size))
        .map(|thumb| Response::new(thumb.unwrap_or_default()))
}

/// Where a picture is used: notes, boards and the slides of decks.
#[tauri::command(async)]
pub fn asset_usage(state: State<'_, OpenVault>, path: String) -> Result<AssetUsage, String> {
    state.run(|k| k.asset_usage(&path))
}

/// The use of every picture that is used, from one look at the vault.
#[tauri::command(async)]
pub fn assets_usage(state: State<'_, OpenVault>) -> Result<BTreeMap<String, AssetUsage>, String> {
    state.run(|k| k.assets_usage())
}

/// The bytes of a picture kept in `assets/`, for a slide export to pack.
/// They travel as the response's raw body.
#[tauri::command(async)]
pub fn read_asset(state: State<'_, OpenVault>, path: String) -> Result<Response, String> {
    state.run(|k| k.read_asset(&path)).map(Response::new)
}

/// `%XX` escapes turned back into bytes, read as UTF-8; None when an escape
/// is broken or the bytes are not UTF-8.
pub(crate) fn percent_decode(text: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(text.len());
    let mut rest = text.as_bytes();
    while let Some((&first, tail)) = rest.split_first() {
        if first == b'%' {
            let hex = std::str::from_utf8(tail.get(..2)?).ok()?;
            bytes.push(u8::from_str_radix(hex, 16).ok()?);
            rest = &tail[2..];
        } else {
            bytes.push(first);
            rest = tail;
        }
    }
    String::from_utf8(bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn names_come_back_from_their_escapes() {
        assert_eq!(
            percent_decode("Trip%20budget.xlsx").as_deref(),
            Some("Trip budget.xlsx")
        );
        assert_eq!(percent_decode("caf%C3%A9.png").as_deref(), Some("café.png"));
        assert_eq!(percent_decode("plain.png").as_deref(), Some("plain.png"));
        assert_eq!(percent_decode("broken%2"), None);
        assert_eq!(percent_decode("bad%zz.png"), None);
        assert_eq!(percent_decode("half%C3.png"), None);
    }
}
