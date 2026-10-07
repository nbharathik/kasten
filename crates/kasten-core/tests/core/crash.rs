//! Kill the writer mid-write in a loop:
//! no file may be corrupt, and the vault, its index and its history keep
//! working after every one of 100 kills.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::Duration;

use kasten_core::history::Actor;
use kasten_core::{Instant, Kasten, frontmatter, ulid_at};

const NOTES: usize = 5;
const END: &str = "END OF NOTE\n";
/// What the writer prints once it has opened the vault and starts writing.
const WRITING: &str = "kasten-crash: writing";

fn body(round: usize) -> String {
    let mut text = String::new();
    for line in 0..400 {
        text.push_str(&format!(
            "Round {round}, line {line}: some words to make the file long enough to take a while.\n"
        ));
    }
    text.push_str(END);
    text
}

#[test]
#[ignore = "a child process of survives_100_kills_mid_write"]
fn writer_child() {
    let Ok(vault) = std::env::var("KASTEN_TEST_VAULT") else {
        return;
    };
    let k = Kasten::open(&vault).unwrap();
    let generation: usize = std::env::var("KASTEN_TEST_GENERATION")
        .unwrap()
        .parse()
        .unwrap();
    let agent = Actor::Agent {
        client: "crash".into(),
        session: "crash".into(),
    };
    for round in 0..usize::MAX {
        let path = format!("inbox/note-{}.md", round % NOTES);
        let hash = k.read(&path).unwrap().hash;
        let actor = if round % 2 == 0 {
            &agent
        } else {
            &Actor::Human
        };
        k.save_body(
            actor,
            &path,
            &body(generation * 1_000_000 + round + 1),
            &hash,
            Instant::now(),
        )
        .unwrap();
        if round % 3 == 0 {
            k.commit_edits().unwrap();
        }
        // A completed first write proves the child made progress before
        // the parent starts its random kill window.
        if round == 0 {
            // With one test thread, libtest leaves its label on this line.
            // Put the protocol marker on a line of its own in either mode.
            println!("\n{WRITING}");
            std::io::stdout().flush().unwrap();
        }
    }
}

/// A tiny deterministic generator, so a failing run can be repeated.
fn next(seed: &mut u64) -> u64 {
    *seed = seed
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1_442_695_040_888_963_407);
    *seed >> 33
}

#[test]
fn survives_100_kills_mid_write() {
    let dir = std::env::temp_dir().join(format!("kasten-crash-{}", ulid_at(Instant::now().millis)));
    let k = Kasten::init(&dir, "Crash").unwrap();
    for i in 0..NOTES {
        let note = k
            .capture(
                &Actor::Human,
                &format!("Note {i}\n\n{}", body(0)),
                &[],
                Instant::now(),
            )
            .unwrap();
        fs::rename(
            dir.join(&note.meta.path),
            dir.join(format!("inbox/note-{i}.md")),
        )
        .unwrap();
    }
    k.commit_external().unwrap();
    drop(k);

    let mut seed = 7;
    for kill in 0..100 {
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "crash::writer_child", "--ignored", "--nocapture"])
            .env("KASTEN_TEST_VAULT", &dir)
            .env("KASTEN_TEST_GENERATION", kill.to_string())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        // Starting a process takes as long as the machine likes; wait until
        // the writer is writing, then catch it at a random point of it. The
        // window reaches past the 200 ms a writer waits before clearing a git
        // lock a killed one left, so history recovers instead of stalling.
        let mut output = BufReader::new(child.stdout.take().unwrap()).lines();
        let started = output.any(|line| line.is_ok_and(|line| line.trim() == WRITING));
        assert!(started, "kill {kill}: the writer never started");
        std::thread::sleep(Duration::from_millis(next(&mut seed) % 400));
        child.kill().unwrap();
        child.wait().unwrap();
        drop(output);

        for i in 0..NOTES {
            let text = fs::read_to_string(dir.join(format!("inbox/note-{i}.md")))
                .unwrap_or_else(|e| panic!("kill {kill}: note {i} unreadable: {e}"));
            assert!(
                text.ends_with(END),
                "kill {kill}: note {i} is cut short:\n{}",
                &text[text.len().saturating_sub(200)..]
            );
            assert!(
                frontmatter::split(&text).prefix.starts_with("---"),
                "kill {kill}: note {i} lost its frontmatter"
            );
        }
        let k = Kasten::open(&dir)
            .unwrap_or_else(|e| panic!("kill {kill}: the vault does not open: {e}"));
        assert!(
            k.log(None, 1).unwrap().len() == 1,
            "kill {kill}: history unreadable"
        );
        assert_eq!(
            k.search("round", 50).unwrap().len(),
            NOTES,
            "kill {kill}: index lost notes"
        );
    }
    let k = Kasten::open(&dir).unwrap();
    let commits = k.log(None, 100_000).unwrap().len();
    assert!(
        commits > 100,
        "the writer barely ran before each kill ({commits} commits)"
    );
    let report = k.verify().unwrap();
    assert!(
        report.problems.iter().all(|p| p.kind != "git"),
        "{:?}",
        report.problems
    );
    // Everything written is still committable afterwards.
    k.commit_edits().unwrap();
    k.commit_external().unwrap();
    assert!(k.dirty().unwrap().is_empty(), "{:?}", k.dirty().unwrap());
    drop(k);
    let _ = fs::remove_dir_all(&dir);
}
