//! Blame over a note's versions, newest first: each line of the newest body
//! is followed back through the versions until the change that brought it
//! in, and that change's writer is the line's. On the way, a person's change
//! reviews the older lines of every paragraph it touches.

use super::{AgentMark, Stamp, runs, touched};
use crate::diff::kept_lines;

/// Who wrote a line, as far as marks care.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Writer {
    /// Older than anything looked at, accepted, or a person's.
    Settled,
    /// An agent, with the index of its stamp.
    Agent(usize),
}

pub(crate) struct Blame {
    /// The newest body's lines.
    lines: Vec<String>,
    /// Where each of them is in the body compared next; None once found.
    at: Vec<Option<usize>>,
    writers: Vec<Writer>,
    /// A person changed the line's paragraph after the line was written.
    reviewed: Vec<bool>,
    stamps: Vec<Stamp>,
    /// The body compared next: the one before the last change looked at.
    current: String,
}

impl Blame {
    /// Starts from the newest body.
    pub fn new(body: &str) -> Blame {
        let lines: Vec<String> = body.lines().map(str::to_owned).collect();
        let n = lines.len();
        Blame {
            lines,
            at: (0..n).map(Some).collect(),
            writers: vec![Writer::Settled; n],
            reviewed: vec![false; n],
            stamps: Vec::new(),
            current: body.to_owned(),
        }
    }

    /// Whether every line has been traced to its writer.
    pub fn done(&self) -> bool {
        self.at.iter().all(Option::is_none)
    }

    /// The next change back: it made the body seen last out of `before`
    /// (None when it made the note). `stamp` is Some for an agent's commit,
    /// None for a person's.
    pub fn step(&mut self, stamp: Option<Stamp>, before: Option<&str>) {
        let before = before.unwrap_or("");
        let now: Vec<&str> = self.current.lines().collect();
        let then: Vec<&str> = before.lines().collect();
        let kept = kept_lines(&now, &then);
        let review = match stamp {
            Some(_) => Vec::new(),
            None => touched(&now, &then, &kept),
        };
        let writer = match stamp {
            Some(stamp) => {
                self.stamps.push(stamp);
                Writer::Agent(self.stamps.len() - 1)
            }
            None => Writer::Settled,
        };
        for ((at, slot), reviewed) in self
            .at
            .iter_mut()
            .zip(self.writers.iter_mut())
            .zip(self.reviewed.iter_mut())
        {
            let Some(i) = *at else { continue };
            *reviewed |= review.get(i).copied().unwrap_or(false);
            *at = kept[i];
            if at.is_none() {
                *slot = writer;
            }
        }
        self.current = before.to_owned();
    }

    /// The lines not traced yet are as `marks` say: the cached marks of the
    /// body compared next.
    pub fn known(&mut self, marks: &[AgentMark]) {
        let first = self.stamps.len();
        self.stamps.extend(marks.iter().map(Stamp::of));
        for (at, slot) in self.at.iter_mut().zip(self.writers.iter_mut()) {
            let Some(i) = at.take() else { continue };
            if let Some(m) = marks.iter().position(|m| m.start <= i && i < m.end) {
                *slot = Writer::Agent(first + m);
            }
        }
    }

    /// The agent lines no person has reviewed, in runs of one commit.
    pub fn marks(&self) -> Vec<AgentMark> {
        let lines: Vec<&str> = self.lines.iter().map(String::as_str).collect();
        let stamps: Vec<Option<&Stamp>> = self
            .writers
            .iter()
            .zip(&self.reviewed)
            .map(|(writer, reviewed)| match writer {
                Writer::Agent(s) if !reviewed => Some(&self.stamps[*s]),
                _ => None,
            })
            .collect();
        runs(&lines, &stamps)
    }
}
