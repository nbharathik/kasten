## Install

| System | File |
| --- | --- |
| Windows 10 and 11 | `Kasten_*_x64-setup.exe` (or the `.msi`) |
| macOS 12 or later, Apple silicon | `Kasten_*_aarch64.dmg` |
| macOS 12 or later, Intel | `Kasten_*_x64.dmg` |
| Debian, Ubuntu | `Kasten_*_amd64.deb`: `sudo apt install ./Kasten_*_amd64.deb` |
| Fedora, openSUSE | `Kasten-*.x86_64.rpm`: `sudo dnf install ./Kasten-*.x86_64.rpm` |

These builds are not code-signed yet. Windows may say "Windows protected
your PC": choose **More info**, then **Run anyway**. macOS may refuse to
open Kasten the first time: open **System Settings → Privacy & Security**
and choose **Open Anyway**.

`SHA256SUMS.txt` lists every file's checksum.

## Connect AI agents

The installed app is its own MCP server: `kasten-app --mcp --vault <folder>`.
Settings → AI agents copies the exact command for Claude Code and the
`mcpServers` entry for Claude Desktop and other MCP apps.

The `kasten-cli-*` archives hold the `kasten` command-line tool (capture,
search, verify, history, restore, review and undo agent sessions) and the
standalone `kasten-mcp` server.
