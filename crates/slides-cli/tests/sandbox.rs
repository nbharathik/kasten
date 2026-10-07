//! The browser that draws slides runs in its sandbox unless a person switches that off on purpose
//! (`SLIDES_RENDER_NO_SANDBOX=1`), through the binary, as a shell would start it. A stand-in for the browser (a
//! script that writes down how it was started) is used, so that these tests need no real browser and can tell
//! whether one was started at all.

#![cfg(unix)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const NO_SANDBOX: &str = "SLIDES_RENDER_NO_SANDBOX";

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

fn deck(name: &str) -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/decks")
        .join(name)
        .display()
        .to_string()
}

fn temp(name: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("slides-cli-sandbox-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

/// A "browser" that writes the arguments it was started with on a line of a log, and stops.
fn stand_in(dir: &Path) -> (PathBuf, PathBuf) {
    let log = dir.join("launches.log");
    let program = dir.join("fake-chromium");
    fs::write(
        &program,
        format!("#!/bin/sh\necho \"$@\" >> '{}'\nexit 1\n", log.display()),
    )
    .unwrap_or_else(|e| panic!("{e}"));
    fs::set_permissions(&program, fs::Permissions::from_mode(0o755))
        .unwrap_or_else(|e| panic!("{e}"));
    (program, log)
}

fn launches(log: &Path) -> Vec<String> {
    fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .map(str::to_owned)
        .collect()
}

/// `slides ...` with the stand-in as the browser and the sandbox setting as given (`None`: not set at all).
fn slides(args: &[&str], browser: &Path, setting: Option<&str>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_slides"));
    command
        .args(args)
        .env("CHROMIUM_PATH", browser)
        .env_remove(NO_SANDBOX);
    if let Some(value) = setting {
        command.env(NO_SANDBOX, value);
    }
    command
        .output()
        .unwrap_or_else(|e| panic!("the slides binary runs: {e}"))
}

/// Whether this build carries the page that slides are drawn with; without it the browser is never reached.
fn has_page() -> bool {
    let has = slides_render::bundle::Page::locate().is_some();
    if !has {
        eprintln!("SKIPPED: no render page is built in");
    }
    has
}

#[test]
fn as_the_administrator_no_browser_is_started_without_the_setting_and_the_setting_is_named() {
    if !slides_render::private::running_as_root() {
        eprintln!("SKIPPED: not the administrator here, the only one the browser is refused for");
        return;
    }
    if !has_page() {
        return;
    }
    let dir = temp("root");
    let (browser, log) = stand_in(&dir);
    let png = dir.join("out.png");
    let out = slides(
        &[
            "render",
            &deck("minimal.deck"),
            "-o",
            png.to_str().unwrap_or_default(),
        ],
        &browser,
        None,
    );
    assert_eq!(out.status.code(), Some(1), "{}", text(&out.stderr));
    let message = text(&out.stderr);
    assert!(
        message.contains("administrator (root)") && message.contains("SLIDES_RENDER_NO_SANDBOX=1"),
        "the reason and the setting are named: {message}"
    );
    assert!(
        !message.contains("is set, so the browser"),
        "nothing is switched off: {message}"
    );
    assert!(
        launches(&log).is_empty(),
        "the browser was not started, with the sandbox or without it"
    );
    assert!(!png.exists(), "nothing was written");

    // The other drawn commands say the same, and lint, which can do without a browser, says why it did.
    let out = slides(
        &[
            "export",
            &deck("minimal.deck"),
            "-o",
            dir.join("out.pdf").to_str().unwrap_or_default(),
        ],
        &browser,
        None,
    );
    assert_eq!(out.status.code(), Some(1));
    assert!(
        text(&out.stderr).contains("SLIDES_RENDER_NO_SANDBOX=1"),
        "{}",
        text(&out.stderr)
    );
    let out = slides(
        &["lint", &deck("text-heavy.deck"), "--json"],
        &browser,
        None,
    );
    let json: serde_json::Value = serde_json::from_slice(&out.stdout)
        .unwrap_or_else(|e| panic!("{e}: {}", text(&out.stdout)));
    assert_eq!(json["measuredWith"], "estimate");
    let note = json["note"].as_str().unwrap_or_default();
    assert!(
        note.contains("administrator (root)")
            && note.contains("SLIDES_RENDER_NO_SANDBOX=1")
            && !note.contains("Install Chrome"),
        "{note}"
    );
    assert!(launches(&log).is_empty());

    // Told to, it starts the browser without the sandbox: once, and with a line that says so.
    let out = slides(
        &[
            "render",
            &deck("minimal.deck"),
            "-o",
            png.to_str().unwrap_or_default(),
        ],
        &browser,
        Some("1"),
    );
    let message = text(&out.stderr);
    assert!(!message.contains("administrator (root)"), "{message}");
    let started = launches(&log);
    assert_eq!(started.len(), 1, "{started:?}");
    assert!(started[0].contains("--no-sandbox"), "{started:?}");
}

#[test]
fn with_the_setting_the_browser_runs_without_its_sandbox_and_one_line_says_so() {
    if !has_page() {
        return;
    }
    let dir = temp("switched-off");
    let (browser, log) = stand_in(&dir);
    let out = slides(
        &[
            "render",
            &deck("minimal.deck"),
            "-o",
            dir.join("out.png").to_str().unwrap_or_default(),
        ],
        &browser,
        Some("1"),
    );
    let message = text(&out.stderr);
    // The stand-in stops at once, so nothing is drawn; what is looked at is how it was started, and what was said.
    assert_eq!(out.status.code(), Some(1), "{message}");
    let said = message
        .lines()
        .filter(|l| l.contains("SLIDES_RENDER_NO_SANDBOX is set"))
        .count();
    assert_eq!(said, 1, "one warning line: {message}");
    assert!(message.contains("without its sandbox"), "{message}");
    let started = launches(&log);
    assert_eq!(
        started.len(),
        1,
        "never started twice, not even to try again: {started:?}"
    );
    assert!(started[0].contains("--no-sandbox"), "{started:?}");
    assert!(!dir.join("out.png").exists());

    // A setting that is not exactly 1 is not the setting.
    let other = temp("not-one");
    let (browser, log) = stand_in(&other);
    let unused = other.join("unused.png");
    for value in ["0", "", "yes", "true"] {
        let out = slides(
            &[
                "render",
                &deck("minimal.deck"),
                "-o",
                unused.to_str().unwrap_or_default(),
            ],
            &browser,
            Some(value),
        );
        assert!(
            !text(&out.stderr).contains("SLIDES_RENDER_NO_SANDBOX is set"),
            "{value:?}: {}",
            text(&out.stderr)
        );
    }
    if !slides_render::private::running_as_root() {
        // Where the sandbox can be tried, it is what the browser is started with.
        assert!(
            launches(&log)
                .iter()
                .all(|line| !line.contains("--no-sandbox")),
            "{:?}",
            launches(&log)
        );
    }
}
