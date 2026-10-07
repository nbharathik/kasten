use serde_json::json;

use super::*;

fn titles(id: &str) -> Option<String> {
    (id == "c-2").then(|| "Atomic notes".to_owned())
}

fn text(t: &str) -> Value {
    json!({"type": "text", "text": t})
}

fn para(content: Value) -> Value {
    json!({"type": "paragraph", "content": content})
}

#[test]
fn writes_heptabase_cards_as_markdown() {
    let doc = json!({"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 2}, "content": [text("Why")]},
        para(json!([
            text("A method of "),
            {"type": "text", "marks": [{"type": "bold"}], "text": "linked"},
            text(" notes. See "),
            {"type": "card", "attrs": {"cardId": "c-2"}},
            text(" and "),
            {"type": "card", "attrs": {"cardId": "gone"}},
            text(".")
        ])),
        {"type": "bullet_list_item", "content": [
            para(json!([text("One idea per card")])),
            {"type": "bullet_list_item", "content": [para(json!([text("in your own words")]))]}
        ]},
        {"type": "todo_list_item", "attrs": {"checked": true}, "content": [para(json!([text("Read the book")]))]},
        {"type": "numbered_list_item", "content": [para(json!([text("Capture")]))]},
        {"type": "numbered_list_item", "content": [para(json!([text("Connect")]))]},
        {"type": "code_block", "attrs": {"params": "rust"}, "content": [text("fn main() {}")]},
        {"type": "blockquote", "content": [para(json!([text("Notes are thinking.")]))]},
        para(json!([
            {"type": "text", "marks": [{"type": "link", "attrs": {"href": "https://zettelkasten.de"}}], "text": "zettelkasten.de"},
            text(" and "),
            {"type": "text", "marks": [{"type": "code"}], "text": "code"},
            text(" and "),
            {"type": "text", "marks": [{"type": "italic"}, {"type": "strike"}], "text": "style"},
            {"type": "hard_break"},
            text("next line")
        ])),
        {"type": "toggle_list_item", "content": [
            para(json!([text("More")])),
            para(json!([text("Hidden detail.")]))
        ]},
        {"type": "horizontal_rule"},
        {"type": "image", "attrs": {"src": "https://example.com/slip-box.png", "alt": "slip box"}},
        {"type": "math_display", "content": [text("e = mc^2")]},
        {"type": "mystery_block", "content": [para(json!([text("Kept as text.")]))]}
    ]});
    assert_eq!(
        to_markdown(&doc, &titles),
        concat!(
            "## Why\n\n",
            "A method of **linked** notes. See [[Atomic notes]] and a card that is gone.\n\n",
            "- One idea per card\n",
            "  - in your own words\n",
            "- [x] Read the book\n",
            "1. Capture\n",
            "2. Connect\n\n",
            "```rust\nfn main() {}\n```\n\n",
            "> Notes are thinking.\n\n",
            "[zettelkasten.de](https://zettelkasten.de) and `code` and ~~*style*~~  \nnext line\n\n",
            "<details>\n<summary>More</summary>\n\nHidden detail.\n\n</details>\n\n",
            "---\n\n",
            "![slip box](https://example.com/slip-box.png)\n\n",
            "$$\ne = mc^2\n$$\n\n",
            "Kept as text.\n",
        )
    );
}

#[test]
fn reads_content_given_as_a_json_string_or_as_markdown() {
    let doc = json!({"type": "doc", "content": [para(json!([text("Hi")]))]});
    assert_eq!(
        content_markdown(&Value::String(doc.to_string()), &titles),
        "Hi\n"
    );
    assert_eq!(
        content_markdown(&json!("Plain **Markdown**"), &titles),
        "Plain **Markdown**\n"
    );
    assert_eq!(content_markdown(&Value::Null, &titles), "");
}

#[test]
fn finds_the_first_line_for_a_title() {
    let doc = json!({"type": "doc", "content": [
        {"type": "paragraph"},
        para(json!([text("Untitled idea "), {"type": "text", "marks": [{"type": "bold"}], "text": "about links"}]))
    ]});
    assert_eq!(
        first_line(&doc).as_deref(),
        Some("Untitled idea about links")
    );
}
