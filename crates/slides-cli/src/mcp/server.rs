//! The MCP server: the agent tools of `slides_core::agent`, over stdio, for a
//! folder of decks. This is only the protocol; what each tool does is in
//! slides-core, and where the decks live is in [`FolderStore`].

use std::sync::{Arc, Mutex};

use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
    ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
    ToolAnnotations,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData, RoleServer, ServerHandler};
use serde_json::{Map, Value};
use slides_core::agent::{self, Agent, ToolOutput, ToolSpec};

use super::store::FolderStore;

/// One connection: what the agent last saw of each deck, and the folder.
struct Session {
    agent: Agent,
    store: FolderStore,
}

#[derive(Clone)]
pub struct SlidesServer {
    session: Arc<Mutex<Session>>,
    tools: Arc<Vec<Tool>>,
    instructions: Arc<String>,
}

fn tool_of(spec: ToolSpec) -> Tool {
    let schema = match spec.input_schema {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    // Nothing a tool does deletes: a deck put aside is kept, a copy is kept
    // before something is removed, and a file is never written over.
    let notes = ToolAnnotations::new()
        .read_only(spec.read_only)
        .destructive(false)
        .open_world(false);
    Tool::new(spec.name, spec.description, Arc::new(schema)).with_annotations(notes)
}

/// What a tool answered, as the protocol carries it: the text, then any pictures.
fn answered(out: ToolOutput) -> CallToolResult {
    let mut content = vec![ContentBlock::text(out.text)];
    for image in out.images {
        content.push(ContentBlock::image(
            agent::base64_encode(&image.bytes),
            image.mime,
        ));
    }
    CallToolResult::success(content)
}

/// A tool error the agent can read and act on.
fn failed(message: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(message.into())])
}

impl SlidesServer {
    pub fn new(store: FolderStore) -> SlidesServer {
        SlidesServer {
            session: Arc::new(Mutex::new(Session {
                agent: Agent::new(),
                store,
            })),
            tools: Arc::new(agent::tools().into_iter().map(tool_of).collect()),
            instructions: Arc::new(agent::instructions()),
        }
    }
}

impl ServerHandler for SlidesServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                "kasten-slides",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(self.instructions.as_str())
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(self.tools.as_ref().clone()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let name = request.name.to_string();
        let args = Value::Object(request.arguments.unwrap_or_default());
        let session = Arc::clone(&self.session);
        // Reading files, laying out and linting are work for a thread of their own.
        let done = tokio::task::spawn_blocking(move || {
            let mut session = session.lock().unwrap_or_else(|p| p.into_inner());
            let Session { agent, store } = &mut *session;
            agent.call(store, &name, args)
        })
        .await;
        let result = match done {
            Ok(Ok(out)) => answered(out),
            Ok(Err(e)) => failed(e.message),
            Err(e) => failed(format!("The tool stopped unexpectedly: {e}")),
        };
        Ok(result.into())
    }
}
