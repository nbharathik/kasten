//! MCP over streamable HTTP on 127.0.0.1: only with the bearer token, only
//! for the loopback Host, never from a web page.

mod common;

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::process::{Command, Stdio};

use common::vault;
use serde_json::{Value, json};

struct Server {
    child: std::process::Child,
    port: u16,
    token: String,
    settings: std::path::PathBuf,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.settings);
    }
}

fn start(vault: &std::path::Path) -> Server {
    // The record of issued tokens goes in a settings folder of the test's own.
    let settings = vault.with_extension("settings");
    let mut child = Command::new(env!("CARGO_BIN_EXE_kasten-mcp"))
        .args(["--vault", vault.to_str().unwrap(), "--http", "--port", "0"])
        .env("XDG_CONFIG_HOME", &settings)
        .env("HOME", &settings)
        .env("APPDATA", &settings)
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut lines = BufReader::new(child.stderr.take().unwrap()).lines();
    let first = lines.next().unwrap().unwrap();
    let port: u16 = first
        .split("127.0.0.1:")
        .nth(1)
        .unwrap()
        .split('/')
        .next()
        .unwrap()
        .parse()
        .unwrap();
    // Keep reading what the server says, so its stderr never closes under it.
    std::thread::spawn(move || lines.for_each(drop));
    let token = std::fs::read_to_string(vault.join(".kasten/cache/mcp-token"))
        .unwrap()
        .trim()
        .to_owned();
    Server {
        child,
        port,
        token,
        settings,
    }
}

/// One POST; returns the status and the JSON-RPC message in the body.
fn post(port: u16, headers: &[(&str, String)], body: &Value) -> (u16, Option<Value>) {
    let (status, message, _) = post_to(port, "/mcp", headers, body);
    (status, message)
}

/// `post` to any path; also says whether the whole request went out before
/// the server closed the connection.
fn post_to(
    port: u16,
    path: &str,
    headers: &[(&str, String)],
    body: &Value,
) -> (u16, Option<Value>, bool) {
    let (response, sent) = send(port, path, headers, body);
    (status_of(&response), message_of(&response), sent)
}

/// One POST; the raw response, and whether the whole request went out.
fn send(port: u16, path: &str, headers: &[(&str, String)], body: &Value) -> (String, bool) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    let body = body.to_string();
    let mut request = format!(
        "POST {path} HTTP/1.1\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str("\r\n");
    request.push_str(&body);
    let sent = stream.write_all(request.as_bytes()).is_ok();
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    (response, sent)
}

fn status_of(response: &str) -> u16 {
    response
        .split(' ')
        .nth(1)
        .unwrap_or("0")
        .parse()
        .unwrap_or(0)
}

/// The JSON-RPC message in a response's body.
fn message_of(response: &str) -> Option<Value> {
    response
        .lines()
        .filter_map(|l| {
            l.strip_prefix("data: ")
                .or_else(|| l.starts_with('{').then_some(l))
        })
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .find(|v| v.get("jsonrpc").is_some())
}

/// A response header's value.
fn header_of(response: &str, name: &str) -> Option<String> {
    let head = response.split("\r\n\r\n").next()?;
    head.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case(name)
            .then(|| value.trim().to_owned())
    })
}

fn initialize() -> Value {
    json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "http-client", "version": "1"}
    }})
}

#[test]
fn serves_only_with_the_token_the_loopback_host_and_no_origin() {
    let v = vault();
    let server = start(&v.0);
    let host = ("Host", format!("127.0.0.1:{}", server.port));
    let auth = ("Authorization", format!("Bearer {}", server.token));

    assert_eq!(
        post(server.port, std::slice::from_ref(&host), &initialize()).0,
        401
    );
    let wrong = ("Authorization", "Bearer nope".to_owned());
    assert_eq!(
        post(server.port, &[host.clone(), wrong], &initialize()).0,
        401
    );
    let rebinding = ("Host", format!("evil.example:{}", server.port));
    assert!(post(server.port, &[rebinding, auth.clone()], &initialize()).0 >= 400);
    let page = ("Origin", "https://evil.example".to_owned());
    assert!(
        post(
            server.port,
            &[host.clone(), auth.clone(), page],
            &initialize()
        )
        .0 >= 400
    );

    let (status, message) = post(server.port, &[host, auth], &initialize());
    assert_eq!(status, 200);
    assert_eq!(
        message.unwrap()["result"]["serverInfo"]["name"],
        json!("kasten")
    );
}

#[test]
fn refuses_a_large_request_with_a_clean_401() {
    // The refusal must reach a client still sending its body. A server that
    // closes with the body unread resets the connection, and the reply is
    // lost: on Windows even for a small request.
    let v = vault();
    let server = start(&v.0);
    let host = ("Host", format!("127.0.0.1:{}", server.port));
    // Near the most the server reads.
    let padding = "x".repeat(3 << 20);
    let big =
        json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"padding": padding}});
    let (status, _, sent) = post_to(server.port, "/mcp", std::slice::from_ref(&host), &big);
    assert_eq!((status, sent), (401, true));
    // Every other refusal goes the same way; small requests show which.
    let auth = ("Authorization", format!("Bearer {}", server.token));
    let small = initialize();
    let elsewhere = post_to(
        server.port,
        "/elsewhere",
        &[host.clone(), auth.clone()],
        &small,
    );
    assert_eq!(elsewhere.0, 404);
    let rebinding = ("Host", format!("evil.example:{}", server.port));
    assert_eq!(post(server.port, &[rebinding, auth.clone()], &small).0, 403);
    let page = ("Origin", "https://evil.example".to_owned());
    assert_eq!(post(server.port, &[host, auth, page], &small).0, 403);
}

/// A tool call as a client of protocol 2026-07-28 sends it: no handshake,
/// and the client named in the request's own `_meta`.
fn capture_as(client: &str, text: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {
        "name": "capture",
        "arguments": {"markdown": text},
        "_meta": {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": {"name": client, "version": "1"},
            "io.modelcontextprotocol/clientCapabilities": {}
        }
    }})
}

/// The session and author of the newest commit an agent made as `client`.
fn session_of(vault: &std::path::Path, client: &str) -> Option<String> {
    let k = kasten_core::Kasten::open(vault).unwrap();
    let log = k.log(None, 20).unwrap();
    log.iter()
        .find(|c| c.author == format!("agent:{client}"))
        .and_then(|c| c.session.clone())
}

#[test]
fn each_client_of_the_current_protocol_works_in_a_session_of_its_own() {
    let v = vault();
    let server = start(&v.0);
    let headers = [
        ("Host", format!("127.0.0.1:{}", server.port)),
        ("Authorization", format!("Bearer {}", server.token)),
        ("MCP-Protocol-Version", "2026-07-28".to_owned()),
        ("Mcp-Method", "tools/call".to_owned()),
        ("Mcp-Name", "capture".to_owned()),
    ];
    for (client, text) in [("alpha-agent", "Alpha idea"), ("beta-agent", "Beta idea")] {
        let (status, message) = post(server.port, &headers, &capture_as(client, text));
        assert_eq!(status, 200, "{message:?}");
        let message = message.expect("a reply");
        assert!(message["result"]["isError"] != json!(true), "{message}");
    }
    let alpha = session_of(&v.0, "alpha-agent");
    let beta = session_of(&v.0, "beta-agent");
    assert!(alpha.is_some() && beta.is_some(), "{alpha:?} {beta:?}");
    assert_ne!(alpha, beta);
}

#[test]
fn clients_of_one_name_on_two_connections_work_in_two_sessions() {
    let v = vault();
    let server = start(&v.0);
    let host = ("Host", format!("127.0.0.1:{}", server.port));
    let auth = ("Authorization", format!("Bearer {}", server.token));
    for text in ["First idea", "Second idea"] {
        let hello = json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "twin-agent", "version": "1"}
        }});
        let (response, _) = send(server.port, "/mcp", &[host.clone(), auth.clone()], &hello);
        let id = header_of(&response, "mcp-session-id").expect("a session id");
        let within = [
            host.clone(),
            auth.clone(),
            ("Mcp-Session-Id", id),
            ("MCP-Protocol-Version", "2025-06-18".to_owned()),
        ];
        let ready = json!({"jsonrpc": "2.0", "method": "notifications/initialized"});
        send(server.port, "/mcp", &within, &ready);
        let call = json!({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {
            "name": "capture", "arguments": {"markdown": text}
        }});
        let (response, _) = send(server.port, "/mcp", &within, &call);
        assert_eq!(status_of(&response), 200, "{response}");
    }
    let k = kasten_core::Kasten::open(&v.0).unwrap();
    let sessions: std::collections::HashSet<String> = k
        .log(None, 20)
        .unwrap()
        .into_iter()
        .filter(|c| c.author == "agent:twin-agent")
        .filter_map(|c| c.session)
        .collect();
    assert_eq!(sessions.len(), 2, "{sessions:?}");
}
