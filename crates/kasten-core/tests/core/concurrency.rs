//! The app and the MCP server writing at once lose no updates. Two
//! processes append to the same note through the engine.

use std::fs;
use std::process::Command;

use kasten_core::history::Actor;
use kasten_core::{Instant, Kasten, ulid_at};

const LINES: usize = 40;

#[test]
#[ignore = "a child process of two_processes_writing_at_once_lose_nothing"]
fn appender_child() {
    let (Ok(vault), Ok(who)) = (
        std::env::var("KASTEN_TEST_VAULT"),
        std::env::var("KASTEN_TEST_WHO"),
    ) else {
        return;
    };
    let k = Kasten::open(&vault).unwrap();
    let actor = Actor::Agent {
        client: who.clone(),
        session: who.clone(),
    };
    for i in 0..LINES {
        k.append(
            &actor,
            "inbox/shared.md",
            &format!("- {who} line {i}"),
            None,
            Instant::now(),
        )
        .unwrap();
    }
}

#[test]
fn two_processes_writing_at_once_lose_nothing() {
    let dir = std::env::temp_dir().join(format!(
        "kasten-concurrency-{}",
        ulid_at(Instant::now().millis)
    ));
    let k = Kasten::init(&dir, "Concurrency").unwrap();
    let shared = k
        .capture(&Actor::Human, "Shared", &[], Instant::now())
        .unwrap();
    assert_eq!(shared.meta.path, "inbox/shared.md");
    drop(k);

    let children: Vec<_> = ["app", "mcp"]
        .iter()
        .map(|who| {
            Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "concurrency::appender_child",
                    "--ignored",
                    "--nocapture",
                ])
                .env("KASTEN_TEST_VAULT", &dir)
                .env("KASTEN_TEST_WHO", who)
                .spawn()
                .unwrap()
        })
        .collect();
    for mut child in children {
        assert!(child.wait().unwrap().success());
    }

    let text = fs::read_to_string(dir.join("inbox/shared.md")).unwrap();
    for who in ["app", "mcp"] {
        for i in 0..LINES {
            assert!(
                text.contains(&format!("- {who} line {i}\n")),
                "lost {who} {i}:\n{text}"
            );
        }
    }
    let k = Kasten::open(&dir).unwrap();
    assert!(k.dirty().unwrap().is_empty(), "{:?}", k.dirty().unwrap());
    assert_eq!(
        k.log(Some("inbox/shared.md"), 1000).unwrap().len(),
        2 * LINES + 1
    );
    drop(k);
    let _ = fs::remove_dir_all(&dir);
}
