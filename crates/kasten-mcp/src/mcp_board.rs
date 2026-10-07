//! The whiteboard tools over MCP: their descriptions and schemas for
//! `tools/list`, each run by its implementation in `tools`.

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::service::{RequestContext, RoleServer};
use rmcp::{tool, tool_router};

use crate::params::*;
use crate::server::KastenServer;
use crate::tools;

#[tool_router(router = board_tools, vis = "pub")]
impl KastenServer {
    #[tool(
        description = "Every whiteboard with its title, project and number of nodes.",
        annotations(read_only_hint = true)
    )]
    async fn list_boards(&self) -> CallToolResult {
        self.run(tools::list_boards).await
    }

    #[tool(
        description = "A whiteboard's nodes (cards with their note titles, stickies, sections, links) and connections.",
        annotations(read_only_hint = true)
    )]
    async fn read_board(&self, Parameters(a): Parameters<BoardArgs>) -> CallToolResult {
        self.run(move |k| tools::read_board(k, a)).await
    }

    #[tool(description = "A new, empty whiteboard in a project or the library.")]
    async fn create_board(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(a): Parameters<CreateBoardArgs>,
    ) -> CallToolResult {
        self.agent(&context, move |k| tools::create_board(k, a))
            .await
    }

    #[tool(
        description = "Puts notes on a whiteboard as cards, laid out in a grid, clustered by tag, or at given positions."
    )]
    async fn add_to_board(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(a): Parameters<AddToBoardArgs>,
    ) -> CallToolResult {
        self.agent(&context, move |k| tools::add_to_board(k, a))
            .await
    }

    #[tool(
        description = "Draws an arrow between two nodes on a whiteboard, with an optional label."
    )]
    async fn connect(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(a): Parameters<ConnectArgs>,
    ) -> CallToolResult {
        self.agent(&context, move |k| tools::connect(k, a)).await
    }

    #[tool(description = "Gathers nodes on a whiteboard into a titled section.")]
    async fn group_on_board(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(a): Parameters<GroupArgs>,
    ) -> CallToolResult {
        self.agent(&context, move |k| tools::group_on_board(k, a))
            .await
    }
}
