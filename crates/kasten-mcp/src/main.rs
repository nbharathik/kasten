//! `kasten-mcp`: the MCP server over kasten-core. Claude Code and Claude
//! Desktop use stdio: `kasten-mcp --vault ~/vault`. Other clients use
//! streamable HTTP on 127.0.0.1 with a bearer token:
//! `kasten-mcp --vault ~/vault --http`.

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    kasten_mcp::run(&args)
}
