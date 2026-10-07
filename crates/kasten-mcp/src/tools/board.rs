//! The whiteboard tools: read_board, create_board,
//! add_to_board, connect and group_on_board, plus list_boards.

use kasten_core::agent::AgentOp;
use kasten_core::{Kasten, Result};
use serde_json::Value;

use super::as_json;
use crate::params::*;

pub(crate) fn list_boards(k: &Kasten) -> Result<Value> {
    as_json(k.boards()?)
}

pub(crate) fn read_board(k: &Kasten, a: BoardArgs) -> Result<Value> {
    let path = k.resolve_board(&a.board)?;
    let mut board = as_json(k.board(&path)?)?;
    // A drawing's line is thousands of numbers that tell an agent nothing:
    // it gets how many there are.
    if let Some(nodes) = board.get_mut("nodes").and_then(Value::as_array_mut) {
        for draw in nodes.iter_mut().filter_map(|n| n.get_mut("draw")) {
            let count = draw["points"]
                .as_str()
                .map_or(0, |p| p.split_whitespace().count());
            draw["points"] = count.into();
        }
    }
    Ok(board)
}

pub(crate) fn create_board(_: &Kasten, a: CreateBoardArgs) -> Result<AgentOp> {
    Ok(AgentOp::CreateBoard {
        title: a.title,
        project: a.project,
    })
}

pub(crate) fn add_to_board(k: &Kasten, a: AddToBoardArgs) -> Result<AgentOp> {
    let board = k.resolve_board(&a.board)?;
    let notes = a
        .notes
        .iter()
        .map(|n| k.resolve(n))
        .collect::<Result<Vec<_>>>()?;
    Ok(AgentOp::AddToBoard {
        board,
        notes,
        layout: a.layout,
        positions: a.positions,
    })
}

pub(crate) fn connect(k: &Kasten, a: ConnectArgs) -> Result<AgentOp> {
    Ok(AgentOp::Connect {
        board: k.resolve_board(&a.board)?,
        from: a.from,
        to: a.to,
        label: a.label,
    })
}

pub(crate) fn group_on_board(k: &Kasten, a: GroupArgs) -> Result<AgentOp> {
    Ok(AgentOp::Group {
        board: k.resolve_board(&a.board)?,
        nodes: a.nodes,
        label: a.title,
    })
}
