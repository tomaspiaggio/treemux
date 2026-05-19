import { Box, Text } from "ink"
import type { WorktreeEntry } from "../models/Config.js"

interface SidebarProps {
  worktrees: readonly WorktreeEntry[]
  activeId: string | null
  selectedIndex: number
  width: number
}

export function Sidebar({ worktrees, activeId, selectedIndex, width }: SidebarProps) {
  if (worktrees.length === 0) {
    return (
      <Box flexDirection="column" width={width} borderStyle="single" borderRight>
        <Box paddingX={1} marginTop={1}>
          <Text bold>treemux</Text>
        </Box>
        <Box paddingX={1} marginTop={1} flexDirection="column">
          <Text dimColor>No worktrees yet</Text>
          <Text dimColor>Press </Text>
          <Text bold color="cyan">n</Text>
          <Text dimColor> to create one</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderRight>
      <Box paddingX={1}>
        <Text bold>treemux</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {worktrees.map((wt, i) => {
          const isSelected = i === selectedIndex
          const isActive = wt.id === activeId
          const isMerged = wt.status === "merged"

          return (
            <Box key={wt.id} paddingX={1}>
              {isSelected ? (
                <Text backgroundColor="magenta" color="white" bold>
                  {isActive ? " ● " : "   "}
                  {wt.displayName.slice(0, width - 8).padEnd(width - 8)}
                </Text>
              ) : isMerged ? (
                <Text dimColor>
                  {" ✓ "}
                  {wt.displayName.slice(0, width - 8)}
                </Text>
              ) : (
                <Text>
                  {isActive ? " ● " : "   "}
                  {wt.displayName.slice(0, width - 8)}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
