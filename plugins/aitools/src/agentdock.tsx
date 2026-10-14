import type { Elements } from 'claude-code'

import type { AgentCard, AgentKind, AgentRun, AgentShowing, HideAfter } from '../types'
import { progressBar } from './checklist'
import { renderPick } from './picks'
import { NOTE_SHRINK, ago, elapsed } from './format'
import { BLUE, DOING_TEXT, FAINT_TEXT, RED } from './palette'
import { TOTEM_HEIGHT, TOTEM_WIDTH, totemAlt, totemSvg } from './totem'

/** How many finished tasks the pane keeps listing, newest first out of view last. */
export const FINISHED_KEEP = 50
/** The Showing picks, in order: every kind, then each kind on its own. */
export const SHOWING_PICKS = ['all', 'subagent', 'workflow', 'monitor'] as const
export const SHOWING_LABELS = {
  all: 'All',
  subagent: 'Subagents',
  workflow: 'Workflows',
  monitor: 'Monitors',
} as const
/** What the pane says while the Showing pick leaves it no lines. */
export const EMPTY_LABELS = {
  all: 'Background tasks will appear here when started.',
  subagent: 'Subagents will appear here when started.',
  workflow: 'Workflow agents will appear here when started.',
  monitor: 'Monitors will appear here when started.',
} as const
/** Each line's type column. */
export const KIND_LABELS = { subagent: 'Subagent', workflow: 'Workflow', monitor: 'Monitor' } as const
/** The type column's width: its longest label and a space. */
const KIND_WIDTH = 9
/** The Hide after picks: never, then the longest wait to the shortest, in minutes. */
export const HIDE_AFTER = ['never', 60, 15, 5, 0] as const
export const DEFAULT_HIDE_AFTER: HideAfter = 'never'

export function hideAfterLabel(minutes: HideAfter): string {
  if (minutes === 'never') return 'Never'
  if (minutes === 0) return 'Immediate'

  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`
}

export function isShowing(value: unknown): value is AgentShowing {
  return SHOWING_PICKS.some(pick => pick === value)
}

export function isHideAfter(value: unknown): value is HideAfter {
  return HIDE_AFTER.some(m => m === value)
}

/** The lines the pane's picks leave: those of the kind Showing picks, and finished ones until Hide after's time is up. */
export function visibleCards(
  cards: readonly AgentCard[],
  view: { showing: AgentShowing; hideAfter: HideAfter; now: number },
): AgentCard[] {
  return cards.filter(
    c =>
      (view.showing === 'all' || kindOf(c) === view.showing) &&
      (c.status === 'running' || view.hideAfter === 'never' || view.now - (c.endedAt ?? view.now) < view.hideAfter * 60_000),
  )
}

export const PROGRESS_TOOL = 'agent_progress'
export const PROGRESS_TOOL_ID = 'mcp__aitools__agent_progress'
export const DOCK_PANE = 'tasks'
export const DOCK_TITLE = 'Background tasks'

/** A line's kind; lines from before kinds existed were all subagents. */
export function kindOf(card: AgentCard): AgentKind {
  return card.kind ?? 'subagent'
}

export const PROGRESS_SPEC = {
  name: PROGRESS_TOOL,
  description:
    'For a subagent listed in the Subagents pane: reports what you are doing and how far along your task is, shown on ' +
    'your line in the pane. Call it when you start, about every quarter of your work, and at 100 when done.',
  inputSchema: {
    type: 'object',
    properties: {
      doing: { type: 'string', description: 'What you are doing now, in a few plain words' },
      percent: { type: 'number', minimum: 0, maximum: 100, description: 'Your estimate of how far along your task is' },
    },
    required: ['doing', 'percent'],
  },
}

/** How a subagent is asked to report, so its line can show a percent and bar. */
const REPORT_ASK =
  `Report progress with ${PROGRESS_TOOL_ID}: call it when you start with a few words on what you are doing and ` +
  'percent 0, again about every quarter of your work, and with percent 100 when you finish.)'

/** What a subagent's prompt gains while the pane is open, so its line can show progress. */
export const SUBAGENT_NOTE = `\n\n(Your work shows as a line in the person's Subagents pane. ${REPORT_ASK}`

export function newRun(now: number): AgentRun {
  return { startedAt: now, cards: [] }
}

/** The run with a started task's line, once; `extra` adds what its kind knows from the start (a note, a deadline). */
export function addCard(
  run: AgentRun,
  id: string,
  task: string,
  now: number,
  kind: AgentKind = 'subagent',
  extra: Pick<AgentCard, 'doing' | 'expiresAt'> = {},
): AgentRun {
  if (run.cards.some(c => c.id === id)) {
    return run
  }
  const card: AgentCard = { id, task, kind, ...extra, status: 'running', startedAt: now }

  return { ...run, cards: [...run.cards, card] }
}

/** The run with a subagent's latest activity on its line. */
export function noteActivity(run: AgentRun, id: string, doing: string): AgentRun {
  return { ...run, cards: run.cards.map(c => (c.id === id ? { ...c, doing } : c)) }
}

/** The last part of a path: what a line names a file by. */
function baseName(path: unknown): string {
  return typeof path === 'string' ? (path.split('/').filter(Boolean).at(-1) ?? path) : ''
}

/** Text on one line, cut to `n` characters with `…`; anything but a string is empty. */
export function clip(text: unknown, n = 40): string {
  const one = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}

/** A short line on what a tool call does, for a subagent's line: `Reading bar.tsx`, `Running npm test`. */
export function activityText(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
      return `Reading ${baseName(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Editing ${baseName(input.file_path ?? input.notebook_path)}`
    case 'Write':
      return `Writing ${baseName(input.file_path)}`
    case 'Bash':
      return `Running ${clip(input.command)}`
    case 'Grep':
      return `Searching for ${clip(input.pattern, 30)}`
    case 'Glob':
      return `Finding ${clip(input.pattern, 30)}`
    case 'WebFetch':
      return `Fetching ${clip(typeof input.url === 'string' ? input.url.replace(/^https?:\/\//, '') : '', 30)}`
    case 'WebSearch':
      return `Searching the web for ${clip(input.query, 30)}`
    case 'Agent':
      return `Starting ${clip(input.description, 30) || 'a subagent'}`
    default:
      return `Using ${tool.replace(/^mcp__[^_]+__/, '')}`
  }
}

/** A workflow's name, for its agents' lines: the tool's `name`, else its script's `meta` name. */
export function workflowName(input: Record<string, unknown>): string {
  if (typeof input.name === 'string' && input.name) {
    return input.name
  }
  const script = typeof input.script === 'string' ? input.script : ''

  return /\bname\s*:\s*['"`]([^'"`]+)['"`]/.exec(script)?.[1] ?? 'workflow'
}

/** One background task's notice, as the chat receives it: its id, and its status or event when it gives one. */
export type TaskNotice = { id: string; status?: string; event?: string }

/** The task notices in a prompt's text: `<task-notification>` blocks, each naming its task. */
export function parseTaskNotices(text: string): TaskNotice[] {
  const notices: TaskNotice[] = []
  for (const [, body = ''] of text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const tag = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1]?.trim()
    const id = tag('task-id')
    if (id) notices.push({ id, status: tag('status'), event: tag('event') })
  }

  return notices
}

/**
 * How a notice says its task ended, or null when it does not (a monitor's ordinary event): a status of completed,
 * failed, or killed or stopped; a monitor's own closing event (`[Monitor expired after 30m ...]`).
 */
export function noticeEnd(notice: TaskNotice): EndStatus | null {
  switch (notice.status) {
    case 'completed':
      return 'done'
    case 'failed':
      return 'failed'
    case 'killed':
    case 'stopped':
      return 'stopped'
  }

  return notice.event?.startsWith('[Monitor ') ? 'done' : null
}

/** The run with one subagent's reported progress; a percent is rounded and held to 0 to 100. */
export function reportProgress(run: AgentRun, id: string, doing: string, percent: number): AgentRun {
  const pct = Math.min(100, Math.max(0, Math.round(Number.isFinite(percent) ? percent : 0)))

  const report = (c: AgentCard): AgentCard => ({ ...c, doing: doing.trim() || c.doing, percent: pct })

  return { ...run, cards: run.cards.map(c => (c.id === id ? report(c) : c)) }
}

/** How a finished task ended. */
export type EndStatus = Exclude<AgentCard['status'], 'running'>

/** The run with a task finished, as `status` says; a line already finished keeps how it ended. */
export function finishCard(run: AgentRun, id: string, status: EndStatus, now: number): AgentRun {
  if (!run.cards.some(c => c.id === id && c.status === 'running')) {
    return run
  }
  const cards = run.cards.map((c): AgentCard => (c.id === id ? { ...c, status, endedAt: now } : c))
  // Finished lines stay for the session, the newest FINISHED_KEEP of them.
  const finished = cards.filter(c => c.status !== 'running').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  const dropped = new Set(finished.slice(FINISHED_KEEP).map(c => c.id))

  return { ...run, cards: cards.filter(c => !dropped.has(c.id)) }
}

export function isRunning(run: AgentRun | null): boolean {
  return run !== null && run.cards.some(c => c.status === 'running')
}

/** How many tasks are running: what the project row's button counts. */
export function runningCount(run: AgentRun | null): number {
  return run?.cards.filter(c => c.status === 'running').length ?? 0
}

/** The project row's button: `1 bg task`, `5 bg tasks` (background tasks, as Claude Code calls them). */
export function tasksLabel(n: number): string {
  return n === 1 ? '1 bg task' : `${n} bg tasks`
}

/** The pane's header line: the non-zero counts. */
export function headerText(run: AgentRun | null): string {
  const cards = run?.cards ?? []
  const counts: [number, string][] = [
    [cards.filter(c => c.status === 'running').length, 'running'],
    [cards.filter(c => c.status === 'done').length, 'done'],
    [cards.filter(c => c.status === 'failed').length, 'failed'],
    [cards.filter(c => c.status === 'stopped').length, 'stopped'],
  ]

  return counts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(' · ')
}

/** `Svg` only where the surface draws it (the desktop): the totem shows there alone. */
type El = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & { Svg?: Elements['desktop']['Svg'] }

const QUIET = { plain: true, dimColor: true } as const
/** Task View's marks: ● running in blue, ✓ done (dim, as the rest of a finished line); × failed (red) or stopped. */
const CARD_MARKS = { running: '●', done: '✓', failed: '×', stopped: '×' } as const

/** The run's lines in order: running ones (oldest first), then finished ones, the most recently finished first. */
export function orderedCards(run: AgentRun): AgentCard[] {
  const running = run.cards.filter(c => c.status === 'running').sort((a, b) => a.startedAt - b.startedAt)
  const finished = run.cards.filter(c => c.status !== 'running').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))

  return [...running, ...finished]
}

/**
 * The Background tasks pane: controls on top, then the header (or what will appear when nothing is listed) and a
 * line per task. Where SVG is drawn, the totem stands left of the controls, the header beside it too.
 */
export function renderDock(
  el: El,
  dock: {
    showing: AgentShowing
    hideAfter: HideAfter
    run: AgentRun | null
    now: number
  },
  on: {
    setShowing(showing: AgentShowing): void
    setHideAfter(minutes: HideAfter): void
  },
) {
  const { Box, Text, Svg } = el
  const { showing, run, now } = dock
  const shown = run === null ? null : { ...run, cards: visibleCards(run.cards, { ...dock, now }) }
  const isEmpty = shown === null || shown.cards.length === 0
  const running = shown?.cards.filter(c => c.status === 'running').length ?? 0

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {Svg && (
          <Box key="totem" flexShrink={0} marginRight={2}>
            <Svg source={totemSvg(running)} alt={totemAlt(running)} width={TOTEM_WIDTH} height={TOTEM_HEIGHT} />
          </Box>
        )}
        <Box flexDirection="column" flexShrink={1} gap={1}>
          {renderControls(el, dock, on)}
          <Text dimColor>{isEmpty ? EMPTY_LABELS[showing] : headerText(shown)}</Text>
        </Box>
      </Box>
      {/* A blank line under the header, then the tasks running and the finished ones, the latest first. */}
      {shown !== null && shown.cards.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {orderedCards(shown).map(card => renderCard(el, card, now))}
        </Box>
      )}
    </Box>
  )
}

/** The pane's two option rows: Showing and Hide after. */
function renderControls(
  el: El,
  dock: { showing: AgentShowing; hideAfter: HideAfter },
  on: {
    setShowing(showing: AgentShowing): void
    setHideAfter(minutes: HideAfter): void
  },
) {
  const { Box, Text } = el
  const { showing, hideAfter } = dock

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>Showing:</Text>
        {SHOWING_PICKS.map(pick => (
          renderPick(el, `showing-${pick}`, SHOWING_LABELS[pick], showing === pick, () => on.setShowing(pick))
        ))}
      </Box>
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>Hide after:</Text>
        {HIDE_AFTER.map(minutes => (
          renderPick(el, `hide-${minutes}`, hideAfterLabel(minutes), hideAfter === minutes, () => on.setHideAfter(minutes))
        ))}
      </Box>
    </Box>
  )
}

/**
 * One task's row: its mark, its type column, then its name. Running: a blue ●, the name in the half-dim grey and what
 * it is doing faint, then (once a subagent reports progress) its percent and bar, and its time so far. Finished: all
 * faint (a failed one's × red), and its time with how long ago it finished: `0:09 (3m ago)`.
 */
function renderCard(el: El, card: AgentCard, now: number) {
  const { Box, Text } = el
  const time = elapsed((card.endedAt ?? now) - card.startedAt)
  if (card.status !== 'running') {
    return (
      <Box key={`agent-${card.id}`} flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" flexShrink={1} minWidth={0} overflow="hidden">
          <Text color={card.status === 'failed' ? RED : FAINT_TEXT}>{`${CARD_MARKS[card.status]} `}</Text>
          <Text color={FAINT_TEXT}>{KIND_LABELS[kindOf(card)].padEnd(KIND_WIDTH)}</Text>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text color={FAINT_TEXT} wrap="truncate-end">
              {card.task}
            </Text>
          </Box>
        </Box>
        <Text color={FAINT_TEXT}>{` ${time} (${ago(now - (card.endedAt ?? now))})`}</Text>
      </Box>
    )
  }
  const percent = card.percent ?? 0
  const bar = progressBar(percent)
  const isMeasured = card.percent !== undefined

  return (
    <Box key={`agent-${card.id}`} flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row" flexShrink={1} minWidth={0} overflow="hidden">
        <Text color={BLUE}>{`${CARD_MARKS.running} `}</Text>
        <Text dimColor>{KIND_LABELS[kindOf(card)].padEnd(KIND_WIDTH)}</Text>
        <Box flexShrink={1} minWidth={0} overflow="hidden">
          <Text color={DOING_TEXT} wrap="truncate-end">
            {card.task}
          </Text>
        </Box>
        {card.doing && (
          <Box flexShrink={NOTE_SHRINK} minWidth={0} overflow="hidden">
            <Text color={FAINT_TEXT} wrap="truncate-end">
              {` · ${card.doing}`}
            </Text>
          </Box>
        )}
      </Box>
      <Box flexDirection="row" flexShrink={0}>
        {isMeasured ? (
          <Box flexDirection="row">
            <Text dimColor>{` ${String(percent).padStart(3)}% `}</Text>
            <Text color={BLUE}>{bar.filled}</Text>
            <Text dimColor>{bar.empty}</Text>
          </Box>
        ) : (
          <Text>{' '.repeat(6 + bar.filled.length + bar.empty.length)}</Text>
        )}
        <Text dimColor>{` ${time.padStart(5)}`}</Text>
      </Box>
    </Box>
  )
}
