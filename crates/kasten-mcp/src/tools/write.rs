//! The write tools. Each becomes an agent op that
//! the core refuses, runs or keeps for review; results carry the session id
//! so its changes can be undone together.

use kasten_core::agent::{AgentOp, Session};
use kasten_core::frontmatter::split;
use kasten_core::{Instant, Kasten, Result};
use serde_json::{Value, json};

use super::today;
use crate::params::*;

/// Builds the op (resolving the notes it names) and runs it through the
/// guardrails as `session`: the outcome, with the session's id.
pub(crate) fn agent(
    k: &Kasten,
    session: &Session,
    build: impl FnOnce(&Kasten) -> Result<AgentOp>,
) -> Result<Value> {
    let op = build(k)?;
    let outcome = k.agent_run(session, &op, Instant::now())?;
    let mut out = serde_json::to_value(outcome).unwrap_or_default();
    out["session"] = json!(session.id);
    Ok(out)
}

pub(crate) fn capture(_: &Kasten, a: CaptureArgs) -> Result<AgentOp> {
    Ok(AgentOp::Capture {
        markdown: a.markdown,
        tags: a.tags,
    })
}

pub(crate) fn create_note(k: &Kasten, a: CreateNoteArgs) -> Result<AgentOp> {
    let parent = a.parent.map(|p| k.resolve(&p)).transpose()?;
    Ok(AgentOp::CreateNote {
        note_type: a.note_type,
        title: a.title,
        body: a.body,
        project: a.project,
        tags: a.tags,
        props: a.props,
        parent,
        template: a.template,
    })
}

pub(crate) fn append(k: &Kasten, a: AppendArgs) -> Result<AgentOp> {
    Ok(AgentOp::Append {
        path: k.resolve(&a.note)?,
        markdown: a.markdown,
        heading: a.under_heading,
    })
}

pub(crate) fn replace_section(k: &Kasten, a: ReplaceSectionArgs) -> Result<AgentOp> {
    Ok(AgentOp::ReplaceSection {
        path: k.resolve(&a.note)?,
        heading: a.heading,
        markdown: a.markdown,
    })
}

pub(crate) fn update_props(k: &Kasten, a: UpdatePropsArgs) -> Result<AgentOp> {
    Ok(AgentOp::UpdateProps {
        path: k.resolve(&a.note)?,
        props: a.props,
    })
}

pub(crate) fn add_tags(k: &Kasten, a: TagsArgs) -> Result<AgentOp> {
    Ok(AgentOp::Tags {
        path: k.resolve(&a.note)?,
        add: a.tags,
        remove: vec![],
    })
}

pub(crate) fn remove_tags(k: &Kasten, a: TagsArgs) -> Result<AgentOp> {
    Ok(AgentOp::Tags {
        path: k.resolve(&a.note)?,
        add: vec![],
        remove: a.tags,
    })
}

pub(crate) fn rename_note(k: &Kasten, a: RenameArgs) -> Result<AgentOp> {
    Ok(AgentOp::Rename {
        path: k.resolve(&a.note)?,
        title: a.title,
    })
}

pub(crate) fn move_note(k: &Kasten, a: MoveArgs) -> Result<AgentOp> {
    Ok(AgentOp::Move {
        path: k.resolve(&a.note)?,
        project: a.project,
    })
}

pub(crate) fn journal_append(_: &Kasten, a: JournalAppendArgs) -> Result<AgentOp> {
    Ok(AgentOp::JournalAppend {
        date: a.date.unwrap_or_else(today),
        markdown: a.markdown,
        heading: a.under_heading,
    })
}

pub(crate) fn trash_note(k: &Kasten, a: TrashArgs) -> Result<AgentOp> {
    Ok(AgentOp::Trash {
        path: k.resolve(&a.note)?,
        reason: a.reason,
    })
}

/// A full rewrite, written against the body as it is now, so accepting it
/// later merges with edits made meanwhile.
pub(crate) fn propose_edit(k: &Kasten, a: ProposeEditArgs) -> Result<AgentOp> {
    let path = k.resolve(&a.note)?;
    let base = split(&k.read(&path)?.text).body.to_owned();
    Ok(AgentOp::Edit {
        path,
        body: a.new_body,
        base,
        reason: a.reason,
    })
}

pub(crate) fn update_tag_schema(_: &Kasten, a: TagSchemaArgs) -> Result<AgentOp> {
    Ok(AgentOp::TagSchema {
        tag: a.tag,
        schema: a.schema,
    })
}
