import { join } from "node:path"
import { homedir } from "node:os"

const LITETREE_DIR = join(homedir(), ".litetree")

export const paths = {
  root: LITETREE_DIR,
  config: join(LITETREE_DIR, "config.json"),
  worktrees: join(LITETREE_DIR, "worktrees"),
  worktree: (projectName: string, branch: string) =>
    join(LITETREE_DIR, "worktrees", projectName, branch),
} as const
