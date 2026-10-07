//! The deck tools as routes of the MCP server. They are not written out one
//! by one like the note tools: each route is made from slides-core's list of
//! tools, so a new operation of the deck engine becomes a tool here with no
//! change to this crate.

use std::sync::Arc;

use kasten_core::agent::Session;
use rmcp::handler::server::router::tool::{ToolRoute, ToolRouter};
use rmcp::handler::server::tool::ToolCallContext;
use rmcp::model::{CallToolResult, ContentBlock, Tool, ToolAnnotations};
use serde_json::{Map, Value};
use slides_core::agent::{self, ToolSpec};

use super::adapt;
use super::run::{Reply, call};
use crate::server::{KastenServer, failed};

/// A tool as the protocol lists it. Nothing a deck tool does deletes, and none
/// reaches outside the vault.
fn tool_of(spec: &ToolSpec) -> Tool {
    let schema = match &spec.input_schema {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    };
    let notes = ToolAnnotations::new()
        .read_only(spec.read_only)
        .destructive(false)
        .open_world(false);
    Tool::new(
        spec.name.clone(),
        spec.description.clone(),
        Arc::new(schema),
    )
    .with_annotations(notes)
}

/// What a deck tool answered, as the protocol carries it: the text, then any pictures.
fn result_of(reply: Reply) -> CallToolResult {
    let mut content = vec![ContentBlock::text(reply.text)];
    for image in reply.images {
        content.push(ContentBlock::image(
            agent::base64_encode(&image.bytes),
            image.mime,
        ));
    }
    CallToolResult::success(content)
}

impl KastenServer {
    /// Every deck tool.
    pub fn deck_tools() -> ToolRouter<KastenServer> {
        let mut router = ToolRouter::new();
        for spec in adapt::specs() {
            let name: Arc<str> = Arc::from(spec.name.as_str());
            let read_only = spec.read_only;
            router.add_route(ToolRoute::new_dyn(
                tool_of(spec),
                move |ctx: ToolCallContext<'_, KastenServer>| {
                    let name = Arc::clone(&name);
                    Box::pin(async move {
                        let args = Value::Object(ctx.arguments.unwrap_or_default());
                        // A look starts no session; the first change starts the client's.
                        let session =
                            (!read_only).then(|| ctx.service.session(&ctx.request_context));
                        Ok(ctx.service.run_deck(session, name, args).await.into())
                    })
                },
            ));
        }
        router
    }

    /// Runs a deck tool off the async threads: reading a deck, laying it out
    /// and linting it are work for a thread of their own.
    async fn run_deck(
        &self,
        session: Option<Session>,
        name: Arc<str>,
        args: Value,
    ) -> CallToolResult {
        let kasten = Arc::clone(&self.kasten);
        let done =
            tokio::task::spawn_blocking(move || call(&kasten, session.as_ref(), &name, args)).await;
        match done {
            Ok(Ok(reply)) => result_of(reply),
            Ok(Err(message)) => failed(message),
            Err(error) => failed(format!("The tool stopped unexpectedly: {error}")),
        }
    }
}
