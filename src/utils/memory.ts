import { spawn } from "node:child_process"

export interface MemorySample {
  // Bytes of RSS per worktree (sum of the PTY process tree).
  perWorktree: Map<string, number>
  // Sum across every tracked worktree, in bytes.
  total: number
}

// Single `ps` invocation gives us every process; we walk the ppid graph
// from each PTY root in JS instead of spawning N times.
export async function sampleMemory(
  ptyPidByWorktree: ReadonlyMap<string, number>,
): Promise<MemorySample> {
  if (ptyPidByWorktree.size === 0) {
    return { perWorktree: new Map(), total: 0 }
  }

  const stdout = await runPs()
  if (!stdout) return { perWorktree: new Map(), total: 0 }

  // ppid -> children pids
  const childrenOf = new Map<number, number[]>()
  // pid -> rssKb
  const rssOf = new Map<number, number>()

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 3) continue
    const pid = parseInt(parts[0]!, 10)
    const ppid = parseInt(parts[1]!, 10)
    const rss = parseInt(parts[2]!, 10)
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(rss)) continue
    rssOf.set(pid, rss)
    const arr = childrenOf.get(ppid)
    if (arr) arr.push(pid)
    else childrenOf.set(ppid, [pid])
  }

  const perWorktree = new Map<string, number>()
  let total = 0
  for (const [wtId, rootPid] of ptyPidByWorktree) {
    // BFS the process tree rooted at the PTY pid. The PTY's own RSS
    // counts (it's typically the user's shell launcher); descendants are
    // where Claude / node / python live.
    let sumKb = 0
    const stack = [rootPid]
    const seen = new Set<number>()
    while (stack.length > 0) {
      const pid = stack.pop()!
      if (seen.has(pid)) continue
      seen.add(pid)
      const r = rssOf.get(pid)
      if (r !== undefined) sumKb += r
      const kids = childrenOf.get(pid)
      if (kids) for (const k of kids) stack.push(k)
    }
    const bytes = sumKb * 1024
    perWorktree.set(wtId, bytes)
    total += bytes
  }

  return { perWorktree, total }
}

function runPs(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const child = spawn("ps", ["-A", "-o", "pid=,ppid=,rss="], { stdio: ["ignore", "pipe", "ignore"] })
      let out = ""
      child.stdout.on("data", (d) => { out += d.toString("utf8") })
      child.on("error", () => resolve(null))
      child.on("close", (code) => resolve(code === 0 ? out : null))
    } catch {
      resolve(null)
    }
  })
}

export function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return "—"
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  if (b >= GB) return `${(b / GB).toFixed(1)}GB`
  if (b >= MB) return `${Math.round(b / MB)}MB`
  if (b >= KB) return `${Math.round(b / KB)}KB`
  return `${b}B`
}
