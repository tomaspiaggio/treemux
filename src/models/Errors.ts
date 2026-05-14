import { Data } from "effect"

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
  readonly message: string
  readonly path: string
}> {}

export class ConfigWriteError extends Data.TaggedError("ConfigWriteError")<{
  readonly message: string
  readonly path: string
}> {}

export class GitError extends Data.TaggedError("GitError")<{
  readonly message: string
  readonly command: string
  readonly stderr: string
}> {}

export class WorktreeCreateError extends Data.TaggedError("WorktreeCreateError")<{
  readonly message: string
  readonly repoPath: string
  readonly branch: string
}> {}

export class WorktreeDeleteError extends Data.TaggedError("WorktreeDeleteError")<{
  readonly message: string
  readonly worktreeId: string
}> {}

export class PtySpawnError extends Data.TaggedError("PtySpawnError")<{
  readonly message: string
  readonly command: string
}> {}

export class SetupScriptError extends Data.TaggedError("SetupScriptError")<{
  readonly message: string
  readonly script: string
  readonly exitCode: number
}> {}

export class ProjectNotFoundError extends Data.TaggedError("ProjectNotFoundError")<{
  readonly projectId: string
}> {}
