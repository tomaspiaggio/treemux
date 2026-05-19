# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow preferences

- **Creating a PR**: when the user says "create a PR", write a nice description (Summary + Test plan), push the branch, and just reply with the PR URL so they can click it. No extra commentary.

## Commands

```bash
bun install              # install (runs a postinstall that chmod+x's node-pty's spawn-helper)
bun run dev              # run the TUI
bun run typecheck        # tsc --noEmit (the only "test"/lint gate; strict mode + noUnusedLocals/Parameters)

# Subcommands (handled before the TUI boots, by src/cli.ts):
bun run dev project add --name <name> --repo <path> [--command claude|codex|opencode|custom] [--custom-command "cmd"] [--setup "cmd"...]
bun run dev project list
bun run dev project remove <id>
```

There are no unit tests. `tsc --noEmit` is the gate.

The app stores all state under `~/.litetree/`:
- `~/.litetree/litetree.db` — SQLite (projects, worktrees, app_settings)
- `~/.litetree/worktrees/<project>/<branch>/` — actual git worktrees

When debugging in a non-TTY context, `process.stdin.setRawMode` is guarded (the app will still start, just won't capture keys).

## Architecture

litetree is a Bun-only TUI that manages git worktrees, each with its own embedded PTY (Claude Code by default). The right panel shows the active worktree's terminal; the left sidebar lists worktrees grouped by project.

### Rendering: raw ANSI, NOT Ink

**The TUI does NOT use Ink, despite Ink being in `dependencies` and there being component files in `src/components/`.** Those `.tsx` files are dead code from a previous iteration. The current renderer is `src/renderer.ts`: a pure function `paintFrame(opts) -> string` that emits cursor-positioned ANSI escape sequences for the whole screen, and `src/app.ts` writes the result to stdout on a `setInterval(33ms)` paint loop.

Why custom ANSI instead of Ink: Ink's `logUpdate` owns stdout via erase+redraw, which is incompatible with running a child PTY whose output also needs to flow to stdout. The custom renderer reads from each PTY's `@xterm/headless` virtual buffer cell-by-cell and writes the result into a designated region of the screen.

Implications when editing rendering code:
- Width/height come from `process.stdout.columns / rows`. `termCols()` accounts for sidebar visibility.
- The paint loop is **dirty-flag-gated**: `paint()` returns early unless `dirty === true` or there's new PTY data. Anything that changes visible state must call `markDirty()`.
- Mouse reporting (`\x1b[?1000h` + SGR `?1006h`) is **toggled per-focus**: enabled in sidebar/modal, disabled in terminal focus so the host's native drag-to-select / Cmd+Click on URLs work without a modifier. With reporting off in alt-screen, the host terminal translates the wheel into bursts of plain arrow-key sequences. `onTerminalInput` detects those bursts (2+ arrows in one chunk OR same-direction arrows within `WHEEL_WINDOW_MS` of each other — faster than auto-repeat) and rewrites them into `setScrollOffset` calls so litetree's own panel scrolls; a single arrow with no recent prior arrow is treated as a real keypress and forwarded to the embedded PTY so option-list navigation still works. Shift+↑/↓ and Shift+PageUp/PageDown also scroll the panel offset directly.
- `?1002h` (button-motion tracking) is intentionally NOT used — it breaks native selection. We get away with click-only + wheel-only reporting.
- Bracketed-paste mode (`?2004h`) is enabled; `onInput` strips the `\x1b[200~`/`\x1b[201~` markers so multi-line pastes arrive as plain text.

### PTY plumbing has a Bun-specific workaround

`src/services/PtyService.ts` does NOT use the `node-pty` high-level API. Bun's `tty.ReadStream` destroys the PTY master file descriptor almost immediately, sending SIGHUP to the child. Instead:

1. Call the native fork directly via `require("node-pty/lib/utils.js").loadNativeModule("pty").module.fork(...)`. This returns `{ fd, pid }`.
2. Read from `fd` with `fs.readSync` in a `setInterval(16ms)` poll loop, feeding bytes into a `StringDecoder` (preserves UTF-8 across read boundaries) and then into the worktree's `@xterm/headless` Terminal.
3. Write to the PTY with `fs.writeSync(fd, data)`.
4. Resize via the native `pty.resize(fd, cols, rows)`.

If you find yourself wanting to "just use `pty.onData(...)`", don't — that goes through the broken `tty.ReadStream`.

### Effect-ts service layout

Composed in `src/index.ts`. Layers:

```
DatabaseService (bun:sqlite, creates projects/worktrees/app_settings tables on boot)
   └── ConfigService (load/save/update the full LitetreeConfig via DB)
         ├── ProjectService.{add,update,remove,list,get}
         └── WorktreeService.{create,remove,archive,restore,rename,list,listArchived,checkMerged}
GitService (Bun.spawn wrappers; removeWorktree does rm -rf + git worktree prune, intentionally bypassing `git worktree remove` because it can hang)
PtyService (the workaround above)
SetupService (runs project setup scripts via Bun.spawn after worktree creation)
```

Errors are tagged via `Data.TaggedError` in `src/models/Errors.ts` and threaded through Effect types.

### App state lives in closures

`src/app.ts`'s `bootstrap()` function holds *all* mutable state as `let`-bindings inside its scope — there is no React, no Redux. Handlers capture them via closure. State buckets to know about:

- **Focus** (`"sidebar" | "terminal" | "modal"`) — drives both input routing and mouse-reporting toggling.
- **`viewMode`** (`"active" | "archived"`) — toggled with `a`; archived view is a separate restore/permanent-delete zone.
- **`worktrees`** — points to either `activeWorktrees` or `archivedWorktrees` depending on `viewMode`. `applyView()` keeps it in sync.
- **`inlineEdit`** — non-null when renaming a worktree in-place from the sidebar.
- **`scrollOffsets: Map<worktreeId, number>`** — per-PTY scroll-back offset (Shift+↑/↓ or wheel).
- **`prNumbers: Map<worktreeId, number | null>`** — async PR detection via `gh pr list`. 30s cache for null, 5min for found, with a 30s background interval.
- **`setupRunning: Set<worktreeId>`** — drives the spinner in the sidebar marker position.
- **`sidebarHidden`** — full-screen terminal mode; toggled by `Ctrl+B`, also auto-set whenever a worktree is opened via `openWorktree()`.

### Single source of truth for "open a worktree"

Every entry point that means "user wants to focus this worktree's terminal" — `Enter`, mouse click, `1`–`9`, `F1`–`F9`, post-create, session restore — calls `openWorktree(wtId)`. That helper persists `last_active_worktree_id`, hides the sidebar, spawns the PTY (or reuses), resizes it, and sets `focus = "terminal"`. Don't duplicate this logic in new handlers; route through `openWorktree`.

### Destructive operations are optimistic

`handlePermanentDelete` mutates `activeWorktrees` + `archivedWorktrees` immediately and shows a "Deleted X" toast, then runs `worktreeSvc.remove(id)` in the background. On failure, the entry is spliced back into its original index and an error modal explains why. If you add another destructive operation, follow this pattern — `git worktree` commands have historically been the slowest/hangiest part of the pipeline.

### Claude session resume

When `defaultCommand === "claude"`, `PtyService.spawn` checks `getSetting("session_started_<wtId>")`. First spawn omits `--continue`; every subsequent spawn appends it, so reopening a worktree picks up the previous Claude conversation in that directory.

### Things that look like bugs but are deliberate

- `process.stdout.write(MOUSE_OFF + ...)` in cleanup only runs if `mouseModeEnabled` is true — we lazily turn mouse on per-focus, so it might never have been enabled.
- The `Ctrl+B` handler in **terminal focus** restores a hidden sidebar AND moves focus there. In **sidebar focus** it hides the sidebar and moves focus to terminal. That asymmetry is intentional — one key handles both directions of the toggle.
- The Ink/React deps in `package.json` are residual. Don't add new components in `src/components/` — extend `renderer.ts` instead.
