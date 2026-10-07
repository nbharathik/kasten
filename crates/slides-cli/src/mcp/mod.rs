//! `slides mcp [--folder DIR]`: the agent tools over stdio, for the decks in a
//! folder. An agent (Claude Code, Claude Desktop, any MCP client) starts it
//! and builds decks with the same operations the editor uses.

mod server;
mod store;

use std::path::Path;

use rmcp::ServiceExt;

use crate::args::Args;
use crate::commands::Failure;

use server::SlidesServer;
use store::FolderStore;

/// The folder the decks are in: `--folder`, else the one named after the command, else here.
fn folder_of(args: &Args) -> &str {
    args.value("folder")
        .or_else(|| args.positional.get(1).map(String::as_str))
        .unwrap_or(".")
}

/// Starts listening for Ctrl-C and, where there is one, SIGTERM, and gives what resolves when one comes.
/// Called before anything else is done, so that a signal in the first moments, or while no client has
/// spoken yet, finds the program listening and is answered by stopping in order, not by being killed.
#[cfg(unix)]
fn asked_to_stop() -> impl std::future::Future<Output = ()> {
    use tokio::signal::unix::{SignalKind, signal};
    let term = signal(SignalKind::terminate());
    let interrupt = signal(SignalKind::interrupt());
    async move {
        match (term, interrupt) {
            (Ok(mut term), Ok(mut interrupt)) => tokio::select! {
                _ = term.recv() => {}
                _ = interrupt.recv() => {}
            },
            // A signal that cannot be listened for is no reason not to serve.
            (Ok(mut one), Err(_)) | (Err(_), Ok(mut one)) => {
                one.recv().await;
            }
            (Err(_), Err(_)) => std::future::pending().await,
        }
    }
}

#[cfg(not(unix))]
async fn asked_to_stop() {
    let _ = tokio::signal::ctrl_c().await;
}

pub fn run(args: &Args) -> Result<(), Failure> {
    let store = FolderStore::open(Path::new(folder_of(args))).map_err(Failure::Error)?;
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .map_err(|e| Failure::Error(e.to_string()))?;
    let served = runtime.block_on(async move {
        let stop = asked_to_stop();
        // From the client's first word until it hangs up, or until the program is told to stop, at any point.
        tokio::select! {
            done = async {
                let running = SlidesServer::new(store)
                    .serve(rmcp::transport::stdio())
                    .await
                    .map_err(|e| e.to_string())?;
                running.waiting().await.map(|_| ()).map_err(|e| e.to_string())
            } => done,
            () = stop => Ok(()),
        }
    });
    // A browser is not stopped by the program that started it ending: let go of the one the tools drew with.
    slides_render::shutdown();
    // Reading standard input cannot be interrupted, so a program told to stop while it waits for the client must not wait for it.
    runtime.shutdown_timeout(std::time::Duration::from_secs(1));
    served.map_err(Failure::Error)
}
