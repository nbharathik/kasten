//! `fixtures/decks/composites.deck`: one slide for each kind of composite element, and
//! variants that change how one looks. Made through the operations, like the others.

use serde_json::{Value, json};

use super::add;
use crate::ops::Engine;

const PYTHON: &str = "from dataclasses import dataclass\n\n@dataclass\nclass Card:\n    title: str\n    body: str = \"\"\n\n    def shout(self) -> str:\n        # loud, on purpose\n        return f\"{self.title.upper()}!\" + str(42)\n";

const RUST: &str = "use std::collections::HashMap;\n\nfn count(words: &[&str]) -> HashMap<String, usize> {\n    let mut seen = HashMap::new();\n    for w in words {\n        *seen.entry((*w).to_owned()).or_insert(0) += 1;\n    }\n    seen\n}";

const TYPESCRIPT: &str = "interface Tool {\n  name: string;\n  run(input: string): Promise<string>;\n}\n\nasync function step(tools: Tool[], call: string) {\n  const tool = tools.find((t) => call.startsWith(t.name));\n  return tool ? await tool.run(call) : \"unknown tool\";\n}";

/// A slide of the `title-only` layout with a title, and the element under it.
fn slide(e: &mut Engine, title: &str, elements: Vec<Value>) -> String {
    let s = add(e, "title-only", json!({ "title": title }));
    e.apply("add_elements", json!({ "slide": s, "elements": elements }))
        .unwrap();
    s
}

/// The content area under the title of a plain layout, less `less` from its height.
fn at(kind: Value, y: f64, h: f64) -> Value {
    let mut value = kind;
    value["x"] = json!(64);
    value["y"] = json!(y);
    value["w"] = json!(832);
    value["h"] = json!(h);
    value
}

pub(super) fn composites() -> Engine {
    let mut e = Engine::create("Composite elements", "Light", 15).unwrap();
    slide(
        &mut e,
        "Code, dark",
        vec![at(
            json!({ "type": "code", "id": "code-dark", "language": "python", "code": PYTHON }),
            148.0,
            344.0,
        )],
    );
    slide(
        &mut e,
        "Code, light, with line numbers",
        vec![at(
            json!({ "type": "code", "id": "code-light", "language": "rust", "theme": "light", "lineNumbers": true, "firstLine": 41, "code": RUST }),
            148.0,
            344.0,
        )],
    );
    let walk = slide(
        &mut e,
        "A walkthrough of code",
        vec![
            at(
                json!({ "type": "code", "id": "code-focus", "language": "typescript", "lineNumbers": true, "code": TYPESCRIPT, "focus": ["1-4", "6", "7-8", "9"] }),
                148.0,
                344.0,
            ),
            json!({ "type": "step-label", "id": "step-label", "x": 756, "y": 496, "w": 140, "h": 32 }),
        ],
    );
    e.apply("set_notes", json!({ "slide": walk, "notes": "Four steps: the interface, the function, the lookup and the call." })).unwrap();
    slide(
        &mut e,
        "Formulas",
        vec![
            at(
                json!({ "type": "math", "id": "math-display", "latex": "\\int_0^1 x^2\\,dx = \\frac{1}{3}", "alt": "The integral of x squared from 0 to 1 is one third" }),
                156.0,
                150.0,
            ),
            at(
                json!({ "type": "math", "id": "math-small", "latex": "\\mathrm{softmax}(z)_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}", "color": "accent1", "fontSize": 24 }),
                330.0,
                150.0,
            ),
        ],
    );
    slide(
        &mut e,
        "A conversation",
        vec![at(
            json!({ "type": "chat", "id": "chat", "messages": [
        { "role": "system", "text": "You are a helpful assistant with a weather tool." },
        { "role": "user", "text": "Do I need an umbrella in Oslo today?" },
        { "role": "toolCall", "text": "get_weather(city=\"Oslo\", day=\"today\")" },
        { "role": "toolResult", "text": "{\"temp_c\": 4, \"sky\": \"rain\", \"chance\": 0.9}" },
        { "role": "assistant", "text": "Yes: it is 4 degrees with a 90% chance of rain." } ] }),
            148.0,
            344.0,
        )],
    );
    slide(
        &mut e,
        "The next word",
        vec![at(
            json!({ "type": "token-probs", "id": "probs", "tokens": ["The", " cat", " sat", " on", " the"], "chosen": 0,
        "next": [ { "token": " mat", "p": 0.42 }, { "token": " floor", "p": 0.3 }, { "token": " sofa", "p": 0.14 }, { "token": " bed", "p": 0.09 }, { "token": " roof", "p": 0.05 } ] }),
            148.0,
            344.0,
        )],
    );
    slide(
        &mut e,
        "Six cards",
        vec![at(
            json!({ "type": "card-grid", "id": "cards-six", "cards": [
        { "title": "Plan", "body": "Break the goal into steps." }, { "title": "Act", "body": "Call a tool with an input." },
        { "title": "Observe", "body": "Read what came back." }, { "title": "Reflect", "body": "Compare it with the goal." },
        { "title": "Repeat", "body": "Until the goal is met." }, { "title": "Answer", "body": "Say what was found." } ] }),
            148.0,
            344.0,
        )],
    );
    slide(
        &mut e,
        "Four cards, two columns",
        vec![at(
            json!({ "type": "card-grid", "id": "cards-four", "columns": 2, "cards": [
        { "title": "Speed" }, { "title": "Cost" }, { "title": "Quality" }, { "title": "Safety" } ] }),
            148.0,
            344.0,
        )],
    );
    slide(
        &mut e,
        "References",
        vec![
            at(
                json!({ "type": "citation", "id": "cite-short", "keys": ["vaswani2017", "devlin2019"], "format": "short" }),
                156.0,
                32.0,
            ),
            at(
                json!({ "type": "citation", "id": "cite-numbered", "keys": ["vaswani2017", "devlin2019", "brown2020"], "format": "numbered" }),
                196.0,
                32.0,
            ),
            at(
                json!({ "type": "citation", "id": "cite-list", "keys": ["vaswani2017", "devlin2019", "brown2020"], "format": "list" }),
                236.0,
                96.0,
            ),
        ],
    );
    slide(
        &mut e,
        "Web pages",
        vec![
            json!({ "type": "embed", "id": "embed-panel", "x": 64, "y": 156, "w": 400, "h": 300, "url": "https://www.example.com/docs/intro", "title": "The documentation" }),
            json!({ "type": "embed", "id": "embed-poster", "x": 496, "y": 156, "w": 400, "h": 300, "url": "https://example.com/demo", "poster": "assets/demo-page.png" }),
        ],
    );
    slide(
        &mut e,
        "Video",
        vec![
            json!({ "type": "video", "id": "video-plain", "x": 64, "y": 156, "w": 400, "h": 225, "src": "assets/walkthrough.mp4" }),
            json!({ "type": "video", "id": "video-poster", "x": 496, "y": 156, "w": 400, "h": 225, "src": "https://example.com/talk.mp4", "poster": "assets/talk-still.png" }),
        ],
    );
    e
}
