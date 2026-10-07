//! The model over HTTP: a provider from the vault's config, its key from
//! the keychain, and one streamed request per answer. Every wait looks at
//! the stop flag several times a second and gives up after a long silence.

use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use kasten_core::config::Provider;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;

use super::model::{Call, Failure, Model, Reply};
use super::sse::{SseEvent, SseParser};
use super::{anthropic, openai};

/// Output tokens per answer from OpenAI-compatible servers, whose local
/// models may have small context windows.
pub const MAX_TOKENS: u32 = 4096;
/// Output tokens per answer from Claude: its thinking counts against the
/// same limit, and recent models think unless told not to.
pub const ANTHROPIC_MAX_TOKENS: u32 = 16_000;
/// How long a provider may send nothing before the answer is given up.
pub const IDLE: Duration = Duration::from_secs(180);
const CONNECT: Duration = Duration::from_secs(15);
/// How often a wait looks at the stop flag.
const TICK: Duration = Duration::from_millis(200);

/// The client every chat shares; system proxy settings apply. It follows
/// no redirect: a provider's answer comes from the address its key was
/// saved for, or not at all.
pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT)
        .user_agent(concat!("Kasten/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("The chat cannot make HTTPS connections: {}", chain(&e)))
}

/// The client for web pages elsewhere: names lead only to the public
/// internet, and it follows up to ten redirects, never to this computer or
/// the local network, where a page could otherwise fetch a router's or a
/// local server's pages into the vault.
pub fn web_client() -> Result<reqwest::Client, String> {
    public_builder(web_builder())
        .build()
        .map_err(|e| format!("Kasten cannot make HTTPS connections: {}", chain(&e)))
}

fn public_builder(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    // A proxy resolves the destination itself, bypassing the public DNS
    // filter. Untrusted page fetches therefore connect directly.
    builder
        .no_proxy()
        .dns_resolver(super::public_dns::PublicOnly::new())
}

#[cfg(test)]
#[path = "http_public_tests.rs"]
mod public_client_tests;

/// The client for a page the person asked for on this computer or the
/// local network, such as an intranet wiki: it may stay there.
pub fn local_web_client() -> Result<reqwest::Client, String> {
    web_builder()
        .build()
        .map_err(|e| format!("Kasten cannot make HTTPS connections: {}", chain(&e)))
}

fn web_builder() -> reqwest::ClientBuilder {
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        let from_outside = attempt
            .previous()
            .first()
            .is_some_and(|first| !super::address::private(first));
        if attempt.previous().len() >= 10 {
            attempt.error("the page redirected too many times")
        } else if from_outside && super::address::private(attempt.url()) {
            attempt.error("a page elsewhere redirected to this computer or the local network")
        } else {
            attempt.follow()
        }
    });
    reqwest::Client::builder()
        .connect_timeout(CONNECT)
        .user_agent(concat!("Kasten/", env!("CARGO_PKG_VERSION")))
        .redirect(policy)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Anthropic,
    OpenAi,
}

impl Kind {
    pub fn of(kind: &str) -> Result<Kind, String> {
        match kind.trim() {
            "anthropic" => Ok(Kind::Anthropic),
            "openai" => Ok(Kind::OpenAi),
            other => Err(format!(
                "A provider is “anthropic” or “openai”, not “{other}”"
            )),
        }
    }
}

/// One provider's model, ready to answer.
#[derive(Clone)]
pub struct HttpModel {
    http: reqwest::Client,
    kind: Kind,
    name: String,
    url: String,
    model: String,
    key: Option<String>,
}

/// Shown without the key.
impl std::fmt::Debug for HttpModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HttpModel")
            .field("kind", &self.kind)
            .field("name", &self.name)
            .field("url", &self.url)
            .field("model", &self.model)
            .field("key", &self.key.as_ref().map(|_| "<hidden>"))
            .finish()
    }
}

impl HttpModel {
    /// `model` (else the provider's own) at `provider`, with its key: the
    /// Anthropic API needs one, a local server may not.
    pub fn new(
        http: reqwest::Client,
        provider: &Provider,
        key: Option<String>,
        model: &str,
    ) -> Result<HttpModel, String> {
        let kind = Kind::of(&provider.kind)?;
        let model = match model.trim() {
            "" => provider.model.trim(),
            chosen => chosen,
        };
        if model.is_empty() {
            return Err(format!("Choose a model for “{}”", provider.name));
        }
        let key = key.map(|k| k.trim().to_owned()).filter(|k| !k.is_empty());
        let url = match kind {
            Kind::Anthropic if key.is_none() => {
                return Err(format!(
                    "No API key for “{}”: add one in Settings",
                    provider.name
                ));
            }
            Kind::Anthropic => anthropic::url(&provider.base_url),
            Kind::OpenAi => openai::url(&provider.base_url)?,
        };
        Ok(HttpModel {
            http,
            kind,
            name: provider.name.clone(),
            url,
            model: model.to_owned(),
            key,
        })
    }

    /// The model this asks.
    pub fn model_name(&self) -> &str {
        &self.model
    }

    fn request(&self, call: &Call<'_>) -> reqwest::RequestBuilder {
        let key = self.key.as_deref().unwrap_or_default();
        let (request, body) = match self.kind {
            Kind::Anthropic => (
                self.http
                    .post(&self.url)
                    .header("x-api-key", key)
                    .header("anthropic-version", anthropic::VERSION),
                anthropic::body(&self.model, ANTHROPIC_MAX_TOKENS, call),
            ),
            Kind::OpenAi if key.is_empty() => (
                self.http.post(&self.url),
                openai::body(&self.url, &self.model, MAX_TOKENS, call),
            ),
            Kind::OpenAi => (
                self.http
                    .post(&self.url)
                    .header(AUTHORIZATION, format!("Bearer {key}")),
                openai::body(&self.url, &self.model, MAX_TOKENS, call),
            ),
        };
        request
            .header(CONTENT_TYPE, "application/json")
            .header(ACCEPT, "text/event-stream")
            .body(body.to_string())
    }

    fn silent(&self) -> String {
        format!(
            "{} sent nothing for {} minutes, so the answer was given up",
            self.name,
            IDLE.as_secs() / 60
        )
    }
}

enum Decoder {
    Anthropic(anthropic::Stream),
    OpenAi(openai::Stream),
}

impl Decoder {
    fn event(&mut self, event: &SseEvent) -> Result<Option<String>, String> {
        match self {
            Decoder::Anthropic(s) => s.event(event),
            Decoder::OpenAi(s) => s.event(event),
        }
    }

    fn ended(&self) -> bool {
        match self {
            Decoder::Anthropic(s) => s.ended(),
            Decoder::OpenAi(s) => s.ended(),
        }
    }

    fn complete(&self) -> bool {
        match self {
            Decoder::Anthropic(s) => s.complete(),
            Decoder::OpenAi(s) => s.complete(),
        }
    }

    fn reply(self, cancelled: bool) -> Reply {
        match self {
            Decoder::Anthropic(s) => s.reply(cancelled),
            Decoder::OpenAi(s) => s.reply(cancelled),
        }
    }

    /// A failure that keeps the text said so far.
    fn failed(self, message: String) -> Failure {
        let partial = self.reply(true);
        Failure {
            message,
            partial: (!partial.text.trim().is_empty()).then_some(partial),
        }
    }
}

enum Waited<T> {
    Done(T),
    Cancelled,
    TimedOut,
}

/// Awaits `future` unless the person stops the turn or nothing happens
/// for `IDLE`.
async fn wait<F: Future>(future: F, cancel: &AtomicBool) -> Waited<F::Output> {
    let mut future = std::pin::pin!(future);
    let mut quiet = Duration::ZERO;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Waited::Cancelled;
        }
        match tokio::time::timeout(TICK, future.as_mut()).await {
            Ok(output) => return Waited::Done(output),
            Err(_) => {
                quiet += TICK;
                if quiet >= IDLE {
                    return Waited::TimedOut;
                }
            }
        }
    }
}

impl Model for HttpModel {
    async fn reply(
        &self,
        call: &Call<'_>,
        text: &(dyn Fn(&str) + Sync),
        cancel: &AtomicBool,
    ) -> Result<Reply, Failure> {
        let mut decoder = match self.kind {
            Kind::Anthropic => Decoder::Anthropic(anthropic::Stream::default()),
            Kind::OpenAi => Decoder::OpenAi(openai::Stream::default()),
        };
        let mut response = match wait(self.request(call).send(), cancel).await {
            Waited::Done(Ok(response)) => response,
            Waited::Done(Err(err)) => {
                return Err(Failure::new(unreachable(&self.name, &self.url, &err)));
            }
            Waited::Cancelled => return Ok(decoder.reply(true)),
            Waited::TimedOut => return Err(Failure::new(self.silent())),
        };
        let status = response.status();
        if !status.is_success() {
            let body = match wait(response.text(), cancel).await {
                Waited::Done(Ok(body)) => body,
                _ => String::new(),
            };
            return Err(Failure::new(http_error(&self.name, status.as_u16(), &body)));
        }
        let mut sse = SseParser::default();
        loop {
            let (events, end) = match wait(response.chunk(), cancel).await {
                Waited::Done(Ok(Some(chunk))) => (sse.push(&chunk), false),
                Waited::Done(Ok(None)) => (sse.finish(), true),
                Waited::Done(Err(err)) => {
                    let why = chain(&err);
                    let message = format!("The connection to {} broke: {why}", self.name);
                    return Err(decoder.failed(message));
                }
                Waited::Cancelled => return Ok(decoder.reply(true)),
                Waited::TimedOut => return Err(decoder.failed(self.silent())),
            };
            if sse.overflowed() {
                let message = format!("{} sent more in one piece than Kasten reads", self.name);
                return Err(decoder.failed(message));
            }
            for event in &events {
                match decoder.event(event) {
                    Ok(Some(piece)) => text(&piece),
                    Ok(None) => {}
                    Err(why) => {
                        let message = format!("{} stopped with an error: {why}", self.name);
                        return Err(decoder.failed(message));
                    }
                }
            }
            if end || decoder.ended() {
                break;
            }
        }
        if !decoder.complete() {
            let message = format!(
                "The connection to {} closed before the answer was complete",
                self.name
            );
            return Err(decoder.failed(message));
        }
        Ok(decoder.reply(false))
    }
}

/// The provider's own words in an error's body, if it has any.
fn said(body: &str) -> String {
    let parsed: Option<Value> = serde_json::from_str(body).ok();
    let words = parsed.as_ref().and_then(|v| {
        [
            v.pointer("/error/message"),
            v.get("message"),
            v.get("detail"),
            v.get("error"),
        ]
        .into_iter()
        .flatten()
        .find_map(Value::as_str)
        .map(str::to_owned)
    });
    let words = words.unwrap_or_else(|| body.trim().chars().take(300).collect());
    words.trim().trim_end_matches('.').to_owned()
}

/// A refused request in words, with what the person can do about it.
pub fn http_error(provider: &str, status: u16, body: &str) -> String {
    let said = said(body);
    let said = if said.is_empty() {
        String::new()
    } else {
        format!(": {said}")
    };
    let hint = match status {
        401 | 403 => ". Check the API key in Settings",
        404 => ". Check the base URL and the model's name",
        408 | 429 | 500..=599 => ". Try again in a moment",
        _ => "",
    };
    format!("{provider} answered {status}{said}{hint}.")
}

/// A request that got no answer, in words, with what to check.
pub fn unreachable(provider: &str, url: &str, err: &dyn std::error::Error) -> String {
    let why = chain(err);
    format!("Could not reach {provider}: {why}{}", reach_hint(url, &why))
}

/// What to check when `url` could not be reached, from the error's words:
/// a local server not started, a certificate, a slow server, a name that
/// does not resolve. Empty when the words say nothing useful.
pub fn reach_hint(url: &str, why: &str) -> &'static str {
    let why = why.to_lowercase();
    let local = reqwest::Url::parse(url).is_ok_and(|u| super::address::loopback(&u));
    if why.contains("timed out") || why.contains("timeout") {
        ". The server took too long to answer; try again in a moment"
    } else if ["certificate", "tls", "ssl", "handshake"]
        .iter()
        .any(|w| why.contains(w))
    {
        ". Its certificate could not be checked: use the https address the provider documents"
    } else if local && (why.contains("refused") || why.contains("connect")) {
        ". Is Ollama or LM Studio running? Start it, then try again"
    } else if ["dns", "lookup", "resolve"].iter().any(|w| why.contains(w)) {
        ". Check the base URL, and that this computer is online"
    } else if why.contains("refused") {
        ". Check the base URL and its port"
    } else {
        ""
    }
}

/// An error and its causes, which say what actually went wrong.
fn chain(err: &dyn std::error::Error) -> String {
    let mut text = err.to_string();
    let mut source = err.source();
    while let Some(cause) = source {
        let words = cause.to_string();
        if !text.contains(&words) {
            text.push_str(": ");
            text.push_str(&words);
        }
        source = cause.source();
    }
    text
}
