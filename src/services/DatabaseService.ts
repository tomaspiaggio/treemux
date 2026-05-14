import { Context, Effect, Layer } from "effect"
import { Database } from "bun:sqlite"
import { mkdir } from "node:fs/promises"
import { paths } from "../utils/paths.js"
import { ConfigWriteError } from "../models/Errors.js"

const DB_PATH = paths.root + "/litetree.db"

export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  {
    readonly db: Database
  }
>() {}

export const DatabaseServiceLive = Layer.scoped(
  DatabaseService,
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () => mkdir(paths.root, { recursive: true }),
      catch: (e) =>
        new ConfigWriteError({
          message: `Failed to create data dir: ${e}`,
          path: paths.root,
        }),
    })

    const db = new Database(DB_PATH)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("PRAGMA foreign_keys = ON")

    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        repo_path TEXT NOT NULL,
        setup_script TEXT NOT NULL DEFAULT '[]',
        default_command TEXT NOT NULL DEFAULT 'claude',
        custom_command TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS worktrees (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        branch_name TEXT NOT NULL,
        path TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        sort_order INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_worktrees_project ON worktrees(project_id)
    `)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_worktrees_status ON worktrees(status)
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        db.close()
      })
    )

    return { db }
  })
)
