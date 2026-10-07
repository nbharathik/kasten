//! Agent marks: the lines of a note an agent
//! wrote that no person has edited or accepted since. They come from blaming
//! the note's history (blame.rs), are cached in the index, and never enter
//! the note.
//!
//! A person's change counts for every paragraph it touches (a run of
//! non-blank lines that gained or lost a line), as the editor counts an
//! edited block: ticking one item of an agent's list unmarks the list. An
//! agent's line added to a person's paragraph came after the person's
//! change, so it stays marked until the paragraph is changed again.

mod blame;
#[cfg(test)]
mod tests;

pub(crate) use blame::Blame;

use serde::{Deserialize, Serialize};

/// Lines of a note's body one agent commit wrote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMark {
    /// The first line, counted from 0 in the body (the text after the
    /// frontmatter), as links, headings and tasks are.
    pub start: usize,
    /// The line after the last.
    pub end: usize,
    pub session: String,
    /// The agent's client, such as `claude-code`.
    pub client: String,
    /// The commit that wrote the lines.
    pub commit: String,
    /// When, in milliseconds since the Unix epoch.
    pub time: u64,
}

/// The agent commit a line comes from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Stamp {
    pub session: String,
    pub client: String,
    pub commit: String,
    pub time: u64,
}

impl Stamp {
    fn of(mark: &AgentMark) -> Stamp {
        Stamp {
            session: mark.session.clone(),
            client: mark.client.clone(),
            commit: mark.commit.clone(),
            time: mark.time,
        }
    }

    fn mark(&self, line: usize) -> AgentMark {
        AgentMark {
            start: line,
            end: line + 1,
            session: self.session.clone(),
            client: self.client.clone(),
            commit: self.commit.clone(),
            time: self.time,
        }
    }
}

/// `marks` of the note as committed, carried onto the note as it is on
/// disk: the typing between the two is a person's change like any other.
pub(crate) fn carry(marks: &[AgentMark], committed: &str, working: &str) -> Vec<AgentMark> {
    let mut blame = Blame::new(working);
    blame.step(None, Some(committed));
    blame.known(marks);
    blame.marks()
}

fn blank(line: &str) -> bool {
    line.trim().is_empty()
}

/// Each line's paragraph (a run of non-blank lines), numbered from 0;
/// None for blank lines.
fn paragraphs(lines: &[&str]) -> (Vec<Option<usize>>, usize) {
    let mut out = Vec::with_capacity(lines.len());
    let mut count = 0;
    let mut open = false;
    for line in lines {
        if blank(line) {
            open = false;
            out.push(None);
        } else {
            if !open {
                count += 1;
                open = true;
            }
            out.push(Some(count - 1));
        }
    }
    (out, count)
}

/// The lines of `now` in a paragraph that a change from `then` touched: one
/// that gained a line, or whose lines in `then` lost one. `kept` maps `now`'s
/// lines to `then`'s.
fn touched(now: &[&str], then: &[&str], kept: &[Option<usize>]) -> Vec<bool> {
    let (para_now, count_now) = paragraphs(now);
    let (para_then, count_then) = paragraphs(then);
    let mut hit = vec![false; count_now];
    let mut from: Vec<Option<usize>> = vec![None; then.len()];
    for (i, k) in kept.iter().enumerate() {
        match (k, para_now[i]) {
            (Some(j), _) => from[*j] = Some(i),
            (None, Some(p)) => hit[p] = true,
            (None, None) => {}
        }
    }
    let mut lost = vec![false; count_then];
    for (j, para) in para_then.iter().enumerate() {
        if let (Some(p), None) = (para, from[j]) {
            lost[*p] = true;
        }
    }
    for (j, para) in para_then.iter().enumerate() {
        if let (Some(p), Some(i)) = (para, from[j])
            && lost[*p]
            && let Some(q) = para_now[i]
        {
            hit[q] = true;
        }
    }
    para_now.iter().map(|p| p.is_some_and(|p| hit[p])).collect()
}

/// Marks from each line's agent stamp (None for a person's or a settled
/// line), in runs of one commit. Blank lines never start or end a run, and
/// do not split one.
fn runs(lines: &[&str], stamps: &[Option<&Stamp>]) -> Vec<AgentMark> {
    let mut out: Vec<AgentMark> = Vec::new();
    let mut open = false;
    for (k, line) in lines.iter().enumerate() {
        if blank(line) {
            continue;
        }
        match (stamps[k], out.last_mut()) {
            (Some(s), Some(last)) if open && last.commit == s.commit => last.end = k + 1,
            (Some(s), _) => {
                out.push(s.mark(k));
                open = true;
            }
            (None, _) => open = false,
        }
    }
    out
}
