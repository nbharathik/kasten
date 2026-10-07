//! Finding the wiki links in a body, as the index sees them: outside code
//! fences and code spans, not escaped with a backslash.

use std::ops::Range;

use crate::extract::fence_after;

/// The byte range of each link's inner text, between `[[` and `]]`.
pub(crate) fn link_spans(body: &str) -> Vec<Range<usize>> {
    let mut out = Vec::new();
    let mut fence: Option<(char, usize)> = None;
    let mut offset = 0;
    for raw in body.split_inclusive('\n') {
        let start = offset;
        offset += raw.len();
        let line = raw.trim_end_matches('\n').trim_end_matches('\r');
        let (after, marker) = fence_after(fence, line);
        fence = after;
        if !marker && fence.is_none() && line.contains("[[") {
            spans_in_line(line, start, &mut out);
        }
    }
    out
}

fn spans_in_line(line: &str, base: usize, out: &mut Vec<Range<usize>>) {
    let bytes = line.as_bytes();
    let mut in_code = false;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'`' {
            in_code = !in_code;
            i += 1;
            continue;
        }
        if in_code || bytes[i] != b'[' || bytes.get(i + 1) != Some(&b'[') {
            i += 1;
            continue;
        }
        let escaped = i > 0 && bytes[i - 1] == b'\\';
        let inner = i + 2;
        let Some(len) = line[inner..].find("]]") else {
            return;
        };
        let text = &line[inner..inner + len];
        if !escaped && !text.is_empty() && !text.contains(['[', '`']) {
            out.push(base + inner..base + inner + len);
        }
        i = inner + len + 2;
    }
}
