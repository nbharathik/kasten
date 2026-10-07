//! Chat threads: each chat's conversation, its agent session and system
//! prompt, kept while the app runs, and the turn running in it, if any. One
//! thread is one session, from its first turn until it is reset.

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use kasten_core::agent::Session;
use kasten_core::{Instant, Kasten, ulid_at};

use super::model::{Message, Model};
use super::turn::{Ending, Turn};
use super::{CLIENT, ChatEvent, ChatRequest, ChatTurn, EventKind, Events, context, prompt};

struct Thread {
    session: Session,
    system: String,
    messages: Vec<Message>,
}

struct Running {
    turn: String,
    cancel: Arc<AtomicBool>,
}

#[derive(Default)]
struct Inner {
    threads: HashMap<String, Thread>,
    running: HashMap<String, Running>,
}

/// Every thread, shared by the commands and the turns they start.
#[derive(Clone, Default)]
pub struct Chats {
    inner: Arc<Mutex<Inner>>,
}

/// A turn begun: its id, its thread's session and prompt, the conversation
/// so far and the flag that stops it.
pub struct Begun {
    pub turn: String,
    pub session: Session,
    pub system: String,
    pub messages: Vec<Message>,
    pub cancel: Arc<AtomicBool>,
}

impl Chats {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Starts a turn in `chat`, and the thread with its session and
    /// prompt if this is its first. One turn at a time per thread.
    pub fn begin(
        &self,
        chat: &str,
        now: Instant,
        system: impl FnOnce() -> String,
    ) -> Result<Begun, String> {
        let mut inner = self.lock();
        if inner.running.contains_key(chat) {
            return Err("This chat is still answering; stop it first".to_owned());
        }
        let thread = inner
            .threads
            .entry(chat.to_owned())
            .or_insert_with(|| Thread {
                session: Session::start(CLIENT, now),
                system: system(),
                messages: Vec::new(),
            });
        let begun = Begun {
            turn: ulid_at(now.millis),
            session: thread.session.clone(),
            system: thread.system.clone(),
            messages: thread.messages.clone(),
            cancel: Arc::new(AtomicBool::new(false)),
        };
        let running = Running {
            turn: begun.turn.clone(),
            cancel: Arc::clone(&begun.cancel),
        };
        inner.running.insert(chat.to_owned(), running);
        Ok(begun)
    }

    /// Ends a turn. Its conversation is kept, unless the thread was reset
    /// while it ran.
    pub fn finish(&self, chat: &str, turn: &str, kept: Option<(&Session, Vec<Message>)>) {
        let mut inner = self.lock();
        if inner.running.get(chat).is_some_and(|r| r.turn == turn) {
            inner.running.remove(chat);
        }
        if let Some((session, messages)) = kept
            && let Some(thread) = inner.threads.get_mut(chat)
            && thread.session.id == session.id
        {
            thread.messages = messages;
        }
    }

    /// Stops the running turn, if there is one.
    pub fn stop(&self, chat: &str) -> bool {
        match self.lock().running.get(chat) {
            Some(running) => {
                running.cancel.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }

    /// Forgets the thread: its next turn starts a new conversation and a
    /// new session, at once. A turn still running is stopped, and what it
    /// had is not kept.
    pub fn reset(&self, chat: &str) {
        let mut inner = self.lock();
        if let Some(running) = inner.running.remove(chat) {
            running.cancel.store(true, Ordering::SeqCst);
        }
        inner.threads.remove(chat);
    }

    /// The thread's conversation, for tests.
    #[cfg(test)]
    pub fn messages(&self, chat: &str) -> Option<Vec<Message>> {
        self.lock().threads.get(chat).map(|t| t.messages.clone())
    }
}

/// The person's day as YYYY-MM-DD, when given well; else today in UTC.
pub fn day(given: Option<&str>) -> String {
    let wanted = given.unwrap_or_default().trim();
    let shaped = wanted.len() == 10
        && wanted.bytes().enumerate().all(|(i, b)| match i {
            4 | 7 => b == b'-',
            _ => b.is_ascii_digit(),
        });
    if shaped {
        wanted.to_owned()
    } else {
        Instant::now().rfc3339()[..10].to_owned()
    }
}

/// Ends a turn that was dropped half way (a panic, the app closing): the
/// thread is free again and the window hears why.
struct Guard {
    chats: Chats,
    events: Arc<dyn Events>,
    chat: String,
    turn: String,
    armed: bool,
}

impl Drop for Guard {
    fn drop(&mut self) {
        if self.armed {
            self.chats.finish(&self.chat, &self.turn, None);
            let mut event = ChatEvent::new(&self.chat, &self.turn, EventKind::Error);
            event.error = Some("The chat stopped unexpectedly".to_owned());
            self.events.emit(event);
        }
    }
}

/// Starts a turn of `request` with `model`: its ids at once, and the work
/// that answers it as events, for the caller to spawn.
pub fn send<M: Model + 'static>(
    chats: &Chats,
    kasten: Arc<Kasten>,
    events: Arc<dyn Events>,
    model: M,
    request: ChatRequest,
) -> Result<(ChatTurn, impl Future<Output = ()> + Send + 'static), String> {
    let chat = request.chat.trim().to_owned();
    if chat.is_empty() {
        return Err("A chat needs an id".to_owned());
    }
    if request.text.trim().is_empty() && request.context.is_empty() {
        return Err("There is nothing to send".to_owned());
    }
    // As with MCP: without history, the chat's changes could not be undone.
    if !kasten.has_history() {
        return Err("This vault keeps no history, so the chat's changes could not be undone. Turn on history in Settings first.".to_owned());
    }
    let today = day(request.date.as_deref());
    let begun = chats.begin(&chat, Instant::now(), || prompt::system(&today))?;
    let answer = ChatTurn {
        chat: chat.clone(),
        session: begun.session.id.clone(),
        turn: begun.turn.clone(),
    };
    let chats = chats.clone();
    // Made before the work is first run, so dropping it unrun frees the thread too.
    let guard = Guard {
        chats: chats.clone(),
        events: Arc::clone(&events),
        chat: chat.clone(),
        turn: begun.turn.clone(),
        armed: true,
    };
    let work = async move {
        // The whole guard, not just the field set below, lives in the work.
        let mut guard = guard;
        let (reader, session) = (Arc::clone(&kasten), begun.session.clone());
        let (chips, text) = (request.context, request.text);
        let message =
            tokio::task::spawn_blocking(move || context::message(&reader, &session, &chips, &text))
                .await
                .unwrap_or_else(|err| format!("(The attached context could not be read: {err})"));
        let tools = kasten_mcp::tools::specs();
        let mut messages = begun.messages;
        let before = messages.len();
        messages.push(Message::User(message));
        let turn = Turn {
            kasten: &kasten,
            session: &begun.session,
            system: &begun.system,
            tools: &tools,
            events: events.as_ref(),
            chat: &chat,
            turn: &begun.turn,
            cancel: &begun.cancel,
        };
        let ending = turn.run(&model, &mut messages).await;
        // A turn that got no answer leaves no trace, so the message can be
        // sent again.
        if messages.len() == before + 1 {
            messages.truncate(before);
        }
        chats.finish(&chat, &begun.turn, Some((&begun.session, messages)));
        guard.armed = false;
        let mut event = ChatEvent::new(&chat, &begun.turn, EventKind::Done);
        match ending {
            Ending::Done { stopped } => event.stopped = Some(stopped),
            Ending::Error(message) => {
                event.kind = EventKind::Error;
                event.error = Some(message);
            }
        }
        events.emit(event);
    };
    Ok((answer, work))
}
