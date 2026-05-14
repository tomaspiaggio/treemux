import { useState, useEffect, useCallback } from "react"
import { Box, Text, useApp, useInput, useStdout } from "ink"
import TextInput from "ink-text-input"
import SelectInput from "ink-select-input"
import { Sidebar } from "./Sidebar.js"
import { DetailPanel } from "./DetailPanel.js"
import { StatusBar } from "./StatusBar.js"
import type { Project, WorktreeEntry, CommandType } from "../models/Config.js"
import type { EditorOption } from "../utils/editors.js"

type ModalState =
  | { type: "none" }
  | { type: "input"; title: string; placeholder: string; onSubmit: (value: string) => void }
  | { type: "select"; title: string; options: string[]; onSelect: (value: string) => void }
  | { type: "confirm"; title: string; message: string; onConfirm: () => void }
  | { type: "editor-picker"; worktreeId: string }

interface AppProps {
  projects: readonly Project[]
  worktrees: readonly WorktreeEntry[]
  availableEditors: EditorOption[]
  initialEditorPickerFor?: string
  onCreateWorktree: (projectId: string, branchName?: string) => Promise<void>
  onArchiveWorktree: (worktreeId: string) => Promise<void>
  onEnterTerminal: (worktreeId: string) => void
  onOpenEditor: (worktreeId: string, editor: EditorOption) => void
  onAddProject: (params: {
    name: string
    repoPath: string
    setupScript: string[]
    defaultCommand: CommandType
    customCommand?: string
  }) => Promise<any>
  onRefresh: () => Promise<void>
  onQuit: () => void
}

export function App({
  projects,
  worktrees,
  availableEditors,
  initialEditorPickerFor,
  onCreateWorktree,
  onArchiveWorktree,
  onEnterTerminal,
  onOpenEditor,
  onAddProject,
  onRefresh,
  onQuit,
}: AppProps) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const termHeight = stdout?.rows ?? 24
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(
    worktrees.length > 0 ? worktrees[0]!.id : null
  )
  const [modal, setModal] = useState<ModalState>(
    initialEditorPickerFor
      ? { type: "editor-picker", worktreeId: initialEditorPickerFor }
      : { type: "none" }
  )
  const [inputValue, setInputValue] = useState("")

  useEffect(() => {
    if (worktrees.length > 0 && !activeId) {
      setActiveId(worktrees[0]!.id)
    }
  }, [worktrees, activeId])

  const selectedWorktree = worktrees[selectedIndex]
  const selectedProject = selectedWorktree
    ? projects.find((p) => p.id === selectedWorktree.projectId)
    : undefined

  const startOnboarding = useCallback(() => {
    setInputValue("")
    setModal({
      type: "input",
      title: "Path to your git repository",
      placeholder: "/path/to/your/git/repo",
      onSubmit: (repoPath) => {
        setInputValue("")
        setModal({
          type: "input",
          title: "Project name",
          placeholder: "my-project",
          onSubmit: (name) => {
            const commandOptions = ["claude", "codex", "opencode", "custom"]
            setModal({
              type: "select",
              title: "Default command for worktrees",
              options: commandOptions,
              onSelect: (command) => {
                setInputValue("")
                setModal({
                  type: "input",
                  title: "Setup script (optional, ;-separated, press Enter to skip)",
                  placeholder: "pnpm i",
                  onSubmit: async (setup) => {
                    const setupScript = setup
                      ? setup.split(";").map((s) => s.trim()).filter(Boolean)
                      : []
                    const project = await onAddProject({
                      name,
                      repoPath,
                      setupScript,
                      defaultCommand: command as CommandType,
                    })
                    setModal({ type: "none" })
                    if (project) {
                      await onCreateWorktree(project.id)
                    }
                  },
                })
              },
            })
          },
        })
      },
    })
  }, [onAddProject, onRefresh, onCreateWorktree])

  const handleNewWorktree = useCallback(() => {
    if (projects.length === 0) {
      startOnboarding()
      return
    }

    if (projects.length === 1) {
      onCreateWorktree(projects[0]!.id)
    } else {
      setModal({
        type: "select",
        title: "Select project",
        options: projects.map((p) => p.name),
        onSelect: (name) => {
          const project = projects.find((p) => p.name === name)!
          setModal({ type: "none" })
          onCreateWorktree(project.id)
        },
      })
    }
  }, [projects, onCreateWorktree, startOnboarding])

  const handleArchive = useCallback(() => {
    const wt = worktrees[selectedIndex]
    if (!wt) return
    setModal({
      type: "confirm",
      title: "Archive worktree",
      message: `Archive "${wt.displayName}"? (y/n)`,
      onConfirm: async () => {
        setModal({ type: "none" })
        await onArchiveWorktree(wt.id)
        await onRefresh()
        setSelectedIndex(Math.max(0, selectedIndex - 1))
      },
    })
  }, [worktrees, selectedIndex, onArchiveWorktree, onRefresh])

  const handleOpenEditorPicker = useCallback(() => {
    const wt = worktrees[selectedIndex]
    if (!wt) return
    if (availableEditors.length === 0) return
    setModal({ type: "editor-picker", worktreeId: wt.id })
  }, [worktrees, selectedIndex, availableEditors])

  useEffect(() => {
    if (projects.length === 0 && modal.type === "none") {
      startOnboarding()
    }
  }, [])

  useInput((input, key) => {
    if (modal.type !== "none") {
      if (key.escape) {
        setModal({ type: "none" })
        return
      }
      if (modal.type === "confirm") {
        if (input === "y" || input === "Y") {
          modal.onConfirm()
        } else if (input === "n" || input === "N" || key.escape) {
          setModal({ type: "none" })
        }
      }
      return
    }

    if (input === "q") {
      onQuit()
      exit()
      return
    }
    if (input === "j" || key.downArrow) {
      setSelectedIndex(Math.min(worktrees.length - 1, selectedIndex + 1))
      return
    }
    if (input === "k" || key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1))
      return
    }
    if (key.return) {
      const wt = worktrees[selectedIndex]
      if (wt) {
        setActiveId(wt.id)
        onEnterTerminal(wt.id)
      } else if (worktrees.length === 0) {
        handleNewWorktree()
      }
      return
    }
    if (input === "n") {
      handleNewWorktree()
      return
    }
    if (input === "d") {
      handleArchive()
      return
    }
    if (input === "o") {
      handleOpenEditorPicker()
      return
    }
  })

  const sidebarWidth = 30
  const contentHeight = termHeight - 5

  return (
    <Box flexDirection="column" height={termHeight}>
      <Box flexGrow={1} height={contentHeight}>
        <Sidebar
          worktrees={worktrees}
          activeId={activeId}
          selectedIndex={selectedIndex}
          width={sidebarWidth}
        />
        <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
          {modal.type === "none" && worktrees.length > 0 && selectedWorktree && (
            <Box flexDirection="column">
              <Text bold color="cyan">{selectedWorktree.displayName}</Text>
              <Text dimColor>Branch: {selectedWorktree.branchName}</Text>
              <Text dimColor>Path: {selectedWorktree.path}</Text>
              <Box marginTop={1}>
                <Text>Press <Text bold color="cyan">Enter</Text> to open terminal</Text>
              </Box>
              <Box>
                <Text>Press <Text bold color="cyan">o</Text> to open in editor</Text>
              </Box>
            </Box>
          )}
          {modal.type === "none" && worktrees.length === 0 && projects.length > 0 && (
            <Box flexDirection="column">
              <Text>Ready to go! Press <Text bold color="cyan">n</Text> to create your first worktree.</Text>
            </Box>
          )}

          {modal.type === "input" && (
            <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
              <Text bold>{modal.title}</Text>
              <Box marginTop={1}>
                <Text color="cyan">&gt; </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(value) => {
                    modal.onSubmit(value.trim())
                    setInputValue("")
                  }}
                  placeholder={modal.placeholder}
                />
              </Box>
            </Box>
          )}

          {modal.type === "select" && (
            <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
              <Text bold>{modal.title}</Text>
              <Box marginTop={1}>
                <SelectInput
                  items={modal.options.map((o) => ({ label: o, value: o }))}
                  onSelect={(item) => modal.onSelect(item.value)}
                />
              </Box>
            </Box>
          )}

          {modal.type === "confirm" && (
            <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
              <Text bold>{modal.title}</Text>
              <Box marginTop={1}>
                <Text>{modal.message}</Text>
              </Box>
            </Box>
          )}

          {modal.type === "editor-picker" && (
            <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
              <Text bold>Open in editor</Text>
              <Box marginTop={1}>
                <SelectInput
                  items={availableEditors.map((e) => ({ label: e.name, value: e.cmd }))}
                  onSelect={(item) => {
                    const editor = availableEditors.find((e) => e.cmd === item.value)!
                    setModal({ type: "none" })
                    onOpenEditor(modal.worktreeId, editor)
                  }}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <DetailPanel worktree={selectedWorktree} project={selectedProject} />
      <StatusBar />
    </Box>
  )
}
