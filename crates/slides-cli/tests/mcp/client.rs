//! A scripted MCP client: newline-delimited JSON-RPC to `slides mcp`.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{Receiver, channel};
use std::thread;
use std::time::Duration;

use serde_json::{Value, json};

/// A real PNG, 3 by 2 pixels.
pub const PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0x12, 0x16, 0xf1,
    0x4d, 0x00, 0x00, 0x00, 0x15, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x94, 0xab, 0x38, 0xc1,
    0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc4, 0x00, 0x03, 0x00, 0x18, 0x2e, 0x01, 0x62, 0x87, 0x96,
    0x3e, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

pub const OUTLINE: &str = "# Tool use\n\n## Why tools?\n- Models know what they were trained on\n- A tool reaches what they cannot know\n\n## Two views\n- The model asks\n- The host runs it\n";

pub fn folder(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-mcp-test-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

pub fn slides(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_slides"))
        .args(args)
        .output()
        .expect("the slides binary runs")
}

/// What a tool said: whether it was an error, its text, and the kinds of the pictures it sent.
pub struct Answer {
    pub is_error: bool,
    pub text: String,
    pub images: Vec<String>,
}

impl Answer {
    pub fn json(&self) -> Value {
        serde_json::from_str(&self.text).unwrap_or_else(|e| panic!("not JSON ({e}): {}", self.text))
    }
}

/// A scripted MCP client: newline-delimited JSON-RPC to `slides mcp`.
pub struct Client {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Receiver<String>,
    next: u64,
    /// The answer to `initialize`.
    pub init: Value,
}

impl Drop for Client {
    /// Hangs up, as a client that is done does, and gives the server time to let go of what it started (a browser);
    /// one that does not leave is stopped.
    fn drop(&mut self) {
        self.stdin.take();
        if self.wait_for_exit(Duration::from_secs(15)).is_none() {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

impl Client {
    pub fn start(folder: &Path) -> Client {
        let mut command = Command::new(env!("CARGO_BIN_EXE_slides"));
        command
            .args(["mcp", "--folder", folder.to_str().unwrap()])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        // The browser that draws slides will not start as the administrator with its sandbox on; a
        // container that runs the tests as one is itself the boundary. Anyone else keeps the sandbox.
        if slides_render::private::running_as_root() {
            command.env("SLIDES_RENDER_NO_SANDBOX", "1");
        }
        let mut child = command.spawn().expect("slides mcp starts");
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        let (send, lines) = channel();
        // A server that stops answering fails the test instead of hanging it.
        thread::spawn(move || {
            for line in stdout.lines().map_while(Result::ok) {
                if send.send(line).is_err() {
                    break;
                }
            }
        });
        let mut client = Client {
            child,
            stdin: Some(stdin),
            lines,
            next: 1,
            init: Value::Null,
        };
        client.init = client.request(
            "initialize",
            json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "test", "version": "1.0" } }),
        );
        client.send(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
        client
    }

    fn send(&mut self, message: &Value) {
        let stdin = self.stdin.as_mut().expect("the client is still connected");
        writeln!(stdin, "{message}").unwrap();
        stdin.flush().unwrap();
    }

    /// A request's result, or its error object.
    pub fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next;
        self.next += 1;
        self.send(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        loop {
            let line = self
                .lines
                .recv_timeout(Duration::from_secs(60))
                .expect("the server answers");
            let message: Value = serde_json::from_str(&line).unwrap();
            if message["id"] == json!(id) {
                return message
                    .get("error")
                    .or_else(|| message.get("result"))
                    .cloned()
                    .unwrap();
            }
        }
    }

    pub fn call(&mut self, tool: &str, arguments: Value) -> Answer {
        let result = self.request(
            "tools/call",
            json!({ "name": tool, "arguments": arguments }),
        );
        let blocks = result["content"].as_array().cloned().unwrap_or_default();
        Answer {
            is_error: result["isError"] == json!(true),
            text: result["content"][0]["text"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            images: blocks
                .iter()
                .filter(|b| b["type"] == "image")
                .map(|b| b["mimeType"].as_str().unwrap_or_default().to_owned())
                .collect(),
        }
    }

    /// The server's process number.
    #[cfg(unix)]
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// Waits for the server to leave, up to `most`; how it left, or None if it is still there.
    pub fn wait_for_exit(&mut self, most: Duration) -> Option<std::process::ExitStatus> {
        let until = std::time::Instant::now() + most;
        loop {
            if let Ok(Some(status)) = self.child.try_wait() {
                return Some(status);
            }
            if std::time::Instant::now() >= until {
                return None;
            }
            thread::sleep(Duration::from_millis(20));
        }
    }

    /// A tool that works: its JSON answer.
    pub fn ok(&mut self, tool: &str, arguments: Value) -> Value {
        let answer = self.call(tool, arguments);
        assert!(!answer.is_error, "`{tool}` failed: {}", answer.text);
        answer.json()
    }

    /// A tool that works and answers in words rather than JSON.
    pub fn text(&mut self, tool: &str, arguments: Value) -> String {
        let answer = self.call(tool, arguments);
        assert!(!answer.is_error, "`{tool}` failed: {}", answer.text);
        answer.text
    }

    /// A tool that refuses: why.
    pub fn refused(&mut self, tool: &str, arguments: Value) -> String {
        let answer = self.call(tool, arguments);
        assert!(
            answer.is_error,
            "`{tool}` should have failed: {}",
            answer.text
        );
        answer.text
    }
}

pub fn names_in(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}
