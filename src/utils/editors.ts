import { execSync } from "child_process"

export interface EditorOption {
  name: string
  cmd: string
  args: string[]
}

const KNOWN_EDITORS: EditorOption[] = [
  { name: "Cursor", cmd: "cursor", args: ["--new-window"] },
  { name: "VS Code", cmd: "code", args: ["--new-window"] },
  { name: "Zed", cmd: "zed", args: [] },
  { name: "IntelliJ IDEA", cmd: "idea", args: [] },
  { name: "WebStorm", cmd: "webstorm", args: [] },
  { name: "Neovim", cmd: "nvim", args: [] },
  { name: "Vim", cmd: "vim", args: [] },
  { name: "Nano", cmd: "nano", args: [] },
]

export function detectEditors(): EditorOption[] {
  const found: EditorOption[] = []
  for (const editor of KNOWN_EDITORS) {
    try {
      execSync(`which ${editor.cmd}`, { stdio: "ignore" })
      found.push(editor)
    } catch { /* not found */ }
  }
  return found
}

export function openEditor(editor: EditorOption, path: string): void {
  const { spawn } = require("child_process")
  spawn(editor.cmd, [...editor.args, path], { detached: true, stdio: "ignore" }).unref()
}
