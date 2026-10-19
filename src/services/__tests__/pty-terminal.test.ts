import { expect, test } from "bun:test"
import { Effect } from "effect"
import { tmpdir } from "node:os"
import { PtyService, PtyServiceLive } from "../PtyService.js"

test("terminal queries reach the child and bracketed paste stays a single input", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const pty = yield* PtyService
    const handle = yield* pty.spawn({
      worktreeId: "terminal-query",
      command: process.execPath,
      args: ["-e", `
        process.stdin.setRawMode(true)
        let input = ""
        process.stdin.on("data", chunk => {
          input += chunk.toString()
          if (input.includes("\\x1b[3;7R") && input.includes("\\x1b[201~")) {
            console.log("QUERY_AND_PASTE_OK")
          }
        })
        process.stdout.write("\\x1b[3;7H\\x1b[6n\\x1b[?2004h")
      `],
      cwd: tmpdir(), cols: 80, rows: 24,
    })
    try {
      yield* Effect.promise(() => Bun.sleep(150))
      // Same wire format treemux forwards for a multiline paste.
      handle.write("\x1b[200~first line\nsecond line\x1b[201~")
      let output = ""
      const deadline = Date.now() + 1500
      while (Date.now() < deadline) {
        output = Array.from({ length: handle.terminal.buffer.active.length }, (_, i) =>
          handle.terminal.buffer.active.getLine(i)?.translateToString() ?? "",
        ).join("\n")
        if (output.includes("QUERY_AND_PASTE_OK")) break
        yield* Effect.promise(() => Bun.sleep(20))
      }
      expect(output).toContain("QUERY_AND_PASTE_OK")
    } finally {
      handle.kill()
    }
  }).pipe(Effect.provide(PtyServiceLive)))
})
