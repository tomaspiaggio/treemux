import { Context, Effect, Layer } from "effect"
import { GitError } from "../models/Errors.js"

const runGit = (args: string[], cwd: string): Effect.Effect<string, GitError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["git", ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      if (exitCode !== 0) {
        throw { stderr, exitCode }
      }
      return stdout.trim()
    },
    catch: (e) => {
      const err = e as { stderr?: string; exitCode?: number }
      return new GitError({
        message: `git ${args.join(" ")} failed (exit ${err.exitCode ?? "?"})`,
        command: `git ${args.join(" ")}`,
        stderr: err.stderr ?? String(e),
      })
    },
  })

export class GitService extends Context.Tag("GitService")<
  GitService,
  {
    readonly addWorktree: (
      repoPath: string,
      destPath: string,
      branch: string,
      baseBranch: string
    ) => Effect.Effect<void, GitError>
    readonly removeWorktree: (
      repoPath: string,
      worktreePath: string
    ) => Effect.Effect<void, GitError>
    readonly isBranchMerged: (
      repoPath: string,
      branch: string,
      into?: string
    ) => Effect.Effect<boolean, GitError>
    readonly listBranches: (repoPath: string) => Effect.Effect<readonly string[], GitError>
  }
>() {}

export const GitServiceLive = Layer.succeed(GitService, {
  addWorktree: (repoPath, destPath, branch, baseBranch) =>
    runGit(["worktree", "add", "-b", branch, destPath, baseBranch], repoPath).pipe(
      Effect.asVoid
    ),

  removeWorktree: (repoPath, worktreePath) =>
    runGit(["worktree", "remove", "--force", worktreePath], repoPath).pipe(Effect.asVoid),

  isBranchMerged: (repoPath, branch, into = "main") =>
    runGit(["branch", "--merged", into], repoPath).pipe(
      Effect.map((output) =>
        output
          .split("\n")
          .map((line) => line.trim().replace(/^\*\s*/, ""))
          .includes(branch)
      )
    ),

  listBranches: (repoPath) =>
    runGit(["branch", "--format=%(refname:short)"], repoPath).pipe(
      Effect.map((output) => output.split("\n").filter((b) => b.length > 0))
    ),
})
