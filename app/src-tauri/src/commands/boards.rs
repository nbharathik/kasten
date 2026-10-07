//! Whiteboards: listing, reading and the edits the app and brainstorms make.

use kasten_core::board::{Added, BoardChange, BoardView, Layout};
use kasten_core::{BoardApplied, BoardInfo, Instant};
use tauri::State;

use super::notes::{HUMAN, OpenVault};

#[tauri::command(async)]
pub fn list_boards(state: State<'_, OpenVault>) -> Result<Vec<BoardInfo>, String> {
    state.run(|k| k.boards())
}

#[tauri::command(async)]
pub fn read_board(state: State<'_, OpenVault>, path: String) -> Result<BoardView, String> {
    state.run(|k| k.board(&path))
}

#[tauri::command(async)]
pub fn create_board(
    state: State<'_, OpenVault>,
    title: String,
    project: Option<String>,
) -> Result<String, String> {
    state.run(|k| k.create_board(&HUMAN, &title, project.as_deref(), Instant::now()))
}

/// `layout` is `grid` or `cluster_by_tag`; `positions` places each note instead.
#[tauri::command(async)]
pub fn add_to_board(
    state: State<'_, OpenVault>,
    board: String,
    notes: Vec<String>,
    layout: Option<String>,
    positions: Option<Vec<(i64, i64)>>,
) -> Result<Added, String> {
    let layout = match (layout.as_deref(), positions) {
        (_, Some(at)) => Layout::Positions(at),
        (Some("cluster_by_tag"), None) => Layout::ClusterByTag,
        _ => Layout::Grid,
    };
    state.run(|k| k.add_to_board(&HUMAN, &board, &notes, layout, Instant::now()))
}

#[tauri::command(async)]
pub fn add_sticky(
    state: State<'_, OpenVault>,
    board: String,
    text: String,
    at: Option<(i64, i64)>,
) -> Result<String, String> {
    state.run(|k| k.add_sticky(&HUMAN, &board, &text, at, Instant::now()))
}

#[tauri::command(async)]
pub fn connect_nodes(
    state: State<'_, OpenVault>,
    board: String,
    from: String,
    to: String,
    label: Option<String>,
) -> Result<String, String> {
    state.run(|k| k.connect(&HUMAN, &board, &from, &to, label.as_deref(), Instant::now()))
}

#[tauri::command(async)]
pub fn group_nodes(
    state: State<'_, OpenVault>,
    board: String,
    nodes: Vec<String>,
    label: String,
) -> Result<String, String> {
    state.run(|k| k.group_on_board(&HUMAN, &board, &nodes, &label, Instant::now()))
}

/// A person's edits on a board, as one batch: all or none.
#[tauri::command(async)]
pub fn board_apply(
    state: State<'_, OpenVault>,
    board: String,
    changes: Vec<BoardChange>,
) -> Result<BoardApplied, String> {
    state.run(|k| k.board_apply(&HUMAN, &board, &changes, Instant::now()))
}

/// The boards with a card for the note at `path`.
#[tauri::command(async)]
pub fn boards_with(state: State<'_, OpenVault>, path: String) -> Result<Vec<BoardInfo>, String> {
    state.run(|k| k.boards_with(&path))
}

/// Puts a trashed board back; returns where it went.
#[tauri::command(async)]
pub fn restore_board(state: State<'_, OpenVault>, trashed: String) -> Result<String, String> {
    state.run(|k| k.restore_board(&HUMAN, &trashed))
}
