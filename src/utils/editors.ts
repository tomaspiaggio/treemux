import { execSync } from "child_process"
import { existsSync } from "fs"

export interface EditorOption {
  name: string
  cmd: string
  args: string[]
  // When set on darwin, used as a fallback if `cmd` is not on PATH.
  // We launch the .app bundle via `open -na "<App Name>" --args <path>`.
  macAppName?: string
}

const KNOWN_EDITORS: EditorOption[] = [
  { name: "Cursor", cmd: "cursor", args: ["--new-window"], macAppName: "Cursor" },
  { name: "VS Code", cmd: "code", args: ["--new-window"], macAppName: "Visual Studio Code" },
  { name: "Zed", cmd: "zed", args: [], macAppName: "Zed" },
  { name: "IntelliJ IDEA", cmd: "idea", args: [], macAppName: "IntelliJ IDEA" },
  { name: "WebStorm", cmd: "webstorm", args: [], macAppName: "WebStorm" },
  { name: "Neovim", cmd: "nvim", args: [] },
  { name: "Vim", cmd: "vim", args: [] },
  { name: "Nano", cmd: "nano", args: [] },
]

function macAppExists(appName: string): boolean {
  return (
    existsSync(`/Applications/${appName}.app`) ||
    existsSync(`${process.env.HOME}/Applications/${appName}.app`)
  )
}

export function detectEditors(): EditorOption[] {
  const found: EditorOption[] = []
  for (const editor of KNOWN_EDITORS) {
    try {
      execSync(`which ${editor.cmd}`, { stdio: "ignore" })
      found.push(editor)
      continue
    } catch { /* CLI not on PATH */ }

    if (process.platform === "darwin" && editor.macAppName && macAppExists(editor.macAppName)) {
      found.push(editor)
    }
  }
  return found
}

export function openEditor(editor: EditorOption, path: string): void {
  const { spawn } = require("child_process")

  let cmd = editor.cmd
  let args = [...editor.args, path]

  if (process.platform === "darwin" && editor.macAppName) {
    let cliAvailable = false
    try {
      execSync(`which ${editor.cmd}`, { stdio: "ignore" })
      cliAvailable = true
    } catch { /* fall through to app-bundle */ }

    if (!cliAvailable) {
      cmd = "open"
      args = ["-na", editor.macAppName, "--args", path]
    }
  }

  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref()
}
