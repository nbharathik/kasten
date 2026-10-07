//! Properties, tags and how connected each note is.

use kasten_core::tags::TagSchema;
use kasten_core::{AddedKit, Instant, KitInfo, NoteFile, NoteStats};
use serde_json::{Map, Value};
use tauri::State;

use super::notes::{HUMAN, OpenVault};

#[tauri::command(async)]
pub fn tag_schemas(state: State<'_, OpenVault>) -> Result<Vec<TagSchema>, String> {
    state.run(|k| k.tag_schemas())
}

#[tauri::command(async)]
pub fn set_tag_views(
    state: State<'_, OpenVault>,
    tag: String,
    views: Vec<Value>,
) -> Result<TagSchema, String> {
    state.run(|k| k.set_tag_views(&HUMAN, &tag, &views, Instant::now()))
}

#[tauri::command(async)]
pub fn set_tag_properties(
    state: State<'_, OpenVault>,
    tag: String,
    properties: Vec<Value>,
) -> Result<TagSchema, String> {
    state.run(|k| k.set_tag_properties(&HUMAN, &tag, &properties, Instant::now()))
}

#[tauri::command(async)]
pub fn update_props(
    state: State<'_, OpenVault>,
    path: String,
    props: Map<String, Value>,
) -> Result<NoteFile, String> {
    state.run(|k| k.update_props(&HUMAN, &path, &props, Instant::now()))
}

#[tauri::command(async)]
pub fn set_tags(
    state: State<'_, OpenVault>,
    path: String,
    add: Vec<String>,
    remove: Vec<String>,
) -> Result<NoteFile, String> {
    state.run(|k| k.set_tags(&HUMAN, &path, &add, &remove, Instant::now()))
}

#[tauri::command(async)]
pub fn missing_templates(state: State<'_, OpenVault>) -> Result<Vec<String>, String> {
    state.run(|k| k.missing_templates())
}

#[tauri::command(async)]
pub fn add_starter_templates(state: State<'_, OpenVault>) -> Result<Vec<String>, String> {
    state.run(|k| k.add_starter_templates(&HUMAN, Instant::now()))
}

/// The starter kits the app offers.
#[tauri::command]
pub fn list_kits() -> Vec<KitInfo> {
    kasten_core::kits()
}

/// Adds a starter kit in one commit that undo takes back.
#[tauri::command(async)]
pub fn add_kit(state: State<'_, OpenVault>, id: String) -> Result<AddedKit, String> {
    state.run(|k| k.add_kit(&HUMAN, &id, Instant::now()))
}

/// Saves a page as a new template.
#[tauri::command(async)]
pub fn save_as_template(
    state: State<'_, OpenVault>,
    path: String,
    name: String,
) -> Result<NoteFile, String> {
    state.run(|k| k.save_as_template(&HUMAN, &path, &name, Instant::now()))
}

/// The tour of the app as a page, made the first time it is asked for.
#[tauri::command(async)]
pub fn add_tour(state: State<'_, OpenVault>) -> Result<String, String> {
    state.run(|k| k.add_tour(&HUMAN, Instant::now()))
}

#[tauri::command(async)]
pub fn note_stats(state: State<'_, OpenVault>) -> Result<Vec<NoteStats>, String> {
    state.run(|k| k.note_stats())
}

#[tauri::command(async)]
pub fn replace_section(
    state: State<'_, OpenVault>,
    path: String,
    heading: String,
    markdown: String,
) -> Result<NoteFile, String> {
    state.run(|k| k.replace_section(&HUMAN, &path, &heading, &markdown, Instant::now()))
}

/// Adds Markdown at the end of the note, or of the section under `heading`.
#[tauri::command(async)]
pub fn append_note(
    state: State<'_, OpenVault>,
    path: String,
    markdown: String,
    heading: Option<String>,
) -> Result<NoteFile, String> {
    state.run(|k| k.append(&HUMAN, &path, &markdown, heading.as_deref(), Instant::now()))
}
