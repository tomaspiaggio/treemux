// Explicit, local-only smoke test. Requires Codex on PATH; no login or model
// requests. Uses a disposable CODEX_HOME and an in-memory treemux database.
import { Database } from "bun:sqlite"
import { Effect, Layer } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseService } from "../src/services/DatabaseService.js"
import { McpService, McpServiceLive } from "../src/services/McpService.js"
import { PtyService, PtyServiceLive } from "../src/services/PtyService.js"
import { buildCodexArgs } from "../src/utils/codex.js"
import type { McpEvent } from "../src/mcp/tools.js"

const codex = Bun.which("codex")
if (!codex) throw new Error("Install Codex CLI and put it on PATH before running this smoke test")
const home = mkdtempSync(join(tmpdir(), "treemux-codex-smoke-"))
const db = new Database(":memory:")
db.exec("CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
const services = Layer.mergeAll(
  PtyServiceLive,
  McpServiceLive.pipe(Layer.provide(Layer.succeed(DatabaseService, { db }))),
)
try {
  await Effect.runPromise(Effect.gen(function* () {
    const mcp = yield* McpService
    const pty = yield* PtyService
    const args = buildCodexArgs(mcp.url, false)
    const env = { ...process.env, CODEX_HOME: home, TREEMUX_TOKEN: mcp.tokenFor("smoke") }
    const events: McpEvent[] = []
    mcp.onEvent(event => events.push(event))
    mcp.setContextProvider(worktreeId => ({
      worktreeId, branchName: "fix/codex-smoke", worktreePath: home,
      projectName: "smoke", prNumber: null, hasPR: false, baseBranch: "main",
      branchNameIsGenerated: false, defaultCommand: "codex",
    }))
    // Both launch paths must be accepted by the actual installed parser.
    for (const resumed of [false, true]) {
      const result = Bun.spawnSync([codex, ...buildCodexArgs(mcp.url, resumed), "--help"], { env })
      if (result.exitCode !== 0) throw new Error(result.stderr.toString())
    }
    console.log("PASS: installed Codex accepts fresh and resume arguments")

    // Ask the real Codex MCP client to discover treemux tools. This validates
    // TOML parsing, environment-header authentication and HTTP negotiation.
    const overrides = args.flatMap((arg, i) => arg === "-c" ? [arg, args[i + 1]!] : [])
    const child = Bun.spawn([codex, "app-server", ...overrides], { env, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
    const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>()
    let nextId = 0
    const reader = (async () => {
      let buffer = ""
      const decoder = new TextDecoder()
      for await (const chunk of child.stdout) {
        buffer += decoder.decode(chunk, { stream: true })
        let newline: number
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const msg = JSON.parse(buffer.slice(0, newline))
          buffer = buffer.slice(newline + 1)
          const waiter = pending.get(msg.id)
          if (!waiter) continue
          pending.delete(msg.id)
          if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)))
          else waiter.resolve(msg.result)
        }
      }
    })()
    const request = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
      const id = ++nextId
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 15000)
      pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value) },
        reject: error => { clearTimeout(timeout); reject(error) },
      })
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n")
    })
    try {
      yield* Effect.promise(async () => {
        await request("initialize", { clientInfo: { name: "treemux-smoke", version: "1" } })
        child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n")
        const result = await request("mcpServerStatus/list", {})
        const server = result.data.find((s: { name: string }) => s.name === "treemux")
        if (!server?.tools?.get_context || !server?.tools?.report_pr || !server?.tools?.set_status) {
          throw new Error(`Codex couldn't discover treemux tools: ${JSON.stringify(result)}`)
        }
        console.log(`PASS: real Codex discovers ${Object.keys(server.tools).length} authenticated treemux tools`)
        const { thread } = await request("thread/start", { cwd: home, ephemeral: true })
        const context = await request("mcpServer/tool/call", {
          threadId: thread.id, server: "treemux", tool: "get_context", arguments: {},
        })
        if (context.isError || !JSON.stringify(context.content).includes("fix/codex-smoke")) {
          throw new Error(`Wrong worktree context: ${JSON.stringify(context)}`)
        }
        for (const [tool, arguments_] of [["set_status", { status: "working" }], ["report_pr", { number: 42 }]] as const) {
          const result = await request("mcpServer/tool/call", {
            threadId: thread.id, server: "treemux", tool, arguments: arguments_,
          })
          if (result.isError) throw new Error(`Tool failed: ${JSON.stringify(result)}`)
        }
        if (!events.some(e => e.kind === "set_status" && e.worktreeId === "smoke") ||
            !events.some(e => e.kind === "report_pr" && e.worktreeId === "smoke")) {
          throw new Error("Codex tool calls didn't reach treemux's worktree event handler")
        }
        console.log("PASS: Codex reads worktree context and reports status/PR events through MCP")
      })
    } finally {
      child.kill()
      yield* Effect.promise(async () => { await child.exited; await reader })
    }

    // Exercise the actual interactive TUI through treemux's native PTY and
    // headless terminal. No prompt is sent, so this cannot start a model turn.
    const handle = yield* pty.spawn({
      worktreeId: "smoke", command: codex, args, cwd: home,
      cols: 100, rows: 30, env,
    })
    try {
      yield* Effect.promise(() => Bun.sleep(2500))
      const output = Array.from({ length: handle.terminal.buffer.active.length }, (_, i) =>
        handle.terminal.buffer.active.getLine(i)?.translateToString() ?? "",
      ).join("\n")
      if (!/Codex|Sign in|OpenAI/i.test(output) || /unexpected argument|Error loading config/i.test(output)) {
        throw new Error(`Codex didn't render its startup screen: ${output}`)
      }
      console.log("PASS: interactive Codex renders inside treemux's PTY")
    } finally {
      handle.kill()
      // Ensure the smoke process itself can't leave an interactive CLI behind.
      try { process.kill(-handle.pid, "SIGKILL") } catch {}
    }
  }).pipe(Effect.provide(services), Effect.scoped))
} finally {
  db.close()
  rmSync(home, { recursive: true, force: true })
}
