//! Agent sessions and review from the command line: list sessions, undo
//! one, list proposals, accept or reject them, trust a session for an hour,
//! and turn on history.

use kasten_core::Instant;
use serde_json::json;

use crate::args::Args;
use crate::commands::{Outcome, json_text, open, when};
use crate::show::{say, say_err};

/// Who is deciding: `--by`, else the login name.
fn who(args: &Args) -> String {
    args.value("--by")
        .map(str::to_owned)
        .or_else(|| std::env::var("USER").ok())
        .or_else(|| std::env::var("USERNAME").ok())
        .unwrap_or_else(|| "you".to_owned())
}

fn arg<'a>(args: &'a Args, what: &str) -> Result<&'a str, String> {
    args.positional
        .get(1)
        .map(String::as_str)
        .ok_or_else(|| format!("Which {what}? Pass its id"))
}

/// `kasten start-history`: git history for a vault that has none.
pub fn start_history(args: &Args) -> Outcome {
    let kasten = open(args)?;
    if kasten.has_history() {
        say!("History is already on.");
        return Ok(0);
    }
    kasten.start_history().map_err(|e| e.to_string())?;
    say!(
        "History is on: every change is now a commit in {}.",
        kasten.root().display()
    );
    Ok(0)
}

/// `kasten sessions [--limit N]`
pub fn sessions(args: &Args) -> Outcome {
    let kasten = open(args)?;
    let sessions = kasten
        .sessions(args.number("--limit", 20)?)
        .map_err(|e| e.to_string())?;
    if args.has("--json") {
        say!("{}", json_text(json!(sessions)));
        return Ok(0);
    }
    if sessions.is_empty() {
        say!("No agent sessions yet.");
    }
    for s in sessions {
        say!(
            "{}  {:<16} {} to {}  {} commit{}{}",
            s.id,
            s.client,
            when(s.started),
            &when(s.last)[11..],
            s.commits,
            if s.commits == 1 { "" } else { "s" },
            if s.undone { "  (undone)" } else { "" }
        );
    }
    Ok(0)
}

/// `kasten undo-session SESSION`
pub fn undo_session(args: &Args) -> Outcome {
    let session = arg(args, "session")?;
    let kasten = open(args)?;
    let undone = kasten
        .undo_session(session, Instant::now())
        .map_err(|e| e.to_string())?;
    if args.has("--json") {
        say!("{}", json_text(json!(undone)));
    } else {
        say!(
            "Undid {} commit(s) of session {session}.",
            undone.reverted.len()
        );
    }
    match undone.conflict {
        Some(c) => {
            say_err!(
                "Stopped at “{}”: {} ({}). Your later edit was kept; resolve it and run undo-session again.",
                c.summary,
                c.path,
                c.detail
            );
            Ok(1)
        }
        None => Ok(0),
    }
}

/// `kasten proposals`: those waiting for review.
pub fn proposals(args: &Args) -> Outcome {
    let kasten = open(args)?;
    let waiting = kasten.proposals().map_err(|e| e.to_string())?;
    if args.has("--json") {
        say!("{}", json_text(json!(waiting)));
        return Ok(0);
    }
    if waiting.is_empty() {
        say!("Nothing waiting for review.");
    }
    for p in waiting {
        say!(
            "{}  {} by {}\n    {}",
            p.id,
            p.summary(),
            p.client,
            p.reason
        );
        if args.has("--diff") {
            say!("{}", p.diff);
        }
    }
    Ok(0)
}

/// `kasten accept PROPOSAL [--by NAME]`
pub fn accept(args: &Args) -> Outcome {
    let id = arg(args, "proposal")?;
    let kasten = open(args)?;
    kasten
        .accept_proposal(id, &who(args), Instant::now())
        .map_err(|e| e.to_string())?;
    say!("Accepted {id}.");
    Ok(0)
}

/// `kasten reject PROPOSAL [--by NAME]`
pub fn reject(args: &Args) -> Outcome {
    let id = arg(args, "proposal")?;
    let kasten = open(args)?;
    kasten
        .reject_proposal(id, &who(args), Instant::now())
        .map_err(|e| e.to_string())?;
    say!("Rejected {id}; it stays in .kasten/proposals/archive/.");
    Ok(0)
}

/// `kasten trust SESSION [--minutes 60]`: lifts the soft limits for a while.
pub fn trust(args: &Args) -> Outcome {
    let session = arg(args, "session")?;
    let minutes = args.number("--minutes", 60)?.min(24 * 60) as u64;
    let kasten = open(args)?;
    kasten
        .trust_session(session, Instant::now().millis + minutes * 60_000)
        .map_err(|e| e.to_string())?;
    say!("Session {session} is trusted for {minutes} minutes; refusals still apply.");
    Ok(0)
}
