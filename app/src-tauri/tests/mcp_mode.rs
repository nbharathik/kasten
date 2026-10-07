//! `kasten-app --mcp ...` serves MCP with no window, so an installed app is
//! all an agent needs (the settings show the command).

use std::process::Command;

#[test]
fn serves_mcp_instead_of_opening_a_window() {
    let out = Command::new(env!("CARGO_BIN_EXE_kasten-app"))
        .args(["--mcp", "--version"])
        .output()
        .unwrap();
    assert!(out.status.success(), "{out:?}");
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(text.starts_with("kasten-mcp "), "{text}");

    // A mistake is reported like kasten-mcp's own, without a window.
    let out = Command::new(env!("CARGO_BIN_EXE_kasten-app"))
        .args(["--mcp", "--nonsense"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("Unknown argument --nonsense"));
}
