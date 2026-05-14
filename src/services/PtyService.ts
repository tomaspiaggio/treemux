import { Context, Effect, Layer } from "effect"
import { PtySpawnError } from "../models/Errors.js"
import * as fs from "node:fs"
import * as path from "node:path"
import { StringDecoder } from "node:string_decoder"


export interface PtyHandle {
  readonly worktreeId: string
  readonly terminal: import("@xterm/headless").Terminal
  readonly dirtyLines: Set<number>
  readonly pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

export class PtyService extends Context.Tag("PtyService")<
  PtyService,
  {
    readonly spawn: (params: {
      worktreeId: string
      command: string
      args?: string[]
      cols: number
      rows: number
      cwd: string
    }) => Effect.Effect<PtyHandle, PtySpawnError>
    readonly get: (worktreeId: string) => PtyHandle | undefined
    readonly kill: (worktreeId: string) => Effect.Effect<void>
    readonly resize: (worktreeId: string, cols: number, rows: number) => void
    readonly listActive: () => readonly string[]
  }
>() {}

export const PtyServiceLive = Layer.effect(
  PtyService,
  Effect.gen(function* () {
    const handles = new Map<string, PtyHandle>()

    return {
      spawn: (params) =>
        Effect.gen(function* () {
          const nativeMod = yield* Effect.tryPromise({
            try: async () => {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { loadNativeModule } = require("node-pty/lib/utils.js") as { loadNativeModule: (name: string) => { module: any; dir: string } }
              return loadNativeModule("pty")
            },
            catch: (e) =>
              new PtySpawnError({ message: `Failed to load node-pty native: ${e}`, command: params.command }),
          })

          const xtermMod = yield* Effect.tryPromise({
            try: () => import("@xterm/headless"),
            catch: (e) =>
              new PtySpawnError({ message: `Failed to load @xterm/headless: ${e}`, command: params.command }),
          })

          const ptyNative = nativeMod.module
          const helperPath = path.resolve(
            require.resolve("node-pty"),
            "..",
            nativeMod.dir,
            "spawn-helper",
          )

          const terminal = new xtermMod.Terminal({
            cols: params.cols,
            rows: params.rows,
            allowProposedApi: true,
          })

          const dirtyLines = new Set<number>()

          const env = {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            LANG: "en_US.UTF-8",
          }
          const parsedEnv = Object.entries(env)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${v}`)

          let exited = false
          const term = ptyNative.fork(
            params.command,
            params.args ?? [],
            parsedEnv,
            params.cwd,
            params.cols,
            params.rows,
            -1,
            -1,
            true,
            helperPath,
            (_code: number, _signal: number) => {
              exited = true
            },
          )

          const fd: number = term.fd
          const pid: number = term.pid
          const readBuf = Buffer.alloc(16384)
          // StringDecoder buffers incomplete UTF-8 sequences across reads.
          // Without this, multi-byte chars (─, ·, emojis) split across two
          // polls get corrupted into replacement chars or weird substitutions.
          const decoder = new StringDecoder("utf8")

          const pollInterval = setInterval(() => {
            try {
              const n = fs.readSync(fd, readBuf, { offset: 0, length: 16384 })
              if (n > 0) {
                const data = decoder.write(readBuf.subarray(0, n) as Buffer)
                terminal.write(data)
                for (let i = 0; i < terminal.rows; i++) {
                  dirtyLines.add(i)
                }
              }
            } catch (e: any) {
              if (e.code === "EIO" && exited) {
                clearInterval(pollInterval)
                return
              }
              if (e.code !== "EAGAIN") {
                clearInterval(pollInterval)
              }
            }
          }, 16)

          const handle: PtyHandle = {
            worktreeId: params.worktreeId,
            terminal,
            dirtyLines,
            pid,
            write: (data) => {
              try {
                fs.writeSync(fd, data)
              } catch {}
            },
            resize: (cols, rows) => {
              try {
                ptyNative.resize(fd, cols, rows)
              } catch {}
              terminal.resize(cols, rows)
            },
            kill: () => {
              clearInterval(pollInterval)
              try { process.kill(pid, "SIGTERM") } catch {}
              terminal.dispose()
              handles.delete(params.worktreeId)
            },
          }

          handles.set(params.worktreeId, handle)
          return handle
        }),

      get: (worktreeId) => handles.get(worktreeId),
      kill: (worktreeId) =>
        Effect.sync(() => {
          const handle = handles.get(worktreeId)
          if (handle) handle.kill()
        }),
      resize: (worktreeId, cols, rows) => {
        const handle = handles.get(worktreeId)
        if (handle) handle.resize(cols, rows)
      },
      listActive: () => [...handles.keys()],
    }
  }),
)
