import { Box, Text } from "ink"

export function StatusBar() {
  return (
    <Box paddingX={1} gap={2}>
      <Text>
        <Text bold color="cyan">Enter</Text>
        <Text dimColor> open</Text>
      </Text>
      <Text>
        <Text bold color="cyan">n</Text>
        <Text dimColor> new</Text>
      </Text>
      <Text>
        <Text bold color="cyan">j/k</Text>
        <Text dimColor> navigate</Text>
      </Text>
      <Text>
        <Text bold color="cyan">d</Text>
        <Text dimColor> archive</Text>
      </Text>
      <Text>
        <Text bold color="cyan">o</Text>
        <Text dimColor> editor</Text>
      </Text>
      <Text>
        <Text bold color="cyan">q</Text>
        <Text dimColor> quit</Text>
      </Text>
    </Box>
  )
}
