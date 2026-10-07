//! Just enough HTTP/1.1 for one person on one machine: read a request, write
//! a response, close the connection. The server is only ever bound to the
//! loopback address, so there is no keep-alive, no chunking and no TLS.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use serde_json::Value;

/// The most a request body may hold: a picture or a large deck.
pub const MAX_BODY: usize = 64 * 1024 * 1024;
/// The most the request line and headers may take, together.
const MAX_HEAD: usize = 64 * 1024;
const MAX_HEADERS: usize = 100;

/// Why a request could not be read.
#[derive(Debug)]
pub enum ReadError {
    /// The other side closed the connection before saying anything.
    Closed,
    /// What was sent is not a request this server understands (status 400).
    Bad(&'static str),
    /// Too much was sent (status 413).
    TooLarge,
    /// The transfer failed or stalled; there is nobody to answer.
    Io,
}

impl From<io::Error> for ReadError {
    fn from(_: io::Error) -> ReadError {
        ReadError::Io
    }
}

pub struct Request {
    pub method: String,
    /// The path, with percent-escapes undone and without the query.
    pub path: String,
    pub query: Vec<(String, String)>,
    /// Names in lower case.
    headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Request {
    pub fn header(&self, name: &str) -> Option<&str> {
        let name = name.to_ascii_lowercase();
        self.headers
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, v)| v.as_str())
    }

    /// The first query parameter of this name.
    pub fn param(&self, name: &str) -> Option<&str> {
        self.query
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, v)| v.as_str())
    }

    pub fn text(&self) -> Result<&str, ReadError> {
        std::str::from_utf8(&self.body).map_err(|_| ReadError::Bad("the body is not UTF-8 text"))
    }
}

#[cfg(test)]
impl Request {
    /// A request as the server would have read it, for tests of what is done with one.
    pub fn for_test(method: &str, target: &str, headers: &[(&str, &str)], body: &[u8]) -> Request {
        let (path, query) = split_target(target).expect("a valid target");
        Request {
            method: method.to_owned(),
            path,
            query,
            headers: headers
                .iter()
                .map(|(n, v)| (n.to_ascii_lowercase(), (*v).to_owned()))
                .collect(),
            body: body.to_vec(),
        }
    }
}

/// `%41` is `A`; a `+` is a space only in a query.
pub fn unescape(text: &str, plus_is_space: bool) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' => {
                let hex = text.get(i + 1..i + 3)?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                i += 3;
            }
            b'+' if plus_is_space => {
                out.push(b' ');
                i += 1;
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

/// One line, without its line end; None at the end of the stream.
fn read_line(reader: &mut impl BufRead, budget: &mut usize) -> Result<Option<String>, ReadError> {
    let mut line = Vec::new();
    let read = reader
        .take(*budget as u64 + 1)
        .read_until(b'\n', &mut line)?;
    if read == 0 {
        return Ok(None);
    }
    if read > *budget {
        return Err(ReadError::TooLarge);
    }
    *budget -= read;
    while matches!(line.last(), Some(b'\n' | b'\r')) {
        line.pop();
    }
    String::from_utf8(line)
        .map(Some)
        .map_err(|_| ReadError::Bad("a header is not text"))
}

fn split_target(target: &str) -> Result<(String, Vec<(String, String)>), ReadError> {
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let path = unescape(path, false).ok_or(ReadError::Bad("the address is not valid"))?;
    let mut pairs = Vec::new();
    for part in query.split('&').filter(|p| !p.is_empty()) {
        let (name, value) = part.split_once('=').unwrap_or((part, ""));
        let name = unescape(name, true).ok_or(ReadError::Bad("the query is not valid"))?;
        let value = unescape(value, true).ok_or(ReadError::Bad("the query is not valid"))?;
        pairs.push((name, value));
    }
    Ok((path, pairs))
}

/// Reads one request from the stream, with its body.
pub fn read_request(stream: &TcpStream) -> Result<Request, ReadError> {
    stream.set_read_timeout(Some(Duration::from_secs(30)))?;
    let mut reader = BufReader::new(stream);
    let mut budget = MAX_HEAD;
    let first = read_line(&mut reader, &mut budget)?.ok_or(ReadError::Closed)?;
    let mut words = first.split(' ');
    let (Some(method), Some(target), Some(version)) = (words.next(), words.next(), words.next())
    else {
        return Err(ReadError::Bad("the request line is not valid"));
    };
    if !version.starts_with("HTTP/1.") {
        return Err(ReadError::Bad("only HTTP/1 is spoken here"));
    }
    let (path, query) = split_target(target)?;

    let mut headers: Vec<(String, String)> = Vec::new();
    loop {
        let line =
            read_line(&mut reader, &mut budget)?.ok_or(ReadError::Bad("the head ends early"))?;
        if line.is_empty() {
            break;
        }
        if headers.len() >= MAX_HEADERS {
            return Err(ReadError::TooLarge);
        }
        let (name, value) = line
            .split_once(':')
            .ok_or(ReadError::Bad("a header has no colon"))?;
        headers.push((name.trim().to_ascii_lowercase(), value.trim().to_owned()));
    }
    let find = |name: &str| headers.iter().find(|(n, _)| n == name).map(|(_, v)| v);
    if find("transfer-encoding").is_some() {
        return Err(ReadError::Bad("send the length of the body, not chunks"));
    }
    let length: usize = match find("content-length") {
        Some(value) => value
            .parse()
            .map_err(|_| ReadError::Bad("the length is not a number"))?,
        None => 0,
    };
    if length > MAX_BODY {
        return Err(ReadError::TooLarge);
    }
    if length > 0 && find("expect").is_some_and(|v| v.eq_ignore_ascii_case("100-continue")) {
        (&*stream).write_all(b"HTTP/1.1 100 Continue\r\n\r\n")?;
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body)?;
    Ok(Request {
        method: method.to_ascii_uppercase(),
        path,
        query,
        headers,
        body,
    })
}

/// What to send back.
pub struct Response {
    pub status: u16,
    headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        413 => "Payload Too Large",
        422 => "Unprocessable Content",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "OK",
    }
}

impl Response {
    pub fn bytes(status: u16, content_type: &str, body: Vec<u8>) -> Response {
        Response {
            status,
            headers: vec![("Content-Type".to_owned(), content_type.to_owned())],
            body,
        }
    }

    pub fn json(status: u16, value: &Value) -> Response {
        Response::bytes(
            status,
            "application/json; charset=utf-8",
            value.to_string().into_bytes(),
        )
    }

    /// A short reason, in the shape every failure of the API has.
    pub fn error(status: u16, message: &str) -> Response {
        Response::json(status, &serde_json::json!({ "error": message }))
    }

    pub fn with(mut self, name: &str, value: &str) -> Response {
        self.headers.push((name.to_owned(), value.to_owned()));
        self
    }

    pub fn write_to(&self, mut stream: &TcpStream) -> io::Result<()> {
        let mut head = format!("HTTP/1.1 {} {}\r\n", self.status, reason(self.status));
        for (name, value) in &self.headers {
            head.push_str(&format!("{name}: {value}\r\n"));
        }
        head.push_str(&format!(
            "Content-Length: {}\r\nConnection: close\r\n\r\n",
            self.body.len()
        ));
        stream.write_all(head.as_bytes())?;
        stream.write_all(&self.body)?;
        stream.flush()
    }
}

/// The head of a stream of events that stays open.
pub fn write_event_stream_head(mut stream: &TcpStream) -> io::Result<()> {
    stream.write_all(
        b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\nX-Accel-Buffering: no\r\n\r\n",
    )?;
    stream.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{TcpListener, TcpStream};

    /// Sends `raw` to a listener and reads the request it parses.
    fn parse(raw: &[u8]) -> Result<Request, ReadError> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        client.write_all(raw).unwrap();
        client.shutdown(std::net::Shutdown::Write).unwrap();
        let (server, _) = listener.accept().unwrap();
        read_request(&server)
    }

    #[test]
    fn unescapes_paths_and_queries() {
        assert_eq!(unescape("a%20b%2Fc", false).unwrap(), "a b/c");
        assert_eq!(unescape("a+b", false).unwrap(), "a+b");
        assert_eq!(unescape("a+b", true).unwrap(), "a b");
        assert_eq!(unescape("%zz", true), None);
        assert_eq!(unescape("%e2%9c", true), None);
    }

    #[test]
    fn reads_a_request_with_query_headers_and_body() {
        let request = parse(
            b"PUT /api/deck?path=a%20b.deck&base=abc HTTP/1.1\r\nHost: 127.0.0.1:1\r\nContent-Length: 5\r\nX-Slides: 1\r\n\r\nhello",
        )
        .unwrap();
        assert_eq!(request.method, "PUT");
        assert_eq!(request.path, "/api/deck");
        assert_eq!(request.param("path"), Some("a b.deck"));
        assert_eq!(request.param("base"), Some("abc"));
        assert_eq!(request.header("x-slides"), Some("1"));
        assert_eq!(request.header("HOST"), Some("127.0.0.1:1"));
        assert_eq!(request.body, b"hello");
    }

    #[test]
    fn refuses_what_it_cannot_read() {
        assert!(matches!(parse(b""), Err(ReadError::Closed)));
        assert!(matches!(parse(b"nonsense\r\n\r\n"), Err(ReadError::Bad(_))));
        assert!(matches!(
            parse(b"POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n"),
            Err(ReadError::Bad(_))
        ));
        assert!(matches!(
            parse(b"POST / HTTP/1.1\r\nContent-Length: 999999999999\r\n\r\n"),
            Err(ReadError::TooLarge)
        ));
        let long = format!("GET /{} HTTP/1.1\r\n\r\n", "a".repeat(70_000));
        assert!(matches!(parse(long.as_bytes()), Err(ReadError::TooLarge)));
    }
}
