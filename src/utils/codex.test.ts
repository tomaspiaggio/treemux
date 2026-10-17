import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildCodexArgs } from "./codex.js"
import { ensureCodexConfigured } from "../mcp/install.js"
import { buildCreatePrPrompt } from "../mcp/tools.js"

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const tempHome = () => {
  const dir = mkdtempSync(join(tmpdir(), "treemux-codex-test-"))
  dirs.push(dir)
  return dir
}

test("Codex launches with explicit permissions and cwd-scoped resume", () => {
  const fresh = buildCodexArgs("http://127.0.0.1:1234/mcp", false)
  expect(fresh).not.toContain("--full-auto")
  expect(fresh).not.toContain("resume")
  expect(fresh).toContain("--no-alt-screen")
  expect(fresh).toContain("--no-daemon")
  expect(fresh.slice(0, 4)).toEqual(["--sandbox", "workspace-write", "--ask-for-approval", "on-request"])
  const resumed = buildCodexArgs("http://127.0.0.1:1234/mcp", true)
  expect(resumed.slice(-2)).toEqual(["resume", "--last"])
  expect(resumed).not.toContain("--all")
})

test("launch overrides are valid TOML and keep tokens out of argv", () => {
  const args = buildCodexArgs("http://127.0.0.1:5678/mcp", false)
  const overrides = args.flatMap((arg, i) => arg === "-c" ? [args[i + 1]!] : [])
  const config = Bun.TOML.parse(overrides.join("\n")) as {
    developer_instructions: string
    mcp_servers: { treemux: { url: string; enabled: boolean; env_http_headers: Record<string, string> } }
  }
  expect(config.mcp_servers.treemux.url).toBe("http://127.0.0.1:5678/mcp")
  expect(config.mcp_servers.treemux.env_http_headers).toEqual({ "X-Treemux-Token": "TREEMUX_TOKEN" })
  expect(config.mcp_servers.treemux.enabled).toBe(true)
  expect(config.developer_instructions).toContain("get_context")
  expect(config.developer_instructions).toContain("report_pr")
})

test("legacy global instructions are removed without touching user guidance or config", () => {
  const dir = tempHome()
  const config = 'model = "user-model"\n'
  writeFileSync(join(dir, "config.toml"), config)
  writeFileSync(join(dir, "AGENTS.md"), "Before\n<!-- treemux:mcp:start -->\nold instructions\n<!-- treemux:mcp:end -->\nAfter\n")
  ensureCodexConfigured(dir)
  ensureCodexConfigured(dir)
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("Before\n\nAfter\n")
  expect(readFileSync(join(dir, "config.toml"), "utf8")).toBe(config)
})

test("Codex setup does not create global instruction files", () => {
  const dir = tempHome()
  ensureCodexConfigured(dir)
  expect(existsSync(join(dir, "AGENTS.md"))).toBe(false)
  writeFileSync(join(dir, "AGENTS.md"), "User instructions\n")
  ensureCodexConfigured(dir)
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("User instructions\n")
})

test("Codex setup honors CODEX_HOME and preserves an incomplete legacy section", () => {
  const dir = tempHome()
  const previous = process.env.CODEX_HOME
  const text = "User instructions\n<!-- treemux:mcp:start -->\nunfinished section\n"
  writeFileSync(join(dir, "AGENTS.md"), text)
  try {
    process.env.CODEX_HOME = dir
    ensureCodexConfigured()
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe(text)
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previous
  }
})

test("the Codex PR prompt includes the project base and conventions", () => {
  const prompt = buildCreatePrPrompt({
    worktreeId: "wt", branchName: "fix/codex", worktreePath: "/tmp/wt",
    projectName: "test", prNumber: null, hasPR: false, baseBranch: "develop",
    branchNameIsGenerated: false, defaultCommand: "codex", prInstructions: "Use a conventional title.",
  })
  expect(prompt).toContain("`develop`")
  expect(prompt).toContain("Use a conventional title.")
  expect(prompt).toContain("report_pr")
  expect(prompt).not.toContain("/mcp__")
})
