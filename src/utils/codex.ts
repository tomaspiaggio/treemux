import { buildAppendSystemPrompt } from "../mcp/install.js"

// Per-process overrides keep worktrees and concurrent treemux instances from
// sharing MCP credentials or writing over the user's Codex configuration.
export function buildCodexArgs(mcpUrl: string, resumed: boolean): string[] {
  const args = [
    "--sandbox", "workspace-write",
    "--ask-for-approval", "on-request",
    "--no-alt-screen",
    // Keep the MCP client's environment and lifecycle owned by this PTY.
    "--no-daemon",
    "-c", `mcp_servers.treemux.url=${JSON.stringify(mcpUrl)}`,
    "-c", 'mcp_servers.treemux.env_http_headers={ "X-Treemux-Token" = "TREEMUX_TOKEN" }',
    "-c", "mcp_servers.treemux.enabled=true",
    "-c", `developer_instructions=${JSON.stringify(buildAppendSystemPrompt())}`,
  ]
  // --last is scoped to the child cwd; never use --all across worktrees.
  // Codex starts a new conversation if there isn't a saved session yet.
  if (resumed) args.push("resume", "--last")
  return args
}
