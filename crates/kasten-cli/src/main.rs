//! `kasten`: command-line shell over kasten-core.

mod agents;
mod args;
mod backup;
mod commands;
mod import;
mod show;

use std::process::ExitCode;

use args::Args;
use show::{say, say_err};

const COMMANDS: &[(&str, &str)] = &[
    (
        "init",
        "create a vault, or finish one: kasten init [DIR] [--name NAME]",
    ),
    (
        "capture",
        "add a card to the inbox: kasten capture TEXT [--tags a,b]",
    ),
    (
        "search",
        "full-text search: kasten search QUERY [--limit N]",
    ),
    (
        "verify",
        "check vault integrity, and the backup remote with --remote; exits 1 on problems",
    ),
    ("history", "show commits: kasten history [NOTE] [--limit N]"),
    (
        "restore",
        "kasten restore NOTE COMMIT, or --vault-wide COMMIT",
    ),
    (
        "import",
        "move notes in: kasten import FOLDER [--kind K] [--project TITLE] [--dry-run]",
    ),
    (
        "undo",
        "revert one commit, such as an import: kasten undo COMMIT",
    ),
    ("reindex", "rebuild the search index from the files"),
    (
        "start-history",
        "keep git history for a vault that has none",
    ),
    (
        "sessions",
        "list agent sessions: kasten sessions [--limit N]",
    ),
    (
        "undo-session",
        "revert an agent session as new commits: kasten undo-session ID",
    ),
    ("proposals", "agent changes waiting for review [--diff]"),
    ("accept", "apply a proposal: kasten accept ID [--by NAME]"),
    ("reject", "decline a proposal: kasten reject ID [--by NAME]"),
    (
        "trust",
        "lift a session's soft limits: kasten trust ID [--minutes 60]",
    ),
    (
        "backup-file",
        "write a backup file of the whole vault: kasten backup-file FOLDER",
    ),
    (
        "clone-backup",
        "restore a backup file or git remote: kasten clone-backup SOURCE DIR",
    ),
    (
        "get-latest",
        "take in another computer's backed-up changes [--from FILE]",
    ),
];

fn usage() -> String {
    let mut text = format!(
        "kasten {}\n\nUsage: kasten <command> [options]\n\nCommands:\n",
        kasten_core::VERSION
    );
    for (name, about) in COMMANDS {
        text.push_str(&format!("  {name:<13} {about}\n"));
    }
    text.push_str("\nOptions:\n  --vault DIR    the vault (else KASTEN_VAULT, else the current folder)\n  --json         print JSON\n  -h, --help     print this help\n  -V, --version  print the version\n");
    text
}

fn main() -> ExitCode {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    if matches!(raw.first().map(String::as_str), Some("-V" | "--version")) {
        say!("kasten {}", kasten_core::VERSION);
        return ExitCode::SUCCESS;
    }
    let args = match Args::parse(raw) {
        Ok(args) => args,
        Err(why) => {
            say_err!("kasten: {why}");
            return ExitCode::from(2);
        }
    };
    let command = args.positional.first().map(String::as_str);
    if command.is_none() || matches!(command, Some("help")) || args.has("--help") || args.has("-h")
    {
        print!("{}", usage());
        return ExitCode::SUCCESS;
    }
    let outcome = match command.unwrap_or_default() {
        "init" => commands::init(&args),
        "capture" => commands::capture(&args),
        "search" => commands::search(&args),
        "verify" => commands::verify(&args),
        "history" => commands::history(&args),
        "restore" => commands::restore(&args),
        "import" => import::import(&args),
        "undo" => import::undo(&args),
        "reindex" => commands::reindex(&args),
        "start-history" => agents::start_history(&args),
        "sessions" => agents::sessions(&args),
        "undo-session" => agents::undo_session(&args),
        "proposals" => agents::proposals(&args),
        "accept" => agents::accept(&args),
        "reject" => agents::reject(&args),
        "trust" => agents::trust(&args),
        "backup-file" => backup::backup_file(&args),
        "clone-backup" => backup::clone(&args),
        "get-latest" => backup::get_latest(&args),
        "dev-generate" => commands::generate(&args),
        other => {
            say_err!("kasten: unknown command '{other}'\n\n{}", usage());
            return ExitCode::from(2);
        }
    };
    match outcome {
        Ok(code) => ExitCode::from(code as u8),
        Err(why) => {
            say_err!("kasten: {why}");
            ExitCode::from(1)
        }
    }
}
