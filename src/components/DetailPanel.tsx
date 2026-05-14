import { Box, Text } from "ink"
import type { WorktreeEntry, Project } from "../models/Config.js"

interface DetailPanelProps {
  worktree: WorktreeEntry | undefined
  project: Project | undefined
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function DetailPanel({ worktree, project }: DetailPanelProps) {
  if (!worktree) {
    return (
      <Box borderStyle="single" borderTop paddingX={1} height={3}>
        <Text dimColor>Select a worktree to see details</Text>
      </Box>
    )
  }

  return (
    <Box borderStyle="single" borderTop paddingX={1} height={3} gap={2}>
      <Text bold>{worktree.displayName}</Text>
      <Text>
        <Text dimColor>Branch: </Text>
        {worktree.branchName}
      </Text>
      <Text>
        <Text dimColor>Status: </Text>
        <Text color={worktree.status === "merged" ? "green" : worktree.status === "active" ? "cyan" : "gray"}>
          {worktree.status}
        </Text>
      </Text>
      <Text>
        <Text dimColor>Updated: </Text>
        {formatRelativeTime(worktree.updatedAt)}
      </Text>
      {project && (
        <Text>
          <Text dimColor>Project: </Text>
          {project.name}
        </Text>
      )}
      {worktree.description && (
        <Text>
          <Text dimColor>Desc: </Text>
          {worktree.description}
        </Text>
      )}
    </Box>
  )
}
