import { join } from "node:path"
import { homedir } from "node:os"

const TREEMUX_DIR = join(homedir(), ".treemux")

export const paths = {
  root: TREEMUX_DIR,
  config: join(TREEMUX_DIR, "config.json"),
  worktrees: join(TREEMUX_DIR, "worktrees"),
  worktree: (projectName: string, branch: string) =>
    join(TREEMUX_DIR, "worktrees", projectName, branch),
} as const
