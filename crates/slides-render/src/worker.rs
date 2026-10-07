//! The thread the browser is driven from. The rest of the program is not asynchronous, and the browser's protocol
//! is, so the browser lives on a thread of its own with a small runtime, and callers hand it one job at a time
//! and wait for the answer. It works from any thread, including a runtime's blocking threads.

use std::sync::Arc;
use std::sync::mpsc::{Sender, SyncSender, channel, sync_channel};
use std::thread::{Builder, JoinHandle};
use std::time::Duration;

use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};
use tokio::time::timeout;

use crate::error::{Error, Result};
use crate::jobs::{self, Reply, Request};
use crate::launch::Config;
use crate::serve::Shared;
use crate::session::Session;

pub struct Job {
    pub request: Request,
    pub reply: Sender<Result<Reply>>,
}

/// Runs one request, starting a browser if there is none, and starting a fresh one once if the browser died on the way.
async fn serve_job(
    session: &mut Option<Session>,
    config: &Config,
    shared: &Arc<Shared>,
    request: &Request,
) -> Result<Reply> {
    for attempt in 0..2 {
        if session.is_none() {
            *session = Some(Session::launch(config, Arc::clone(shared)).await?);
        }
        let Some(live) = session.as_mut() else {
            return Err(Error::Closed);
        };
        // What the last render noted is not this one's.
        drop(shared.take_notes());
        let result = jobs::handle(live, request).await;
        if let Err(Error::Browser(_)) = &result {
            // A browser that failed may be wedged or gone: this one is not used again.
            let dead = live.is_dead();
            if let Some(broken) = session.take() {
                broken.close().await;
            }
            if dead && attempt == 0 {
                continue;
            }
        }
        return result;
    }
    Err(Error::Closed)
}

async fn run_jobs(
    config: Config,
    shared: Arc<Shared>,
    idle: Option<Duration>,
    mut jobs: UnboundedReceiver<Job>,
    ready: SyncSender<Result<()>>,
) {
    let mut session = match Session::launch(&config, Arc::clone(&shared)).await {
        Ok(session) => {
            let _ = ready.send(Ok(()));
            Some(session)
        }
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    loop {
        let next = match (idle, session.is_some()) {
            (Some(after), true) => match timeout(after, jobs.recv()).await {
                Ok(job) => job,
                Err(_) => {
                    // Nobody has asked for a while: give the memory back. The next job starts a browser again.
                    if let Some(idle) = session.take() {
                        idle.close().await;
                    }
                    continue;
                }
            },
            _ => jobs.recv().await,
        };
        let Some(job) = next else {
            break;
        };
        let result = serve_job(&mut session, &config, &shared, &job.request).await;
        let _ = job.reply.send(result);
    }
    if let Some(session) = session {
        session.close().await;
    }
}

/// Starts the thread and its first browser; waits until the browser is ready, or says why it could not be.
pub fn spawn(
    config: Config,
    shared: Arc<Shared>,
    idle: Option<Duration>,
) -> Result<(UnboundedSender<Job>, JoinHandle<()>)> {
    let (send, receive) = unbounded_channel();
    let (ready_send, ready_wait) = sync_channel(1);
    let handle = Builder::new()
        .name("slides-render".to_owned())
        .spawn(move || {
            match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(runtime) => {
                    runtime.block_on(run_jobs(config, shared, idle, receive, ready_send))
                }
                Err(e) => {
                    let _ = ready_send.send(Err(Error::Launch(format!(
                        "no room to run the browser's driver: {e}"
                    ))));
                }
            }
        })
        .map_err(|e| Error::Launch(format!("no thread to run the browser's driver: {e}")))?;
    match ready_wait.recv() {
        Ok(Ok(())) => Ok((send, handle)),
        Ok(Err(e)) => {
            let _ = handle.join();
            Err(e)
        }
        Err(_) => {
            let _ = handle.join();
            Err(Error::Closed)
        }
    }
}

/// Hands a request to the thread and waits for its answer.
pub fn call(jobs: &UnboundedSender<Job>, request: Request) -> Result<Reply> {
    let (reply, wait) = channel();
    jobs.send(Job { request, reply })
        .map_err(|_| Error::Closed)?;
    wait.recv().map_err(|_| Error::Closed)?
}
