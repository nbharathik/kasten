//! Search by meaning against a fake OpenAI-compatible server on 127.0.0.1:
//! the requests sent, the vectors kept, retrying when told to slow down,
//! stopping, and the notes nearest a question. No real provider is reached.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::thread;

use serde_json::{Value, json};

use super::*;
use crate::chat::tests::{block_on, vault};

/// What a server was asked: each request's head and body.
type Asked = Arc<Mutex<Vec<(String, Value)>>>;

/// A server answering every request with `answer(request body)`, as
/// (status, body); what it was asked is kept.
fn server(answer: impl Fn(&Value) -> (u16, Value) + Send + 'static) -> (String, Asked) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}/v1", listener.local_addr().unwrap());
    let asked = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&asked);
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut head = String::new();
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
                head.push_str(&line);
            }
            let length: usize = head
                .lines()
                .find_map(|l| {
                    l.to_lowercase()
                        .strip_prefix("content-length:")
                        .map(|v| v.trim().parse().unwrap())
                })
                .unwrap_or(0);
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            let body: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
            let (status, reply) = answer(&body);
            log.lock().unwrap().push((head, body));
            let text = reply.to_string();
            let _ = write!(
                stream,
                "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
                text.len()
            );
        }
    });
    (base, asked)
}

/// A vector saying which of three topics a text is about.
fn topic(text: &str) -> Vec<f32> {
    let text = text.to_lowercase();
    let has = |word: &str| if text.contains(word) { 1.0 } else { 0.05 };
    vec![has("sourdough"), has("kiln"), has("garden")]
}

fn embeddings(body: &Value) -> (u16, Value) {
    let inputs = body["input"].as_array().unwrap();
    // Answered out of order, as some servers do; the index says which.
    let data: Vec<Value> = inputs
        .iter()
        .enumerate()
        .rev()
        .map(|(i, text)| json!({"object": "embedding", "index": i, "embedding": topic(text.as_str().unwrap())}))
        .collect();
    (
        200,
        json!({"object": "list", "data": data, "model": body["model"]}),
    )
}

fn embedder(base: &str) -> Embedder {
    Embedder {
        http: reqwest::Client::new(),
        url: embeddings_url(base).unwrap(),
        key: Some("sk-test".into()),
        model: "text-embedding-3-small".into(),
        provider: "openai".into(),
        pause: Duration::from_millis(10),
    }
}

#[test]
fn finds_where_a_provider_makes_vectors() {
    assert_eq!(
        embeddings_url("https://api.openai.com/v1/").unwrap(),
        "https://api.openai.com/v1/embeddings"
    );
    assert_eq!(
        embeddings_url("http://localhost:8000/v1/chat/completions").unwrap(),
        "http://localhost:8000/v1/embeddings"
    );
    assert!(embeddings_url(" ").is_err());
}

#[test]
fn reads_vectors_in_the_order_asked() {
    let answer = json!({"data": [
        {"index": 1, "embedding": [0.0, 1.0]},
        {"index": 0, "embedding": [1.0, 0.5]}
    ]});
    assert_eq!(
        vectors_of(&answer, 2).unwrap(),
        vec![vec![1.0, 0.5], vec![0.0, 1.0]]
    );
    assert!(vectors_of(&answer, 3).unwrap_err().contains("missed"));
    assert!(vectors_of(&json!({"error": {"message": "no"}}), 1).is_err());
    assert!(vectors_of(&json!({"data": [{"index": 0, "embedding": ["a"]}]}), 1).is_err());
}

#[test]
fn makes_a_vector_for_every_note_then_finds_the_nearest() {
    let v = vault();
    let kasten = &v.kasten;
    let (base, asked) = server(embeddings);
    let embedder = embedder(&base);
    let stop = AtomicBool::new(false);
    let seen = Mutex::new(Vec::new());
    let status = block_on(make_all(kasten, &embedder, &stop, |s| {
        seen.lock().unwrap().push(s.done)
    }))
    .unwrap();
    assert_eq!(status.done, status.total);
    assert!(status.total > 0);
    // In batches, with the model and key the provider needs.
    let asked = asked.lock().unwrap().clone();
    assert!(!asked.is_empty());
    let (head, body) = &asked[0];
    assert!(head.starts_with("POST /v1/embeddings "), "{head}");
    assert!(
        head.to_lowercase()
            .contains("authorization: bearer sk-test"),
        "{head}"
    );
    assert_eq!(body["model"], "text-embedding-3-small");
    assert!(body["input"].as_array().unwrap().len() <= BATCH);
    let seen = seen.lock().unwrap().clone();
    assert_eq!(seen.last(), Some(&status.total));
    assert!(seen.windows(2).all(|w| w[0] <= w[1]));

    // A question about pottery finds the note about kilns.
    let path = kasten
        .list()
        .unwrap()
        .into_iter()
        .find(|n| n.title == "Zettelkasten method")
        .unwrap()
        .path;
    let file = kasten.read(&path).unwrap();
    kasten
        .save_body(
            &crate::commands::notes::HUMAN,
            &path,
            "Firing the kiln to cone six.\n",
            &file.hash,
            kasten_core::Instant::now(),
        )
        .unwrap();
    block_on(make_all(kasten, &embedder, &stop, |_| {})).unwrap();
    let near = block_on(search(kasten, &embedder, "when is the kiln hot enough?", 3)).unwrap();
    assert_eq!(near[0].path, path);
}

#[test]
fn waits_when_told_to_slow_down_and_says_what_went_wrong() {
    let v = vault();
    let tries = Arc::new(Mutex::new(0));
    let count = Arc::clone(&tries);
    let (base, _) = server(move |body| {
        let mut n = count.lock().unwrap();
        *n += 1;
        if *n == 1 {
            (429, json!({"error": {"message": "Rate limit reached"}}))
        } else {
            embeddings(body)
        }
    });
    let status = block_on(make_all(
        &v.kasten,
        &embedder(&base),
        &AtomicBool::new(false),
        |_| {},
    ))
    .unwrap();
    assert_eq!(status.done, status.total);

    // A vault with every note still to do, and a key the provider refuses.
    let fresh = vault();
    let (base, _) = server(|_| {
        (
            401,
            json!({"error": {"message": "Incorrect API key provided"}}),
        )
    });
    let err = block_on(make_all(
        &fresh.kasten,
        &embedder(&base),
        &AtomicBool::new(false),
        |_| {},
    ))
    .unwrap_err();
    assert!(err.contains("Incorrect API key"), "{err}");
}

#[test]
fn stops_between_batches_when_asked() {
    let v = vault();
    let (base, asked) = server(embeddings);
    let stop = AtomicBool::new(true);
    let status = block_on(make_all(&v.kasten, &embedder(&base), &stop, |_| {})).unwrap();
    assert_eq!(status.done, 0);
    assert!(asked.lock().unwrap().is_empty());
}

#[test]
fn catches_up_a_few_batches_at_a_time() {
    let v = vault();
    let (base, asked) = server(embeddings);
    let embedder = embedder(&base);
    let status = block_on(make_some(&v.kasten, &embedder, 1)).unwrap();
    assert_eq!(status.done, BATCH.min(status.total));
    assert_eq!(asked.lock().unwrap().len(), 1);
    // Nothing left to do asks nothing.
    block_on(make_all(
        &v.kasten,
        &embedder,
        &AtomicBool::new(false),
        |_| {},
    ))
    .unwrap();
    let before = asked.lock().unwrap().len();
    let status = block_on(make_some(&v.kasten, &embedder, 3)).unwrap();
    assert_eq!(status.done, status.total);
    assert_eq!(asked.lock().unwrap().len(), before);
}
