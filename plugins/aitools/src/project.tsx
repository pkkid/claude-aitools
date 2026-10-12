/**
 * The project row: a second line under the bar for the GitHub repository the session works in. On the left the
 * repository's name, its GitHub Project board and the issue the session is about, each opening in the browser; on
 * the right the tools the project's own `.claude/aitools.json` defines (links, servers, commands). Outside a GitHub
 * repository the row is not drawn.
 */

import type { Elements } from 'claude-code'

import { objectAt } from './config'
import type { Json } from './config'
import { DOING_TEXT, FAINT_TEXT, GREEN, RED, YELLOW } from './palette'
import type { GithubRepo, ProjectConfig, ProjectTool, ToolListener, ToolRun } from '../types'

/** A GitHub repository from a git remote URL: `https://github.com/o/r(.git)`, `git@github.com:o/r.git`, `ssh://…`. */
export function parseGithubRemote(url: string): { owner: string; name: string } | null {
  const match = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(?::\d+)?\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())

  return match?.[1] && match[2] ? { owner: match[1], name: match[2] } : null
}

/** Context the engine joins into a prompt's text, which can name unrelated issues and pull requests. */
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g
/** An issue a prompt names: its URL or `#<number>`; the first one counts. */
const PROMPT_ISSUE = /\/issues\/(\d+)|(?:^|[^\w&])#(\d+)\b/

/** The issue a prompt names, as vowelit's devserver mod reads it; null when it names none. */
export function issueInPrompt(text: string): number | null {
  const match = PROMPT_ISSUE.exec(text.replace(REMINDER, ''))
  const n = match?.[1] ?? match?.[2]

  return n === undefined ? null : Number(n)
}

/**
 * The issue a branch is named for: a number opening the name or a segment after `/`, alone or before a `-`
 * (`feat/123-login`, `123-fix`, `issue-123`, `gh-123`). A date (`2026-10-10-notes`) or a version (`v2`) is none.
 */
export function issueInBranch(branch: string): number | null {
  for (const segment of branch.split('/')) {
    const match = /^(?:(?:issue|issues|gh|bug|fix)-)?(\d+)(?:-|$)/i.exec(segment)
    if (match?.[1] && !/^\d{4}-\d{2}-\d{2}/.test(segment)) {
      return Number(match[1])
    }
  }

  return null
}

/** The values a tool's command or link may name in braces. */
export type ToolVars = { checkout: string; main: string; branch: string; repo: string; owner: string; name: string; issue: string; port: string }

/** `text` with each `{name}` it names replaced; a name it does not know is left as written. */
export function expand(text: string, vars: ToolVars): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? vars[key as keyof ToolVars] : whole))
}

/** A command as the file gives it: an argument list, or a string run by `sh -c`. */
function argvOf(value: unknown): string[] | null {
  if (typeof value === 'string' && value.trim()) return ['sh', '-c', value]
  if (Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string')) return value as string[]

  return null
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tool'

/**
 * The project section of a project's file, its problems listed rather than thrown: a tool it cannot use is left out
 * with a line saying why, so one mistake does not take the rest of the row down.
 */
export function projectFrom(raw: Json): ProjectConfig {
  const project = objectAt(raw, 'project')
  const problems: string[] = []
  const tools: ProjectTool[] = []
  const ids = new Set<string>()
  const list = project.tools === undefined ? [] : Array.isArray(project.tools) ? project.tools : null
  if (list === null) problems.push('project.tools must be a list')
  for (const [i, entry] of (list ?? []).entries()) {
    const where = `project.tools[${i}]`
    const t = entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Json) : null
    const label = typeof t?.label === 'string' && t.label.trim() ? t.label.trim() : null
    if (t === null || label === null) {
      problems.push(`${where} needs a "label"`)
      continue
    }
    let id = typeof t.id === 'string' && t.id.trim() ? slug(t.id) : slug(label)
    while (ids.has(id)) id = `${id}-${i}`
    ids.add(id)
    if (t.type === 'link') {
      if (typeof t.url !== 'string' || !t.url.trim()) {
        problems.push(`${where} ("${label}") needs a "url"`)
        continue
      }
      tools.push({ type: 'link', id, label, url: t.url.trim() })
    } else if (t.type === 'command') {
      const run = argvOf(t.run)
      if (run === null) {
        problems.push(`${where} ("${label}") needs a "run" command: a string, or a list of arguments`)
        continue
      }
      tools.push({ type: 'command', id, label, run, ...(typeof t.cwd === 'string' ? { cwd: t.cwd } : {}) })
    } else if (t.type === 'server') {
      const start = argvOf(t.start)
      if (start === null) {
        problems.push(`${where} ("${label}") needs a "start" command: a string, or a list of arguments`)
        continue
      }
      const stop = t.stop === undefined ? null : argvOf(t.stop)
      if (t.stop !== undefined && stop === null) problems.push(`${where} ("${label}"): "stop" must be a string or a list of arguments`)
      const port = typeof t.port === 'number' && Number.isInteger(t.port) && t.port > 0 && t.port < 65536 ? t.port : null
      if (t.port !== undefined && port === null) problems.push(`${where} ("${label}"): "port" must be a port number`)
      let ready: string | null = null
      if (typeof t.ready === 'string') {
        try {
          new RegExp(t.ready)
          ready = t.ready
        } catch {
          problems.push(`${where} ("${label}"): "ready" is not a valid regular expression`)
        }
      }
      tools.push({
        type: 'server',
        id,
        label,
        start,
        ...(stop === null ? {} : { stop }),
        ...(port === null ? {} : { port }),
        ...(ready === null ? {} : { ready }),
        ...(typeof t.cwd === 'string' ? { cwd: t.cwd } : {}),
      })
    } else {
      problems.push(`${where} ("${label}"): "type" must be "link", "command" or "server"`)
    }
  }
  const board = project.board === false ? false : typeof project.board === 'string' && project.board.trim() ? project.board.trim() : undefined
  if (project.board !== undefined && board === undefined) problems.push('project.board must be a URL, or false to hide it')

  return {
    isEnabled: project.enabled !== false,
    ...(typeof project.name === 'string' && project.name.trim() ? { name: project.name.trim() } : {}),
    ...(board === undefined ? {} : { board }),
    tools,
    problems,
  }
}

/** A server's status line: a dot in its state's color and the words, which open its log. */
export function serverStatus(run: ToolRun | undefined, listener: ToolListener | null | undefined): { dot: string; text: string; color?: string } {
  const phase = run?.phase ?? 'idle'
  const branch = run?.branch ?? ''
  if (phase === 'stopping') return { dot: '○', text: branch ? `Stopping ${branch}…` : 'Stopping…', color: YELLOW }
  if (phase === 'starting') return { dot: '○', text: branch ? `Starting ${branch}…` : 'Starting…', color: YELLOW }
  if (phase === 'ready') return { dot: '●', text: branch ? `Running ${branch}` : 'Running', color: GREEN }
  if (listener) return { dot: '●', text: `Running ${listener.label}`, color: GREEN }
  if (phase === 'running') return { dot: '●', text: branch ? `Running ${branch}` : 'Running', color: GREEN }
  if (phase === 'exited') {
    // Exiting with code 0, or on the stop signal a Stop sends, is a clean end: dim like Stopped, not red.
    const isClean = /^(code 0|SIGTERM|SIGINT)$/.test(run?.detail ?? '')
    return { dot: '○', text: `Exited${run?.detail ? ` (${run.detail})` : ''}`, ...(isClean ? {} : { color: RED }) }
  }
  if (phase === 'failed') return { dot: '○', text: `Failed${run?.detail ? `: ${run.detail}` : ''}`, color: RED }

  return { dot: '○', text: 'Stopped' }
}

/** Whether a server counts as up: this session's run, or anything listening on its port. */
export function isServerUp(run: ToolRun | undefined, listener: ToolListener | null | undefined): boolean {
  return listener != null || run?.phase === 'starting' || run?.phase === 'ready' || run?.phase === 'running'
}

/** A command tool's dot: yellow while it runs, green once it passed, red once it failed; none before it ran. */
export function commandDot(run: ToolRun | undefined): { dot: string; color: string } | null {
  if (run?.phase === 'running') return { dot: '●', color: YELLOW }
  if (run?.phase === 'passed') return { dot: '●', color: GREEN }
  if (run?.phase === 'failed' || run?.phase === 'exited') return { dot: '●', color: RED }

  return null
}

type El = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

/** Quiet buttons, as the bar's own: dim text and no outline at rest, full strength under the pointer. */
const QUIET = { plain: true, dimColor: true } as const

/** What the row draws: the repository, its links, and each tool with how it stands. */
export type RowView = {
  repo: GithubRepo
  name: string
  boardUrl: string | null
  issue: { number: number; title: string | null } | null
  tools: readonly ProjectTool[]
  runs: Readonly<Record<string, ToolRun>>
  listeners: Readonly<Record<string, ToolListener | null>>
  /** Room between neighboring buttons: the desktop's own chrome parts them, the terminal needs spaces. */
  gap: number
}

/** The issue button's label: its number, then its title cut to fit. */
export function issueLabel(issue: { number: number; title: string | null }): string {
  const title = issue.title?.trim()
  if (!title) return `#${issue.number}`
  const chars = Array.from(title)

  return `#${issue.number} ${chars.length > 32 ? `${chars.slice(0, 31).join('')}…` : title}`
}

export function renderProjectRow(
  el: El,
  view: RowView,
  on: {
    open(url: string): void
    startServer(id: string): void
    stopServer(id: string): void
    toggleLog(id: string): void
    runCommand(id: string): void
  },
) {
  const { Box, Text, Button } = el
  const { repo, gap } = view

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Box key="project-left" flexDirection="row" gap={gap} flexShrink={1} alignItems="center">
        <Button key="project-name" label={view.name} {...QUIET} onPress={() => on.open(repo.url)} />
        {view.boardUrl !== null && <Button key="project-board" label="Project" {...QUIET} onPress={() => on.open(view.boardUrl ?? repo.url)} />}
        {view.issue !== null && (
          <Button
            key="project-issue"
            label={issueLabel(view.issue)}
            {...QUIET}
            onPress={() => on.open(`${repo.url}/issues/${view.issue?.number}`)}
          />
        )}
      </Box>
      <Box key="project-tools" flexDirection="row" gap={gap} flexShrink={0} alignItems="center">
        {view.tools.map(tool => {
          if (tool.type === 'link') {
            return <Button key={`tool-${tool.id}`} label={tool.label} {...QUIET} onPress={() => on.open(tool.url)} />
          }
          const run = view.runs[tool.id]
          if (tool.type === 'command') {
            const dot = commandDot(run)
            return (
              <Box key={`tool-${tool.id}`} flexDirection="row" alignItems="center">
                {dot && <Text color={dot.color}>{`${dot.dot} `}</Text>}
                <Button
                  key={`tool-${tool.id}-run`}
                  label={run?.phase === 'running' ? `${tool.label}…` : tool.label}
                  {...QUIET}
                  onPress={() => (run?.phase === 'running' ? on.toggleLog(tool.id) : on.runCommand(tool.id))}
                />
              </Box>
            )
          }
          const listener = view.listeners[tool.id]
          const status = serverStatus(run, listener)
          const isUp = isServerUp(run, listener)
          const isBusy = run?.phase === 'starting' || run?.phase === 'stopping'
          return (
            <Box key={`tool-${tool.id}`} flexDirection="row" gap={gap} alignItems="center">
              <Box key={`tool-${tool.id}-status`} flexDirection="row" alignItems="center">
                <Text color={status.color ?? FAINT_TEXT}>{`${status.dot} `}</Text>
                <Button key={`tool-${tool.id}-log`} label={status.text} {...QUIET} onPress={() => on.toggleLog(tool.id)} />
              </Box>
              {isBusy ? (
                <Text key={`tool-${tool.id}-busy`} color={DOING_TEXT}>{isUp ? `Stop ${tool.label}` : `Start ${tool.label}`}</Text>
              ) : isUp ? (
                <Button key={`tool-${tool.id}-stop`} label={`Stop ${tool.label}`} {...QUIET} onPress={() => on.stopServer(tool.id)} />
              ) : (
                <Button key={`tool-${tool.id}-start`} label={`Start ${tool.label}`} {...QUIET} onPress={() => on.startServer(tool.id)} />
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

/** The row's name for a repository: its name with the first letter capitalized (`claude-mods` → `Claude-mods`). */
export function displayName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** A tool's log pane id. */
export const logPaneId = (id: string) => `aitools-log-${id}`

/** How many lines a tool's log keeps. */
export const LOG_KEEP = 2000

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g

/**
 * A chunk of output cut into whole lines, colors stripped and a carriage return taken as a redraw of the line: the
 * lines it finished, and the unfinished rest, which the next chunk continues.
 */
export function splitOutput(rest: string, text: string): { lines: string[]; rest: string } {
  const parts = (rest + text.replace(ANSI, '')).split('\n')
  const tail = parts.pop() ?? ''

  return { lines: parts.map(part => part.slice(part.lastIndexOf('\r') + 1)), rest: tail }
}
