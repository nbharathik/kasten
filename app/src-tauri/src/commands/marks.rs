//! Agent marks: the lines of a note an agent
//! wrote that you have not edited or accepted, which notes have any, and
//! accepting them. The core derives them from history; no file changes.

use kasten_core::history::Actor;
use kasten_core::{AgentMark, Instant};
use tauri::State;

use super::notes::OpenVault;

#[tauri::command(async)]
pub fn agent_marks(state: State<'_, OpenVault>, path: String) -> Result<Vec<AgentMark>, String> {
    state.run(|k| k.agent_marks(&path))
}

/// Which of these notes have agent marks, for badges on cards and rows.
#[tauri::command(async)]
pub fn agent_marked(
    state: State<'_, OpenVault>,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    state.run(|k| k.agent_marked(&paths))
}

/// You keep the agent's writing in a note as it stands: its marks go.
#[tauri::command(async)]
pub fn accept_agent_marks(state: State<'_, OpenVault>, path: String) -> Result<(), String> {
    state.run(|k| k.accept_agent_marks(&Actor::Human, &path, Instant::now()))
}
