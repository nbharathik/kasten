//! Server-sent events, the `text/event-stream` format both providers stream
//! their answers in, parsed from byte chunks that may split anywhere: inside
//! a line, inside a UTF-8 character, or between the CR and LF of a line end.

/// One event: its type from `event:` (empty when it named none) and its
/// `data:` lines joined by `\n`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SseEvent {
    pub event: String,
    pub data: String,
}

/// The most a line, or one event's data, may hold: far more than any piece
/// of an answer, so only a broken or hostile server sends more.
const MAX_PIECE: usize = 4 << 20;

#[derive(Debug, Default)]
pub struct SseParser {
    /// The bytes of a line not ended yet.
    line: Vec<u8>,
    /// The last line ended with CR, so an LF that follows belongs to it.
    after_cr: bool,
    /// Some line was read, so a byte order mark can no longer come.
    started: bool,
    event: String,
    data: Option<String>,
    /// A line or an event grew past `MAX_PIECE`; nothing more is read.
    overflowed: bool,
}

impl SseParser {
    /// Reads a chunk; returns the events it completes.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<SseEvent> {
        let mut out = Vec::new();
        for &byte in bytes {
            if self.overflowed {
                break;
            }
            if std::mem::take(&mut self.after_cr) && byte == b'\n' {
                continue;
            }
            match byte {
                b'\r' => {
                    self.after_cr = true;
                    self.end_line(&mut out);
                }
                b'\n' => self.end_line(&mut out),
                _ => {
                    self.line.push(byte);
                    if self.line.len() > MAX_PIECE {
                        self.overflow();
                    }
                }
            }
        }
        out
    }

    /// Whether the stream sent a line or an event too big to read.
    pub fn overflowed(&self) -> bool {
        self.overflowed
    }

    fn overflow(&mut self) {
        self.overflowed = true;
        self.line = Vec::new();
        self.data = None;
    }

    /// The stream ended: a last line without its line end still counts,
    /// and an event without its blank line is dispatched rather than lost.
    pub fn finish(&mut self) -> Vec<SseEvent> {
        let mut out = Vec::new();
        if self.overflowed {
            return out;
        }
        if !self.line.is_empty() {
            self.end_line(&mut out);
        }
        self.dispatch(&mut out);
        out
    }

    fn end_line(&mut self, out: &mut Vec<SseEvent>) {
        let bytes = std::mem::take(&mut self.line);
        let mut line = String::from_utf8_lossy(&bytes).into_owned();
        if !std::mem::replace(&mut self.started, true) {
            line = line.trim_start_matches('\u{feff}').to_owned();
        }
        if line.is_empty() {
            self.dispatch(out);
            return;
        }
        if line.starts_with(':') {
            return;
        }
        let (field, value) = match line.split_once(':') {
            Some((field, value)) => (field, value.strip_prefix(' ').unwrap_or(value)),
            None => (line.as_str(), ""),
        };
        match field {
            "event" => self.event = value.to_owned(),
            "data" => {
                match &mut self.data {
                    Some(data) => {
                        data.push('\n');
                        data.push_str(value);
                    }
                    None => self.data = Some(value.to_owned()),
                }
                if self
                    .data
                    .as_ref()
                    .is_some_and(|data| data.len() > MAX_PIECE)
                {
                    self.overflow();
                }
            }
            // `id` and `retry` matter for reconnecting, which a reply never does.
            _ => {}
        }
    }

    fn dispatch(&mut self, out: &mut Vec<SseEvent>) {
        let event = std::mem::take(&mut self.event);
        if let Some(data) = self.data.take() {
            out.push(SseEvent { event, data });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(chunks: &[&[u8]]) -> Vec<SseEvent> {
        let mut parser = SseParser::default();
        let mut out = Vec::new();
        for chunk in chunks {
            out.extend(parser.push(chunk));
        }
        out.extend(parser.finish());
        out
    }

    fn event(event: &str, data: &str) -> SseEvent {
        SseEvent {
            event: event.to_owned(),
            data: data.to_owned(),
        }
    }

    #[test]
    fn stops_reading_a_line_or_an_event_too_big_to_be_an_answer() {
        let mut parser = SseParser::default();
        let endless = vec![b'x'; 1 << 20];
        for _ in 0..5 {
            assert!(parser.push(&endless).is_empty());
        }
        assert!(parser.overflowed());
        assert!(parser.line.capacity() < 1 << 20, "the long line was let go");
        assert!(parser.finish().is_empty());

        let mut parser = SseParser::default();
        let line = format!("data: {}\n", "y".repeat(1 << 20));
        for _ in 0..5 {
            parser.push(line.as_bytes());
        }
        assert!(parser.overflowed());
        let mut fine = SseParser::default();
        assert_eq!(fine.push(b"data: a\n\ndata:\ndata: b\n\n").len(), 2);
        assert!(!fine.overflowed());
    }

    const STREAM: &str = "event: message_start\ndata: {\"a\":1}\n\n: keep-alive\n\nevent: content_block_delta\r\ndata: {\"text\":\"Grüße, 日本\"}\r\n\r\ndata: first\ndata:second\ndata\n\nevent: empty\n\ndata: [DONE]\n\n";

    fn expected() -> Vec<SseEvent> {
        vec![
            event("message_start", "{\"a\":1}"),
            event("content_block_delta", "{\"text\":\"Grüße, 日本\"}"),
            event("", "first\nsecond\n"),
            event("", "[DONE]"),
        ]
    }

    #[test]
    fn reads_events_comments_and_multi_line_data() {
        assert_eq!(parse(&[STREAM.as_bytes()]), expected());
    }

    #[test]
    fn chunks_may_split_anywhere() {
        let bytes = STREAM.as_bytes();
        for at in 0..=bytes.len() {
            assert_eq!(
                parse(&[&bytes[..at], &bytes[at..]]),
                expected(),
                "split at {at}"
            );
        }
        let single: Vec<&[u8]> = bytes.chunks(1).collect();
        assert_eq!(parse(&single), expected());
    }

    #[test]
    fn line_ends_may_be_crlf_cr_or_lf() {
        let crlf = parse(&[b"data: a\r\n\r\ndata: b\r", b"\n\r\n"]);
        assert_eq!(crlf, vec![event("", "a"), event("", "b")]);
        let cr = parse(&[b"event: x\rdata: a\r\r"]);
        assert_eq!(cr, vec![event("x", "a")]);
    }

    #[test]
    fn a_stream_may_end_without_its_last_blank_line() {
        assert_eq!(parse(&[b"data: [DONE]"]), vec![event("", "[DONE]")]);
        assert_eq!(parse(&[b"data: x\n"]), vec![event("", "x")]);
        assert!(parse(&[b": only a comment\n"]).is_empty());
    }

    #[test]
    fn a_byte_order_mark_is_skipped() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(b"event: e\ndata: d\n\n");
        let (a, b) = bytes.split_at(2);
        assert_eq!(parse(&[a, b]), vec![event("e", "d")]);
    }
}
