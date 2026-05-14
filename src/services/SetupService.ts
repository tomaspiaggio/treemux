import { Context, Effect, Layer } from "effect"
import { SetupScriptError } from "../models/Errors.js"

export class SetupService extends Context.Tag("SetupService")<
  SetupService,
  {
    readonly runSetup: (
      worktreePath: string,
      scripts: readonly string[]
    ) => Effect.Effect<void, SetupScriptError>
  }
>() {}

export const SetupServiceLive = Layer.succeed(SetupService, {
  runSetup: (worktreePath, scripts) =>
    Effect.gen(function* () {
      for (const script of scripts) {
        yield* Effect.tryPromise({
          try: async () => {
            const proc = Bun.spawn(["bash", "-c", script], {
              cwd: worktreePath,
              stdout: "pipe",
              stderr: "pipe",
              env: process.env,
            })
            const exitCode = await proc.exited
            if (exitCode !== 0) {
              const stderr = await new Response(proc.stderr).text()
              throw { exitCode, stderr }
            }
          },
          catch: (e) => {
            const err = e as { exitCode?: number; stderr?: string }
            return new SetupScriptError({
              message: `Setup script failed: ${err.stderr ?? String(e)}`,
              script,
              exitCode: err.exitCode ?? 1,
            })
          },
        })
      }
    }),
})
