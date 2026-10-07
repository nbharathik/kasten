//! "Test connection" in Settings: one short request, without tools, down
//! the same streaming path a chat takes, so a test that passes means the
//! chat will work. It says what came back and how long it took, or why it
//! failed in the HTTP layer's own words (status, the provider's message
//! and what to check).

use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

use serde::Serialize;

use super::model::{Call, Message, Model};

/// How long a test waits for the whole answer.
const LIMIT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCheck {
    pub ok: bool,
    /// The model asked.
    pub model: String,
    /// How long the answer took, in milliseconds.
    pub millis: u64,
    /// The start of what the model said.
    pub reply: String,
    /// One sentence for the person: that it works, or why not.
    pub message: String,
}

/// Asks `model` (named `name`) for one word and reports how it went.
pub async fn check(model: &impl Model, name: &str) -> ProviderCheck {
    let started = Instant::now();
    let messages = [Message::User("Reply with the one word OK.".to_owned())];
    let call = Call {
        system: "You are answering a connection test. Reply with one word.",
        messages: &messages,
        tools: &[],
    };
    let cancel = AtomicBool::new(false);
    let answer = tokio::time::timeout(LIMIT, model.reply(&call, &|_| {}, &cancel)).await;
    let millis = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    let (ok, reply, message) = match answer {
        Err(_) => (
            false,
            String::new(),
            format!(
                "No answer from {name} within a minute. The server may be busy, or the model still loading"
            ),
        ),
        Ok(Err(failure)) => (false, String::new(), failure.message),
        Ok(Ok(reply)) => {
            let text: String = reply.text.trim().chars().take(80).collect();
            let seconds = millis as f64 / 1000.0;
            (true, text, format!("{name} answered in {seconds:.1} s"))
        }
    };
    ProviderCheck {
        ok,
        model: name.to_owned(),
        millis,
        reply,
        message,
    }
}
