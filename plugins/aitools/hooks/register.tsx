import { atom, read, update } from 'claude-code'
import type { EngineInterface, Events, Register, Timer } from 'claude-code'

import {
  PROGRESS_SPEC,
  PROGRESS_TOOL_ID,
  SUBAGENT_NOTE,
  DEFAULT_HIDE_AFTER,
  DOCK_PANE,
  DOCK_TITLE,
  activityText,
  addCard,
  clip,
  commandLine,
  finishCard,
  isRunning,
  kindOf,
  newRun,
  noteActivity,
  noticeEnd,
  parseTaskNotices,
  runningCount,
  renderDock,
  reportProgress,
  workflowName,
} from '../src/agentdock'
import type { EndStatus } from '../src/agentdock'
import { CACHE_TTL, renderBar } from '../src/bar'
import { BOARD_QUERY, BOARD_REFRESH_MS, PROJECT_PANE, filterCounts, parseBoardItems, parseBoardUrl, renderBoard } from '../src/board'
import { price } from '../src/pricing'
import {
  CHECKLIST_SPEC,
  CHECKLIST_TOOL_ID,
  VIEW_NAMES,
  addFinal,
  finalReplies,
  isFinalReply,
  nextToggle,
  parseChecklist,
  renderChecklist,
  viewNote,
} from '../src/checklist'
import { FAINT_TEXT, RED } from '../src/palette'
import { EMPTY_BURN, addSample, project } from '../src/burnrate'
import type { BurnState } from '../src/burnrate'
import { HANDOFF_PROMPT, handoffOutput, paneMarkdown } from '../src/handoff'
import { ASK_TOOL, askmeText, asksQuestions, isAskableIn } from '../src/askme'
import { CONFIG_FILE, STORED_KEYS, configText, migrated, parseConfig, personalFrom, withPersonal } from '../src/config'
import type { Json, Personal, StoredSettings } from '../src/config'
import {
  LOG_KEEP,
  expand,
  issueInBranch,
  issueInPrompt,
  logPaneId,
  parseGithubRemote,
  projectFrom,
  renderProjectRow,
  splitOutput,
} from '../src/project'
import type { ToolVars } from '../src/project'
import {
  KEEPWARM_HELP,
  KEEPWARM_LEAD_MS,
  KEEPWARM_PROMPT,
  coldPingText,
  failureText,
  isWarmReadback,
  keepWarmStatus,
  parseKeepWarm,
  pingDelay,
} from '../src/keepwarm'
import {
  MASCOT_START,
  ONE_SHOT_MS,
  READ_TOOLS,
  SLEEP_AFTER_MS,
  endsWithQuestion,
  introMs,
  isQuestionOpenIn,
  mascotDrawing,
} from '../src/mascot'
import {
  AFTER_TOOL_MS,
  BRANCHES_PANE,
  BRANCHES_TITLE,
  CHANGING_TOOLS,
  FIRST_PARENT_DEPTH,
  GITHUB_EVERY,
  REFRESH_MS,
  SWEEP_MS,
  countChanged,
  firstLine,
  isCleanable,
  isDeletable,
  joinBranches,
  parsePrs,
  parseRefs,
  parseRuns,
  parseShortstat,
  parseWorktreeList,
  refFormat,
  removedText,
  renderBranches,
} from '../src/branches'
import type { CheckoutFacts, PrFacts, Removal, WorktreeEntry } from '../src/branches'
import { DEFAULT_SETTINGS, nextHidden, normalizeSettings } from '../src/settings'
import { SETTINGS_PANE, SETTINGS_TITLE, boardProblem, homeRelative, renderSettings, withProject } from '../src/settingspane'
import type { ProjectChange } from '../src/settingspane'
import { scanMonth, sessionTokens, sessionUsd, usageTokens } from '../src/transcripts'
import type { ScanCache, ScanIO } from '../src/transcripts'
import type { BoardData, Branch, BranchTarget, BranchesShow, BranchesWhere, CiState, GithubRepo, ProjectTool, ToolListener, ToolRun } from '../types'
import type { AgentCard, AgentKind, AgentRun, AgentShowing, Brief, HideAfter, LimitWindow, MascotPose, MascotState, Snapshot, ToggleKey } from '../types'

// The engine follows `$` only into functions declared in this file, so every
// function that touches `$` lives here; src/ holds the pure units.

const snapshot = atom({ plugin: 'aitools', key: 'snapshot' } as const, null)
const month = atom({ plugin: 'aitools', key: 'month' } as const, { usd: 0, isEstimate: false, status: 'loading' })
const projection = atom({ plugin: 'aitools', key: 'projection' } as const, null)
const settings = atom({ plugin: 'aitools', key: 'settings' } as const, DEFAULT_SETTINGS)
const isHidden = atom({ plugin: 'aitools', key: 'isHidden' } as const, false)
const isSettingsOpen = atom({ plugin: 'aitools', key: 'isSettingsOpen' } as const, false)
const cacheAt = atom({ plugin: 'aitools', key: 'cacheAt' } as const, null)
const turnBaseline = atom({ plugin: 'aitools', key: 'turnBaseline' } as const, null)
const tick = atom({ plugin: 'aitools', key: 'tick' } as const, 0)
const isHandingOff = atom({ plugin: 'aitools', key: 'isHandingOff' } as const, false)
const isToolsOpen = atom({ plugin: 'aitools', key: 'isToolsOpen' } as const, false)
const brief = atom({ plugin: 'aitools', key: 'brief' } as const, null)
const isTaskView = atom({ plugin: 'aitools', key: 'isTaskView' } as const, false)
const isCleanView = atom({ plugin: 'aitools', key: 'isCleanView' } as const, false)
const checklist = atom({ plugin: 'aitools', key: 'checklist' } as const, null)
const isChecklistCollapsed = atom({ plugin: 'aitools', key: 'isChecklistCollapsed' } as const, false)
const isChecklistClosed = atom({ plugin: 'aitools', key: 'isChecklistClosed' } as const, false)
const finals = atom({ plugin: 'aitools', key: 'finals' } as const, [])
const isDockOpen = atom({ plugin: 'aitools', key: 'isDockOpen' } as const, false)
const agentShowing = atom({ plugin: 'aitools', key: 'agentShowing' } as const, 'all')
const hideAfter = atom({ plugin: 'aitools', key: 'hideAfter' } as const, DEFAULT_HIDE_AFTER)
const agentRun = atom({ plugin: 'aitools', key: 'agentRun' } as const, null)
const runningTasks = atom({ plugin: 'aitools', key: 'runningTasks' } as const, 0)
const dockTick = atom({ plugin: 'aitools', key: 'dockTick' } as const, 0)
const mascot = atom({ plugin: 'aitools', key: 'mascot' } as const, MASCOT_START)
const asking = atom({ plugin: 'aitools', key: 'asking' } as const, 0)
const isQuestionOpen = atom({ plugin: 'aitools', key: 'isQuestionOpen' } as const, false)
const isAskable = atom({ plugin: 'aitools', key: 'isAskable' } as const, false)
const mainModel = atom({ plugin: 'aitools', key: 'mainModel' } as const, null)
const keepWarm = atom({ plugin: 'aitools', key: 'keepWarm' } as const, null)
const githubRepo = atom({ plugin: 'aitools', key: 'githubRepo' } as const, null)
const projectConfig = atom({ plugin: 'aitools', key: 'projectConfig' } as const, null)
const boardUrl = atom({ plugin: 'aitools', key: 'boardUrl' } as const, null)
const promptIssue = atom({ plugin: 'aitools', key: 'promptIssue' } as const, null)
const issueTitle = atom({ plugin: 'aitools', key: 'issueTitle' } as const, null)
const toolRuns = atom({ plugin: 'aitools', key: 'toolRuns' } as const, {})
const toolListeners = atom({ plugin: 'aitools', key: 'toolListeners' } as const, {})
const toolLogs = atom({ plugin: 'aitools', key: 'toolLogs' } as const, {})
const keepWarmStopped = atom({ plugin: 'aitools', key: 'keepWarmStopped' } as const, null)
const isNotesOpen = atom({ plugin: 'aitools', key: 'isNotesOpen' } as const, false)
const notes = atom({ plugin: 'aitools', key: 'notes' } as const, null)
const isBranchesOpen = atom({ plugin: 'aitools', key: 'isBranchesOpen' } as const, false)
const branchList = atom({ plugin: 'aitools', key: 'branches' } as const, null)
const branchAction = atom({ plugin: 'aitools', key: 'branchAction' } as const, null)
const branchesWhere = atom({ plugin: 'aitools', key: 'branchesWhere' } as const, 'both' as BranchesWhere)
const branchesShow = atom({ plugin: 'aitools', key: 'branchesShow' } as const, 'all' as BranchesShow)
const isBoardOpen = atom({ plugin: 'aitools', key: 'isBoardOpen' } as const, false)
const board = atom({ plugin: 'aitools', key: 'board' } as const, { status: 'loading' })
const boardFilter = atom({ plugin: 'aitools', key: 'boardFilter' } as const, 'open')
const isBoardReading = atom({ plugin: 'aitools', key: 'isBoardReading' } as const, false)
const settingsNote = atom({ plugin: 'aitools', key: 'settingsNote' } as const, null)

const HANDOFF_PANE = 'handoff'
const NOTES_PANE = 'notes'
/** The note's file, under the session's project root. */
const NOTES_FILE = '.claude/notes.md'
/** The editor's key in the Notes pane. */
const NOTES_EDITOR = 'notes-editor'

/** Prompt origins that are the person's own words; anything else (a subagent's report, a notice) is not a new request. */
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])
/** How many Background tasks trace lines the store keeps. */
const TRACE_KEEP = 60
/** The mod's own tools: reporting progress is not work the mascot reacts to. */
const QUIET_TOOLS: ReadonlySet<string> = new Set([CHECKLIST_TOOL_ID, PROGRESS_TOOL_ID])
/** How long a subagent's first model request waits for its own start to be recorded, at most. */
const SPAWN_WAIT_MS = 2000
/** How long past its deadline a monitor's line waits for its own closing notice before it is ended anyway. */
const MONITOR_GRACE_MS = 60_000

/** Subagent starts in flight, which a subagent's first model request may wait on before its line exists. */
const startsInFlight = new Set<Promise<void>>()
/** Subagent loops already looked at: each gets a line once, or is passed over once (a fork, the pane closed). */
const seenAgents = new Set<string>()
/** Subagents with a running line, which shows their latest tool call. */
const trackedAgents = new Set<string>()
/** The last workflow the main chat started, and how many of its agents have a line: what workflow agents are called. */
let lastWorkflow: string | null = null
let workflowAgents = 0
/** Read-only tool calls of the main chat in flight: the mascot reads until the last one returns. */
let readsInFlight = 0
/** Whether a main-chat turn is running: where the mascot stands when he is turned on mid-session. */
let isTurnRunning = false
/** Whether Claude has opened the question pop-up since the person's last prompt: then the bar offers no ? button. */
let isAskedThisRequest = false
/** /keepwarm's one pending timer: its next ping, or its end when no ping is due before then. */
let keepWarmTimer: Timer | null = null
/** The once-a-second timer that redraws running times: running only while the Background tasks pane is open. */
let dockTimer: Timer | null = null
/** The model tools registered so far: each is offered to the model only once its feature is first turned on. */
const registeredTools = new Set<string>()
/** The note's writes, one after another, so the last text typed is the one left on disk. */
let notesSaving: Promise<void> = Promise.resolve()
/** The note as it stands: as loaded, then as the editor last posted it. What Copy copies. */
let latestNotes = ''
/** Trace writes run one after another, so lines written at once are all kept. */
let traceQueue: Promise<void> = Promise.resolve()
/** The Branches pane's timers: its regular read, and the one a changing tool sets. Running only while it is open. */
let branchTimer: Timer | null = null
let branchSoon: Timer | null = null
/** Reads of the pane so far since it opened: every GITHUB_EVERY-th asks GitHub too, and fetches. */
let branchReads = 0
/** The read in flight, and whether another (with GitHub's or not) waits for it to finish. */
let branchReading: Promise<void> | null = null
let branchQueued: { withGithub: boolean } | null = null
/** The branch merges are measured against, found once each time the pane opens. */
let branchBase: string | null = null
/** Lines added and removed since the base, by `<base commit>:<branch commit>`: a branch's are read once per commit. */
let branchStats = new Map<string, { added: number; removed: number }>()
/** GitHub's word, as last read: pull requests by branch and CI by commit. Dropped when the pane closes. */
let githubPrs = new Map<string, PrFacts[]>()
let githubRuns = new Map<string, CiState>()
/**
 * The board's next read, BOARD_REFRESH_MS after the last; armed only while the Project pane is open or the project row
 * shows its open count.
 */
let boardTimer: Timer | null = null
/** The board read in flight: a read asked for meanwhile is dropped, since this one brings the same. */
let boardReading: Promise<void> | null = null

const encoder = new TextEncoder()
const TICK_MS = 30_000
/** Cache times older than this are dropped from the per-session store. */
const CACHE_KEEP_MS = 2 * 60 * 60_000
/** Blank rows between the chat and the bar on the terminal, so the last of a reply does not run into it. */
const TERMINAL_TOP_MARGIN = 1

/** The latest scan, kept here too so a store write that fails costs nothing but persistence. */
let memoryCache: ScanCache | null = null
let isScanning = false
let isScanPending = false
let hasLoggedScanError = false

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Whether a bar option is on and the bar shown: work that only feeds the bar is skipped otherwise. */
async function isShown($: EngineInterface, keys: ToggleKey | readonly ToggleKey[]): Promise<boolean> {
  if (await read($, isHidden)) {
    return false
  }
  const current = normalizeSettings(await read($, settings))

  return (typeof keys === 'string' ? [keys] : keys).some(key => current[key])
}

/** The options whose figures come from the transcript scan: the month's cost, the thread's tokens, the week's share. */
const SCAN_KEYS: readonly ToggleKey[] = ['monthlyCost', 'threadTokens', 'threadPercent']
/** The options that show the session's cost. */
const COST_KEYS: readonly ToggleKey[] = ['threadCost', 'lastTurnCost', 'threadPercent']

/** Whether the mascot is drawn anywhere: its option on, the bar shown, and a surface that draws SVG attached. */
async function isMascotOn($: EngineInterface): Promise<boolean> {
  if (!(await isShown($, 'mascot'))) {
    return false
  }

  return (await $.session.surfaces().catch(() => [])).some(surface => surface !== 'terminal')
}

/** Offers one of the mod's tools to the model, the first time its feature is turned on in this load. */
async function registerTool($: EngineInterface, spec: Parameters<EngineInterface['tool']['register']>[0]): Promise<void> {
  if (registeredTools.has(spec.name)) {
    return
  }
  registeredTools.add(spec.name)
  await $.tool.register(spec).catch(err => {
    registeredTools.delete(spec.name)
    $.ui.log(`aitools: ${spec.name} tool not registered: ${errorText(err)}`)
  })
}

function toWindow(limit: { percentUsed: number; resetsAt?: string } | undefined): LimitWindow | undefined {
  return limit && { percentUsed: limit.percentUsed, resetsAt: limit.resetsAt }
}


function scanIO($: EngineInterface): ScanIO {
  return {
    list: dir => $.fs.list(dir),
    readBytes: async path => encoder.encode(await $.fs.read(path)),
    async tail(path, offset) {
      const run = await $.process.run(['tail', '-c', `+${offset + 1}`, path])
      if (run.exitCode !== 0) {
        throw new Error(`tail exited ${run.exitCode}`)
      }

      return { bytes: encoder.encode(run.stdout), isTruncated: run.isStdoutTruncated }
    },
  }
}

async function projectsRoot($: EngineInterface): Promise<string> {
  return `${await configDir($)}/projects`
}

async function readCache($: EngineInterface): Promise<ScanCache | null> {
  return memoryCache ?? ((await $.store.get('scanCache')) as ScanCache | undefined) ?? null
}

async function scan($: EngineInterface): Promise<void> {
  if (isScanning) {
    isScanPending = true
    return
  }
  isScanning = true
  try {
    do {
      isScanPending = false
      const next = await scanMonth(scanIO($), await projectsRoot($), await readCache($), await $.clock.now())
      memoryCache = next
      await $.store.set('scanCache', next).catch((err: unknown) => logScanError($, err))
      await update($, month, () => ({ usd: next.usd, isEstimate: next.isEstimate, status: 'ready' as const, hours: next.hours }))
      const threadTokens = sessionTokens(next, await $.session.id())
      if (threadTokens !== undefined) {
        await update($, snapshot, snap => ({ ...(snap ?? {}), threadTokens }))
      }
    } while (isScanPending)
  } catch (err) {
    await update($, month, m => ({ ...m, usd: m?.usd ?? 0, isEstimate: m?.isEstimate ?? false, status: 'error' as const }))
    logScanError($, err)
  } finally {
    isScanning = false
  }
}

function logScanError($: EngineInterface, err: unknown): void {
  if (!hasLoggedScanError) {
    hasLoggedScanError = true
    $.ui.log(`aitools: monthly cost scan failed: ${errorText(err)}`)
  }
}

type CacheTimes = Record<string, number>

async function rememberCacheAt($: EngineInterface, at: number): Promise<void> {
  const sessionId = await $.session.id()
  const stored = ((await $.store.get('cacheAt')) as CacheTimes | undefined) ?? {}
  const kept = Object.fromEntries(Object.entries(stored).filter(([, t]) => at - t < CACHE_KEEP_MS))
  await $.store.set('cacheAt', { ...kept, [sessionId]: at })
}

async function restoreCacheAt($: EngineInterface): Promise<void> {
  const stored = ((await $.store.get('cacheAt')) as CacheTimes | undefined) ?? {}
  const at = stored[await $.session.id()]
  if (at !== undefined) {
    await update($, cacheAt, () => at)
  }
}

/** Scans the transcripts soon, if any option showing their figures is on. */
function startScan($: EngineInterface): void {
  $.clock.after(0, () => void scanIfShown($))
}

async function scanIfShown($: EngineInterface): Promise<void> {
  if (await isShown($, SCAN_KEYS)) {
    await scan($)
  }
}

/** Asks a fork of this conversation for the brief: the brief, or the failure's text. Null while one is already running. */
async function writeBrief($: EngineInterface): Promise<Brief | null> {
  if (await read($, isHandingOff)) {
    return null
  }
  await update($, isHandingOff, () => true)
  try {
    const reply = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!reply.isAnswered) {
      const reason = reply.reason === 'nothing-to-fork' ? 'nothing to hand off yet' : reply.reason
      return { status: 'error', text: `Handoff failed: ${reason}` }
    }

    return { status: 'ready', text: reply.text.trim() }
  } catch (err) {
    return { status: 'error', text: `Handoff failed: ${errorText(err)}` }
  } finally {
    await update($, isHandingOff, () => false)
  }
}

/** /handoff: copies the brief and toasts the outcome. Returns the chat row's text. */
async function handoff($: EngineInterface): Promise<string> {
  const written = await writeBrief($)
  if (written === null) {
    return 'Handoff already in progress.'
  }
  if (written.status === 'error') {
    $.ui.toast(written.text)
    return written.text
  }
  const copied = await $.ui.copy({ text: written.text })
  $.ui.toast(copied.isCopied ? 'Handoff brief copied to the clipboard' : 'Handoff brief ready (copy failed)')

  return handoffOutput(written.text)
}

/** Where the note is kept: `.claude/notes.md` under the session's project root. */
async function notesPath($: EngineInterface): Promise<string> {
  return `${(await $.session.root()).replace(/[\\/]$/, '')}/${NOTES_FILE}`
}

/**
 * Reads the note for the pane, once any write still going has landed: none yet is an empty note; a file that is there
 * but cannot be read is an error, so the editor never writes over it.
 */
async function loadNotes($: EngineInterface): Promise<void> {
  await update($, notes, () => null)
  await notesSaving
  const path = await notesPath($)
  let loaded: { text: string } | { error: string }
  if (!(await $.fs.exists(path).catch(() => false))) {
    loaded = { text: '' }
  } else {
    loaded = await $.fs.read(path).then(
      text => (typeof text === 'string' ? { text } : { error: `${NOTES_FILE} is not text.` }),
      (err: unknown) => ({ error: `Could not read ${NOTES_FILE}: ${errorText(err)}` }),
    )
  }
  latestNotes = 'text' in loaded ? loaded.text : ''
  await update($, notes, () => loaded)
}

/** The 🛠 menu's Notes: opens the Notes pane on the note as saved, its keys handed to the editor. */
async function openNotes($: EngineInterface): Promise<void> {
  await update($, isToolsOpen, () => false)
  await update($, isNotesOpen, () => true)
  await $.ui.open({ id: NOTES_PANE, title: 'Notes', focus: true })
  await loadNotes($)
  await $.ui.focus({ requestId: NOTES_PANE, key: NOTES_EDITOR }).catch(() => undefined)
}

/** Saves the note as the editor posted it, after any write before it. */
function saveNotes($: EngineInterface, text: string): void {
  latestNotes = text
  notesSaving = notesSaving
    .then(async () => $.fs.write(await notesPath($), text))
    .catch((err: unknown) => $.ui.log(`aitools: could not save ${NOTES_FILE}: ${errorText(err)}`))
}

/** The Notes pane's Copy: the note as it stands, to the clipboard of the surface pressed on. */
async function copyNotes($: EngineInterface, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']): Promise<void> {
  const copied = await $.ui.copy({ text: latestNotes, surface })
  $.ui.toast(copied.isCopied ? 'Note copied to the clipboard' : 'Copy failed')
}

/** The 🛠 menu's Handoff: writes the brief into the handoff pane, which has its own Copy button. */
async function showHandoff($: EngineInterface): Promise<void> {
  await update($, isToolsOpen, () => false)
  if (await read($, isHandingOff)) {
    $.ui.toast('Handoff already in progress.')
    return
  }
  await update($, brief, () => ({ status: 'writing', text: '' }))
  await $.ui.open({ id: HANDOFF_PANE, title: 'Handoff brief' })
  const written = await writeBrief($)
  if (written !== null) {
    await update($, brief, () => written)
  }
}

/** Copies the handoff pane's brief on the surface the press came from, and says whether it took. */
async function copyBrief($: EngineInterface, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']): Promise<void> {
  const shown = await read($, brief)
  if (shown?.status !== 'ready') {
    return
  }
  const copied = await $.ui.copy({ text: shown.text, surface })
  $.ui.toast(copied.isCopied ? 'Handoff brief copied to the clipboard' : 'Copy failed')
}

async function toggleSetting($: EngineInterface, key: keyof typeof DEFAULT_SETTINGS): Promise<void> {
  const changed = await update($, settings, s => {
    const was = normalizeSettings(s)

    return { ...was, [key]: !was[key] }
  })
  await savePersonal($, { settings: normalizeSettings(changed) })
  if (normalizeSettings(changed)[key]) {
    await catchUp($, key)
  }
  if (key === 'projectRow') {
    // Its servers' ports, and its board's items, are read only while the row shows.
    syncListenerPoll($)
    syncBoardReads($)
  }
}

/**
 * Brings a feature up to date once it is turned on, or the whole bar once it is shown again (`key` absent): the work
 * skipped while it was off.
 */
async function catchUp($: EngineInterface, key?: ToggleKey): Promise<void> {
  startScan($)
  if ((key === undefined || COST_KEYS.includes(key)) && (await isShown($, COST_KEYS))) {
    const cost = (await $.session.usage()).cost?.usd
    if (cost !== undefined) {
      await update($, snapshot, snap => ({ ...(snap ?? {}), threadUsd: cost }))
    }
  }
  if ((key === undefined || key === 'mascot') && (await isMascotOn($))) {
    await syncMascot($)
  }
}
/** Whether a tool's row is hidden: every one under Clean View, the checklist's own under Task View (the band shows it). */
async function isToolRowHidden($: EngineInterface, tool: string): Promise<boolean> {
  return (await read($, isCleanView)) || ((await read($, isTaskView)) && tool === CHECKLIST_TOOL_ID)
}

/** Whether a view is on. */
async function isViewOn($: EngineInterface, view: 'task' | 'clean'): Promise<boolean> {
  return view === 'task' ? read($, isTaskView) : read($, isCleanView)
}

/** Turns one view on or off, on its own: saves it for later sessions and closes the 🛠 menu. */
async function setView($: EngineInterface, view: 'task' | 'clean', isOn: boolean): Promise<void> {
  await update($, isToolsOpen, () => false)
  if (view === 'task') {
    await update($, isTaskView, () => isOn)
  } else {
    await update($, isCleanView, () => isOn)
  }
  await savePersonal($, view === 'task' ? { taskView: isOn } : { cleanView: isOn })
  await showStatus($)
  await startViews($)
}

/** The 🛠 menu's Task View and Clean View: each turns its view on or off. */
async function toggleView($: EngineInterface, view: 'task' | 'clean'): Promise<void> {
  await setView($, view, !(await isViewOn($, view)))
}

/**
 * What the views need once on: for Task View the checklist tool offered to the model, for Clean View the final
 * replies so far (only kept while it is on).
 */
async function startViews($: EngineInterface): Promise<void> {
  if (await read($, isTaskView)) {
    await registerTool($, CHECKLIST_SPEC)
  }
  if (await read($, isCleanView)) {
    const earlier = finalReplies(await $.session.messages().catch(() => []))
    await update($, finals, list => earlier.reduce((acc, text) => addFinal(acc, text), list))
  }
}

/** The status line under the prompt: the views that are on, comma separated; cleared when none. */
async function showStatus($: EngineInterface): Promise<void> {
  const on = [(await read($, isTaskView)) ? VIEW_NAMES.task : '', (await read($, isCleanView)) ? VIEW_NAMES.clean : ''].filter(Boolean)
  $.ui.status(on.length > 0 ? on.join(', ') : undefined)
}

/** /taskview and /cleanview: toggles the view, or sets it with on/off, and says how it stands now. */
async function viewCommand($: EngineInterface, view: 'task' | 'clean', args: string): Promise<{ text: string }> {
  const name = VIEW_NAMES[view]
  const isOn = nextToggle(await isViewOn($, view), args)
  if (isOn === null) {
    return { text: `Usage: /${view}view [on|off] (no argument toggles ${name})` }
  }
  await setView($, view, isOn)

  return { text: `${name} ${isOn ? 'on' : 'off'}.` }
}

/** Redraws the dock's running times each second; with nothing running any more, the timer stops. */
async function bumpDockTick($: EngineInterface): Promise<void> {
  if (isRunning(await read($, agentRun))) {
    await update($, dockTick, n => n + 1)
  } else {
    dockTimer?.cancel()
    dockTimer = null
  }
}

/** Starts the once-a-second redraw while the pane is open and a subagent runs; it stops itself once none does. */
async function startDockTimer($: EngineInterface): Promise<void> {
  if (dockTimer === null && (await read($, isDockOpen)) && isRunning(await read($, agentRun))) {
    dockTimer = $.clock.every(1000, () => void bumpDockTick($))
  }
}

/** Opens or closes the Background tasks pane; tasks are tracked either way. */
async function setDockOpen($: EngineInterface, isOpen: boolean): Promise<void> {
  await update($, isDockOpen, () => isOpen)
  if (isOpen) {
    await $.ui.open({ id: DOCK_PANE, title: DOCK_TITLE })
  } else {
    await $.ui.close({ id: DOCK_PANE })
  }
  await syncDock($)
  await showStatus($)
}

/**
 * Runs the pane's work only while it is open: its once-a-second redraw timer while a subagent runs, and the progress
 * tool its subagents report through.
 */
async function syncDock($: EngineInterface): Promise<void> {
  if (!(await read($, isDockOpen))) {
    dockTimer?.cancel()
    dockTimer = null
    return
  }
  await startDockTimer($)
  await registerTool($, PROGRESS_SPEC)
}

/** /subagents: opens the pane if closed, closes it if open. */
async function toggleDock($: EngineInterface): Promise<boolean> {
  const isOpen = !(await read($, isDockOpen))
  await setDockOpen($, isOpen)

  return isOpen
}

/** The 🛠 menu's Tasks: opens the Background tasks pane (its own close mark closes it), and closes the menu. */
async function openDock($: EngineInterface): Promise<void> {
  await update($, isToolsOpen, () => false)
  await setDockOpen($, true)
}

/** The pane's Showing pick, saved for later sessions. */
async function setShowing($: EngineInterface, showing: AgentShowing): Promise<void> {
  await update($, agentShowing, () => showing)
  await savePersonal($, { showing })
}

/** The pane's Hide after pick, saved for later sessions. */
async function setHideAfter($: EngineInterface, minutes: HideAfter): Promise<void> {
  await update($, hideAfter, () => minutes)
  await savePersonal($, { hideAfter: minutes })
}

/** Appends one line to the Background tasks pane trace in the store, the newest TRACE_KEEP kept, one write after another. */
function traceDock($: EngineInterface, line: string): Promise<void> {
  traceQueue = traceQueue.then(() => appendTrace($, line)).catch(() => undefined)

  return traceQueue
}

/** Reads the trace, adds one timed line and writes it back; only ever run through traceDock's queue. */
async function appendTrace($: EngineInterface, line: string): Promise<void> {
  const at = new Date(await $.clock.now()).toISOString().slice(11, 19)
  const trace = ((await $.store.get('dockTrace')) as string[] | undefined) ?? []
  await $.store.set('dockTrace', [...trace, `${at} ${line}`].slice(-TRACE_KEEP))
}

/** Waits for `work`, or `ms` at most, whichever comes first. */
function waitAtMost($: EngineInterface, work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise(resolve => {
    $.clock.after(ms, () => resolve())
    void work.then(() => resolve(), () => resolve())
  })
}

/**
 * Changes the tasks, and the running count the project row shows with them: the row redraws only when the count
 * changes, not on every line's activity.
 */
async function updateRun($: EngineInterface, change: (run: AgentRun | null) => AgentRun | null): Promise<void> {
  await update($, agentRun, change)
  const count = runningCount(await read($, agentRun))
  if ((await read($, runningTasks)) !== count) {
    await update($, runningTasks, () => count)
  }
}

/** Marks a task finished: its line turns done, failed or stopped and moves down to the top of the finished ones. */
async function endTask($: EngineInterface, id: string, status: EndStatus): Promise<void> {
  trackedAgents.delete(id)
  const now = await $.clock.now()
  await updateRun($, run => (run === null ? run : finishCard(run, id, status, now)))
}

/** Finishes the line of every task a notice in `text` says has ended. */
async function endNoticedTasks($: EngineInterface, text: string): Promise<void> {
  for (const notice of parseTaskNotices(text)) {
    const status = noticeEnd(notice)
    if (status !== null) await endTask($, notice.id, status)
  }
}

/** Gives a task a line, once; a subagent's or workflow agent's line follows its tool calls. */
async function trackTask(
  $: EngineInterface,
  id: string,
  task: string,
  kind: AgentKind,
  extra: Pick<AgentCard, 'doing' | 'expiresAt' | 'endsWith'> = {},
): Promise<void> {
  seenAgents.add(id)
  if (kind === 'subagent' || kind === 'workflow') trackedAgents.add(id)
  const now = await $.clock.now()
  await updateRun($, r => addCard(r ?? newRun(now), id, task, now, kind, extra))
  await startDockTimer($)
}

/**
 * A subagent loop the pane has no line for yet, at its first model request: one the engine lists (started before the
 * pane opened, or by another plugin) gets its own description; one it does not list is a workflow's agent while a
 * workflow has been started, else the engine's own fork, which is passed over.
 */
async function noticeAgent($: EngineInterface, id: string): Promise<void> {
  seenAgents.add(id)
  if (await read($, isHandingOff)) {
    return
  }
  const listed = (await $.agent.list().catch(() => [])).find(a => a.id === id)
  if (listed !== undefined) {
    await trackTask($, id, listed.description, 'subagent')
  } else if (lastWorkflow !== null) {
    workflowAgents += 1
    await trackTask($, id, `${lastWorkflow} · agent ${workflowAgents}`, 'workflow')
  }
}

/**
 * Finishes any line whose task is over though its finish was never heard: a subagent the engine no longer has
 * running, a monitor past its deadline.
 */
async function settleCards($: EngineInterface): Promise<void> {
  const run = await read($, agentRun)
  if (!isRunning(run)) {
    return
  }
  const now = await $.clock.now()
  for (const card of run?.cards.filter(c => c.status === 'running' && c.expiresAt !== undefined && c.expiresAt <= now) ?? []) {
    await endTask($, card.id, 'done')
  }
  const agents = await $.agent.list().catch(() => null)
  if (agents === null) {
    return
  }
  // A subagent the engine no longer lists has finished too; only one listed as running or pending is still at work. A
  // workflow's agents are never listed, nor are commands and monitors: their own finish is the only word on them.
  for (const card of run?.cards.filter(c => c.status === 'running' && kindOf(c) === 'subagent') ?? []) {
    const status = agents.find(a => a.id === card.id)?.status ?? 'gone'
    if (status !== 'running' && status !== 'pending') {
      await traceDock($, `settled ${card.task}: ${status}`)
      await endTask($, card.id, status === 'failed' ? 'failed' : status === 'killed' ? 'stopped' : 'done')
    }
  }
}


/**
 * Starts a subagent as Claude Code would, given a line in the pane; while the pane is open it is also asked to report
 * its progress there. Its start counts as in flight, so its first request finds the line rather than racing it.
 */
async function startSubagent(
  $: EngineInterface,
  e: Parameters<Events['agent.spawn']>[1],
  next: Parameters<Events['agent.spawn']>[2],
): Promise<Awaited<ReturnType<Events['agent.spawn']>>> {
  const note = (await read($, isDockOpen)) ? SUBAGENT_NOTE : ''
  let settle = () => {}
  const inFlight = new Promise<void>(resolve => (settle = resolve))
  startsInFlight.add(inFlight)
  try {
    const started = await next({ ...e, prompt: e.prompt + note })
    if (started.agentId !== undefined) {
      await trackTask($, started.agentId, e.description, 'subagent')
    }

    return started
  } finally {
    startsInFlight.delete(inFlight)
    settle()
  }
}

/**
 * Shows `pose`, playing its transition from the pose before first; `rest` is the pose a moment pose (ONE_SHOT_MS)
 * gives way to. Showing the pose already up only changes what it gives way to.
 */
async function showMascot($: EngineInterface, pose: MascotPose, rest: MascotPose = pose): Promise<void> {
  if (!(await isMascotOn($))) {
    return
  }
  const now = await $.clock.now()
  // Checked inside the update, so two calls at once (parallel tool calls) change the pose once.
  let isChanged = false
  const shown = await update($, mascot, m => {
    isChanged = m.pose !== pose
    return isChanged ? { pose, rest, from: m.pose, change: m.change + 1, seq: m.seq + 1, since: now } : { ...m, rest }
  })
  if (!isChanged) {
    return
  }
  const { change } = shown
  // Once the intro has played the source drops it, so a redraw can only ever restart the loop.
  $.clock.after(introMs(pose, shown.from), () => void settleMascot($, change))
  const hold = ONE_SHOT_MS[pose]
  if (hold !== undefined) {
    $.clock.after(hold, () => void endMoment($, change))
  }
}

/** Drops the played intro from the mascot's source, unless the pose changed since. */
async function settleMascot($: EngineInterface, change: number): Promise<void> {
  await update($, mascot, m => (m.change === change && m.from !== null ? { ...m, from: null, seq: m.seq + 1 } : m))
}

/** A moment pose that is still up gives way to the pose underneath it. */
async function endMoment($: EngineInterface, change: number): Promise<void> {
  const shown = await read($, mascot)
  if (shown.change === change) {
    await showMascot($, shown.rest)
  }
}

/** The pose underneath when no turn runs: puzzled while a question waits on the person, standing otherwise. */
async function restingPose($: EngineInterface): Promise<MascotPose> {
  return (await read($, asking)) > 0 || (await read($, isQuestionOpen)) ? 'puzzled' : 'idle'
}

/**
 * Where the mascot should be when he is turned on: his poses were not followed while he was off, so the question
 * left open is read back from the conversation.
 */
async function syncMascot($: EngineInterface): Promise<void> {
  const isAsked = isQuestionOpenIn(await $.session.messages().catch(() => []))
  await update($, isQuestionOpen, () => isAsked)
  await showMascot($, isTurnRunning ? 'working' : await restingPose($))
}

/** Standing idle long enough, the mascot sits down and falls asleep; the person's next prompt wakes him. */
async function checkSleep($: EngineInterface): Promise<void> {
  const shown = await read($, mascot)
  if (shown.pose === 'idle' && (await $.clock.now()) - shown.since >= SLEEP_AFTER_MS && (await isMascotOn($))) {
    await showMascot($, 'sleeping')
  }
}

/** Draws nothing in a transcript row's place: how Clean View hides tool calls and in-progress replies. */
function drawNothing($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0]) {
  const { Box } = $.ui.resolve(e)

  return <Box key="aitools-hidden" display="none" />
}

/** Opens or closes the 🛠 menu above the bar. */
async function toggleMenu($: EngineInterface): Promise<void> {
  await update($, isToolsOpen, open => !open)
}

/** ⁝: opens the AI Tool Settings pane, both files read first so it shows them as they stand, or closes it. */
async function toggleSettingsPane($: EngineInterface): Promise<void> {
  await update($, isToolsOpen, () => false)
  if (await read($, isSettingsOpen)) {
    await update($, isSettingsOpen, () => false)
    await $.ui.close({ id: SETTINGS_PANE })
    return
  }
  await reloadConfigs($)
  await update($, settingsNote, () => null)
  await update($, isSettingsOpen, () => true)
  await $.ui.open({ id: SETTINGS_PANE, title: SETTINGS_TITLE })
}

/**
 * The settings pane's project fields, written to the project file the row reads (the checkout's when there is none
 * yet), keeping everything else in it; then read back, so the row and the pane follow. A refused URL or a file that
 * can't be read or written says why in the pane instead.
 */
async function saveProject($: EngineInterface, change: ProjectChange): Promise<void> {
  const repo = await read($, githubRepo)
  if (repo === null) {
    return
  }
  const fail = (text: string) => update($, settingsNote, () => ({ text, isError: true }))
  const problem = typeof change.board === 'string' ? boardProblem(change.board) : null
  if (problem !== null) {
    await fail(problem)
    return
  }
  const path = projectPath ?? `${repo.checkout}/.claude/${CONFIG_FILE}`
  const text = await readText($, path)
  let raw: Json = {}
  if (text !== null) {
    const parsed = parseConfig(text)
    if ('error' in parsed) {
      await fail(`${path} isn't valid JSON (${parsed.error}), so it was left as it is.`)
      return
    }
    raw = parsed.value
  }
  try {
    await $.fs.write(path, configText(withProject(raw, change)))
  } catch (err) {
    await fail(`Couldn't save ${path}: ${errorText(err)}`)
    return
  }
  await update($, settingsNote, () => null)
  await loadProject($)
}

/** Every 30 s: countdowns redraw while the bar shows; the mascot may fall asleep. */
async function onTick($: EngineInterface): Promise<void> {
  if (!(await read($, isHidden))) {
    await update($, tick, n => (n ?? 0) + 1)
  }
  await checkSleep($)
  // The config files may have been edited by hand, and the branch changed in a terminal.
  await reloadConfigs($)
  await refreshRepo($)
}

/** The mascot drawing last built: it only changes with the pose, so redraws of the bar reuse it. */
let lastMascot: { state: MascotState; drawing: ReturnType<typeof mascotDrawing> } | null = null

function drawMascot(state: MascotState): ReturnType<typeof mascotDrawing> {
  if (lastMascot?.state.pose !== state.pose || lastMascot.state.from !== state.from || lastMascot.state.seq !== state.seq) {
    lastMascot = { state, drawing: mascotDrawing(state) }
  }

  return lastMascot.drawing
}

/** Where a session's /keepwarm window is kept, so a restart of the session picks it up again. */
const keepWarmKey = (sessionId: string) => `keepWarm:${sessionId}`

/**
 * Sets /keepwarm's one timer: its next ping, KEEPWARM_LEAD_MS before the cache lapses, or, with no ping due (no request
 * yet, the cache already cold, or warm past the window), the window's end. Run again after every main turn and ping.
 */
async function armKeepWarm($: EngineInterface): Promise<void> {
  keepWarmTimer?.cancel()
  keepWarmTimer = null
  const kw = await read($, keepWarm)
  if (kw === null) {
    return
  }
  const now = await $.clock.now()
  if (now >= kw.until) {
    await stopKeepWarm($, null)
    return
  }
  const delay = pingDelay(now, await read($, cacheAt), kw.until)
  keepWarmTimer =
    delay === null
      ? $.clock.after(kw.until - now, () => void armKeepWarm($))
      : $.clock.after(delay, () => void pingCache($))
}

/** Ends /keepwarm: on time or turned off (`why` null), or early, with the reason /keepwarm status gives. */
async function stopKeepWarm($: EngineInterface, why: string | null): Promise<void> {
  keepWarmTimer?.cancel()
  keepWarmTimer = null
  await update($, keepWarm, () => null)
  await update($, keepWarmStopped, () => why)
  await $.store.delete(keepWarmKey(await $.session.id())).catch(() => undefined)
  if (why !== null) {
    $.ui.log(`aitools: keepwarm stopped: ${why}`)
  }
}

/**
 * One keepwarm ping: a request over the conversation as the main thread last sent it (`$.model.fork`), which the API
 * serves from the cache, restarting its hour. Its readback must show a read of the prefix; anything else stops the
 * window, since the cache is gone and pinging on would pay a write every hour.
 */
async function pingCache($: EngineInterface): Promise<void> {
  keepWarmTimer = null
  const kw = await read($, keepWarm)
  const at = await read($, cacheAt)
  const now = await $.clock.now()
  // A turn's own requests keep the cache warm, and its end sets the timer again; a request since the timer was set
  // has moved the ping later.
  if (kw === null || isTurnRunning || at === null || now < at + CACHE_TTL - KEEPWARM_LEAD_MS - 1000) {
    if (!isTurnRunning) await armKeepWarm($)
    return
  }
  if (now >= kw.until || now >= at + CACHE_TTL) {
    await armKeepWarm($)
    return
  }
  let reply: Awaited<ReturnType<EngineInterface['model']['fork']>>
  try {
    reply = await $.model.fork({ prompt: KEEPWARM_PROMPT })
  } catch (err) {
    await stopKeepWarm($, `the ping failed: ${errorText(err)}`)
    return
  }
  if (!reply.isAnswered) {
    await stopKeepWarm($, failureText(reply.reason, 'status' in reply ? reply.status : null))
    return
  }
  if (!isWarmReadback(reply.usage)) {
    await stopKeepWarm($, coldPingText(reply.usage))
    return
  }
  const model = await read($, mainModel)
  const cost = model === null ? null : price(model, reply.usage)
  const pinged = await $.clock.now()
  const receipt = { at: pinged, read: reply.usage.cache_read_input_tokens, usd: cost?.usd ?? null, isEstimate: cost?.isEstimate ?? false }
  await update($, cacheAt, () => pinged)
  await rememberCacheAt($, pinged).catch(() => undefined)
  await update($, keepWarm, k => (k === null ? k : { ...k, lastPing: receipt }))
  await armKeepWarm($)
}

/** `/keepwarm [6h|90m|off|status]`: starts (6 hours bare), ends or reports keeping the cache warm. */
async function keepWarmCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const asked = parseKeepWarm(args)
  if (asked === null || asked.kind === 'help') {
    return { text: KEEPWARM_HELP }
  }
  if (asked.kind === 'stop') {
    const wasOn = (await read($, keepWarm)) !== null
    await stopKeepWarm($, null)
    return { text: wasOn ? 'Keepwarm stopped: the cache lapses an hour after the last request.' : 'Keepwarm is already off.' }
  }
  // One reading of the clock, so `/keepwarm 5h` reports 5h0m, not the 4h59m a later reading would floor to.
  const now = await $.clock.now()
  if (asked.kind === 'start') {
    const until = now + asked.ms
    await update($, keepWarm, () => ({ until, lastPing: null }))
    await update($, keepWarmStopped, () => null)
    await $.store.set(keepWarmKey(await $.session.id()), until)
    await armKeepWarm($)
  }

  return { text: keepWarmStatus(await read($, keepWarm), await read($, keepWarmStopped), await read($, cacheAt), now) }
}

/** On load: a window this session saved (before a restart) comes back, and the timer is set again either way. */
async function restoreKeepWarm($: EngineInterface): Promise<void> {
  if ((await read($, keepWarm)) === null) {
    const saved = await $.store.get(keepWarmKey(await $.session.id()))
    if (typeof saved === 'number' && saved > (await $.clock.now())) {
      await update($, keepWarm, () => ({ until: saved, lastPing: null }))
    }
  }
  await armKeepWarm($)
}

/**
 * The bar's ? button: /askme's prompt sent as the person's, or, while a turn runs or when the prompt cannot be sent,
 * `/askme` put in the prompt box ahead of any draft (which then rides along as its note) to send by hand. When the box
 * cannot take it either, the button stays.
 */
async function askFromBar($: EngineInterface, isWorking: boolean): Promise<void> {
  await update($, isAskable, () => false)
  if (!isWorking) {
    const sent = await $.prompt.submit({ text: askmeText(''), asUser: true }).catch(() => null)
    if (sent !== null && sent.drop === undefined) {
      return
    }
  }
  const draft = (await $.prompt.read()).text.trim()
  const filled = await $.prompt.fill({ text: draft === '' ? '/askme' : `/askme ${draft}` }).catch(() => null)
  if (!filled?.isFilled) {
    await update($, isAskable, () => true)
  }
}

/** The bar, with the 🛠 or ⁝ menu above it while one is open, for the AbovePrompt band. */
async function drawBar($: EngineInterface, el: Parameters<typeof renderBar>[0], isWorking: boolean) {
  await read($, tick)
  const current = normalizeSettings(await read($, settings))

  const view = {
    snapshot: await read($, snapshot),
    month: await read($, month),
    projection: await read($, projection),
    cacheAt: await read($, cacheAt),
    model: await read($, mainModel),
    settings: current,
    now: await $.clock.now(),
  }
  const flags = {
    isWorking,
    isHandingOff: await read($, isHandingOff),
    isToolsOpen: await read($, isToolsOpen),
    isAskable: await read($, isAskable),
    isKeepingWarm: (await read($, keepWarm)) !== null,
    isTaskView: await read($, isTaskView),
    isCleanView: await read($, isCleanView),
    hasRepo: (await read($, githubRepo)) !== null,
    // Read only where it is drawn and turned on, so no other bar redraws for the mascot.
    mascot: el.Svg && current.mascot ? drawMascot(await read($, mascot)) : null,
  }
  // Closed (× on its title row), the checklist stays away until the person's next prompt.
  const list =
    !flags.isTaskView || (await read($, isChecklistClosed))
      ? null
      : renderChecklist(el, await read($, checklist), isWorking, await read($, isChecklistCollapsed), {
          toggle: () => void update($, isChecklistCollapsed, isCollapsed => !isCollapsed),
          close: () => void update($, isChecklistClosed, () => true),
        })

  const projectRow = await drawProjectRow($, el, el.Svg ? 0 : 2)

  return renderBar(el, view, flags, {
    toggleTools: () => void toggleMenu($),
    askme: () => void askFromBar($, isWorking),
    handoff: () => void showHandoff($),
    openNotes: () => void openNotes($),
    toggleSettings: () => void toggleSettingsPane($),
    toggleView: view => void toggleView($, view),
    openDock: () => void openDock($),
    openBranches: () => void openBranches($),
    openProject: () => void openProject($),
  }, list, projectRow)
}

async function measure($: EngineInterface, e: { rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]; context: Snapshot['context'] & {}; cost?: { usd: number } }) {
  const previous = await read($, snapshot)
  // Off the subscription's ledger, the session's cost comes from the last scan, if a cost is shown at all.
  const cache = e.cost || !(await isShown($, COST_KEYS)) ? null : await readCache($)
  const fallback = cache ? sessionUsd(cache, await $.session.id()) : undefined
  const snap: Snapshot = {
    fiveHour: toWindow(e.rateLimits.find(r => r.kind === 'five_hour')) ?? previous?.fiveHour,
    weekly: toWindow(e.rateLimits.find(r => r.kind === 'seven_day')) ?? previous?.weekly,
    context: e.context.tokens === undefined ? (previous?.context ?? e.context) : e.context,
    threadUsd: e.cost?.usd ?? fallback,
    lastTurnUsd: previous?.lastTurnUsd,
    threadTokens: previous?.threadTokens,
    lastTurnTokens: previous?.lastTurnTokens,
  }
  await update($, snapshot, () => snap)
  // Kept for the next session's first figures; only the usage limits are read back.
  if (await isShown($, ['fiveHour', 'weekly'])) {
    await $.store.set('lastSnapshot', snap)
  }
  // The projection samples the 5-hour usage only while it is shown: turned on, it has a projection again once two
  // responses an hour apart or so have been sampled.
  if (!(await isShown($, 'burnRate'))) {
    await update($, projection, () => null)
    return
  }
  const now = await $.clock.now()
  let burn = ((await $.store.get('burn')) as BurnState | undefined) ?? EMPTY_BURN
  if (snap.fiveHour) {
    burn = addSample(burn, now, snap.fiveHour.percentUsed, snap.fiveHour.resetsAt)
    await $.store.set('burn', burn)
  }
  await update($, projection, () => project(burn, now))
}

/** Git without prompts (a push that needs a password fails rather than waits) or the index refresh `status` writes. */
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }

/** Runs git in `cwd`; a git that cannot start reads as a failed run. */
async function git($: EngineInterface, args: readonly string[], cwd: string, timeoutMs?: number) {
  try {
    return await $.process.run(['git', ...args], { cwd, env: GIT_ENV, timeoutMs })
  } catch (error) {
    return { exitCode: 1, stdout: '', stderr: String(error), isStdoutTruncated: false, isStderrTruncated: false }
  }
}

/** The branch merges are measured against: origin's default, else origin/main or master, else a local main or master. */
async function findBase($: EngineInterface, root: string, fallback: string | null): Promise<string> {
  const head = await git($, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], root)
  if (head.exitCode === 0 && head.stdout.trim()) {
    return head.stdout.trim()
  }
  for (const name of ['origin/main', 'origin/master', 'main', 'master']) {
    if ((await git($, ['rev-parse', '--verify', '--quiet', name], root)).exitCode === 0) {
      return name
    }
  }

  return fallback ?? 'HEAD'
}

/** GitHub's pull requests and CI runs, through `gh`; left as they were when it is missing or signed out. */
async function readGithub($: EngineInterface, root: string): Promise<void> {
  const gh = (args: string[]) =>
    $.process.run(['gh', ...args], { cwd: root, env: { GH_PROMPT_DISABLED: '1' }, timeoutMs: 20_000 }).catch(() => null)
  const [prs, runs] = await Promise.all([
    gh(['pr', 'list', '--state', 'all', '--limit', '100', '--json', 'number,url,state,headRefName,headRefOid,statusCheckRollup']),
    gh(['run', 'list', '--limit', '100', '--json', 'headSha,status,conclusion']),
  ])
  if (prs?.exitCode === 0) githubPrs = parsePrs(prs.stdout)
  if (runs?.exitCode === 0) githubRuns = parseRuns(runs.stdout)
}

/** The remote whose branches the pane lists: the base's (`origin/main` is origin's), else origin. */
function remoteOf(base: string): string {
  return /^([^/]+)\//.exec(base)?.[1] ?? 'origin'
}

/** What git says of one worktree's folder: its changes, its commits the base lacks, its last commit, its lines. */
async function readCheckout($: EngineInterface, entry: WorktreeEntry, root: string, base: string): Promise<CheckoutFacts> {
  if (entry.isMissing) {
    // No folder to look in: its commits are counted from the main checkout.
    const ahead = await git($, ['rev-list', '--count', `${base}..${entry.head}`], root)
    return { changedFiles: 0, aheadOfBase: Number(ahead.stdout.trim() || 0), committedAt: null, added: 0, removed: 0 }
  }
  const [status, ahead, mergeBase, last] = await Promise.all([
    git($, ['status', '--porcelain'], entry.path),
    git($, ['rev-list', '--count', `${base}..HEAD`], entry.path),
    git($, ['merge-base', 'HEAD', base], entry.path),
    git($, ['log', '-1', '--format=%ct'], entry.path),
  ])
  const stat = mergeBase.exitCode === 0 ? await git($, ['diff', '--shortstat', mergeBase.stdout.trim()], entry.path) : null

  return {
    changedFiles: countChanged(status.stdout),
    aheadOfBase: Number(ahead.stdout.trim() || 0),
    committedAt: last.exitCode === 0 && last.stdout.trim() ? Number(last.stdout.trim()) * 1000 : null,
    ...parseShortstat(stat?.stdout ?? ''),
  }
}

/** Lines added and removed since the base for each branch commit, read once per commit and kept while the pane is open. */
async function readStats($: EngineInterface, root: string, base: string, baseSha: string, tips: readonly string[]): Promise<Map<string, { added: number; removed: number }>> {
  const unread = [...new Set(tips)].filter(sha => sha && !branchStats.has(`${baseSha}:${sha}`))
  await Promise.all(
    unread.map(async sha => {
      const diff = await git($, ['diff', '--shortstat', `${base}...${sha}`], root)
      if (diff.exitCode === 0) branchStats.set(`${baseSha}:${sha}`, parseShortstat(diff.stdout))
    }),
  )

  return new Map(tips.flatMap(sha => {
    const stat = branchStats.get(`${baseSha}:${sha}`)
    return stat === undefined ? [] : [[sha, stat] as const]
  }))
}

/**
 * Reads every branch of the session's repository into the pane, local and remote, with the worktrees they are checked
 * out in; with `withGithub`, fetches from the remote (pruning branches it no longer has) and reads GitHub first.
 */
async function readBranches($: EngineInterface, withGithub: boolean): Promise<void> {
  const cwd = await $.session.cwd()
  const top = await git($, ['rev-parse', '--show-toplevel'], cwd)
  if (top.exitCode !== 0) {
    await update($, branchList, () => ({ status: 'error' as const, text: "This folder isn't in a git repository." }))
    return
  }
  const entries = parseWorktreeList((await git($, ['worktree', 'list', '--porcelain'], cwd)).stdout)
  const main = entries[0]
  if (main === undefined) {
    await update($, branchList, () => ({ status: 'error' as const, text: "Git didn't list any worktrees." }))
    return
  }
  const root = main.path
  branchBase ??= await findBase($, root, main.branch)
  const base = branchBase
  const remote = remoteOf(base)
  if (withGithub) {
    await Promise.all([git($, ['fetch', '--prune', '--quiet', remote], root, 60_000), readGithub($, root)])
  }
  const [refsRun, lineRun] = await Promise.all([
    git($, ['for-each-ref', `--format=${refFormat(base)}`, 'refs/heads', `refs/remotes/${remote}`], root),
    git($, ['rev-list', '--first-parent', `--max-count=${FIRST_PARENT_DEPTH}`, base], root),
  ])
  const { locals, remotes } = parseRefs(refsRun.stdout)
  const baseLine = lineRun.stdout.split('\n').filter(Boolean)
  const [checkouts, stats] = await Promise.all([
    Promise.all(entries.map(async entry => [entry.path, await readCheckout($, entry, root, base)] as const)).then(pairs => new Map(pairs)),
    readStats($, root, base, baseLine[0] ?? '', [...[...locals.values()].map(l => l.sha), ...[...remotes.values()].map(r => r.sha)]),
  ])
  // Closed while reading: nothing is shown, so nothing is kept.
  if (!(await read($, isBranchesOpen))) {
    return
  }
  const branches = joinBranches({
    base,
    remote,
    entries,
    current: top.stdout.trim(),
    locals,
    remotes,
    checkouts,
    stats,
    baseLine: new Set(baseLine),
    prs: githubPrs,
    runs: githubRuns,
  })
  await update($, branchList, () => ({ status: 'ready' as const, base, branches }))
}

/**
 * Reads the pane again while it is open, one read at a time: a read asked for while one runs waits for it, and
 * several asked for meanwhile come to one.
 */
async function refreshBranches($: EngineInterface, withGithub = false): Promise<void> {
  if (!(await read($, isBranchesOpen))) {
    return
  }
  if (branchReading !== null) {
    branchQueued = { withGithub: withGithub || (branchQueued?.withGithub ?? false) }
    return
  }
  branchReading = readBranches($, withGithub).catch(async error => {
    await update($, branchList, () => ({ status: 'error' as const, text: `Couldn't read the branches: ${String(error)}` }))
  })
  await branchReading
  branchReading = null
  const queued = branchQueued
  branchQueued = null
  if (queued !== null) {
    await refreshBranches($, queued.withGithub)
  }
}

/** The pane's regular read, GitHub's and a fetch every GITHUB_EVERY-th time; none while it removes branches. */
async function onBranchTick($: EngineInterface): Promise<void> {
  branchReads += 1
  if ((await read($, branchAction))?.step !== 'busy') {
    await refreshBranches($, branchReads % GITHUB_EVERY === 0)
  }
}

/** Runs the pane's reads only while it is open; closed, its timers stop and what it read is dropped. */
function syncBranches($: EngineInterface, isOpen: boolean): void {
  if (isOpen) {
    branchTimer ??= $.clock.every(REFRESH_MS, () => void onBranchTick($))
    return
  }
  branchTimer?.cancel()
  branchSoon?.cancel()
  branchTimer = null
  branchSoon = null
  branchReads = 0
  branchBase = null
  branchStats = new Map()
  githubPrs = new Map()
  githubRuns = new Map()
}

/** The pane's Refresh: a fetch, git and GitHub read now, and the next scheduled GitHub read a full interval later. */
async function refreshBranchesNow($: EngineInterface): Promise<void> {
  if ((await read($, branchAction))?.step === 'busy') {
    return
  }
  branchReads = 0
  await refreshBranches($, true)
}

/** Opens or closes the Branches pane; opening fetches and reads everything at once, GitHub included. */
async function setBranchesOpen($: EngineInterface, isOpen: boolean): Promise<void> {
  await update($, isBranchesOpen, () => isOpen)
  syncBranches($, isOpen)
  if (!isOpen) {
    await $.ui.close({ id: BRANCHES_PANE })
    return
  }
  await update($, branchAction, () => null)
  await update($, branchList, list => (list?.status === 'ready' ? list : { status: 'loading' as const }))
  await $.ui.open({ id: BRANCHES_PANE, title: BRANCHES_TITLE })
  void refreshBranches($, true)
}

/** The 🛠 menu's Branches: opens the pane (its own close mark closes it), and closes the menu. */
async function openBranches($: EngineInterface): Promise<void> {
  await update($, isToolsOpen, () => false)
  await setBranchesOpen($, true)
}

/** After a tool that can change files, the open pane reads again shortly: a burst of calls reads once. */
function branchesSoon($: EngineInterface): void {
  branchSoon?.cancel()
  branchSoon = $.clock.after(AFTER_TOOL_MS, () => {
    branchSoon = null
    void refreshBranches($)
  })
}

/** The pane's Branches pick, saved for later sessions. */
async function setBranchesWhere($: EngineInterface, where: BranchesWhere): Promise<void> {
  await update($, branchesWhere, () => where)
  await savePersonal($, { branchesWhere: where })
}

/** The pane's Show pick, saved for later sessions. */
async function setBranchesShow($: EngineInterface, show: BranchesShow): Promise<void> {
  await update($, branchesShow, () => show)
  await savePersonal($, { branchesShow: show })
}

/**
 * Removes everything one row stands for: its worktree, then its local branch, then its remote branch, stopping at the
 * first that fails. `force` removes a worktree with changes.
 */
async function removeBranch($: EngineInterface, b: Branch, root: string, force: boolean): Promise<Removal> {
  const result: Removal = { name: b.name, isWorktreeRemoved: false, isBranchDeleted: false, isRemoteDeleted: false }
  if (b.checkout !== null) {
    const removed = b.checkout.isMissing
      ? await git($, ['worktree', 'prune'], root)
      : await git($, ['worktree', 'remove', ...(force ? ['--force'] : []), b.checkout.path], root, 60_000)
    if (removed.exitCode !== 0) {
      return { ...result, error: firstLine(removed.stderr) || 'git refused' }
    }
    result.isWorktreeRemoved = true
  }
  if (b.isLocal) {
    // Whether it is done is the pane's own reckoning (a squash merge included), so git is not asked again.
    const deleted = await git($, ['branch', '-D', b.name], root)
    if (deleted.exitCode !== 0) {
      return { ...result, error: firstLine(deleted.stderr) || 'git refused' }
    }
    result.isBranchDeleted = true
  }
  if (b.remote !== null) {
    const pushed = await git($, ['push', b.remote.name, '--delete', b.remote.branch], root, 60_000)
    if (pushed.exitCode !== 0) {
      return { ...result, error: firstLine(pushed.stderr) || 'the push failed' }
    }
    result.isRemoteDeleted = true
  }

  return result
}

/**
 * Carries out what the pane asked and the person said yes to: every done branch, or the one row. The rows are read
 * again first, so nothing changed since the last read is removed on stale facts. Clawd sweeps meanwhile, for SWEEP_MS
 * at least.
 */
async function confirmBranches($: EngineInterface): Promise<void> {
  const action = await read($, branchAction)
  if (action?.step !== 'ask') {
    return
  }
  const target: BranchTarget = action.target
  const startedAt = await $.clock.now()
  await update($, branchAction, () => ({ step: 'busy' as const, target }))
  await branchReading
  await readBranches($, false).catch(() => undefined)
  const list = await read($, branchList)
  const rows = list?.status === 'ready' ? list.branches : []
  const root = rows.find(b => b.checkout?.isMain)?.checkout?.path ?? (await $.session.cwd())
  const results: Removal[] = []
  if (target.kind === 'clean') {
    for (const b of rows.filter(isCleanable)) {
      results.push(await removeBranch($, b, root, false))
    }
    await git($, ['worktree', 'prune'], root)
  } else {
    const b = rows.find(row => row.name === target.name)
    const none = { isWorktreeRemoved: false, isBranchDeleted: false, isRemoteDeleted: false }
    if (b === undefined) {
      results.push({ name: target.name, ...none, error: 'it is no longer listed' })
    } else if (!isDeletable(b)) {
      results.push({ name: b.name, ...none, error: 'it is in use' })
    } else {
      results.push(await removeBranch($, b, root, !isCleanable(b)))
    }
  }
  const done = removedText(results)
  await readBranches($, false).catch(() => undefined)
  const finish = () => void update($, branchAction, () => ({ step: 'done' as const, ...done }))
  const left = SWEEP_MS - ((await $.clock.now()) - startedAt)
  if (left > 0) {
    $.clock.after(left, finish)
  } else {
    finish()
  }
}

/** Sets the pane's question; a press while branches are being removed changes nothing. */
async function askBranches($: EngineInterface, target: BranchTarget | null): Promise<void> {
  await update($, branchAction, action => (action?.step === 'busy' ? action : target === null ? null : { step: 'ask' as const, target }))
}

// ---- aitools.json: the person's settings in ~/.claude, the project row's in the repository ----

/** The global file's path, its text as last read or written, and whether it has been read since the module loaded. */
let globalPath: string | null = null
let globalText: string | null = null
let isGlobalLoaded = false
/** The project file the row reads (the session's checkout's, else the main checkout's) and its text as last read. */
let projectPath: string | null = null
let projectText: string | null = null
let isProjectLoaded = false
/** Problems already reported this load, so a file read every 30 seconds says each once. */
const reportedProblems = new Set<string>()

/** The Claude config folder: CLAUDE_CONFIG_DIR, else ~/.claude. */
async function configDir($: EngineInterface): Promise<string> {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)

  return dir ?? `${await $.env.get('HOME').catch(() => '~')}/.claude`
}

/** A file's text, or null when it is not there or cannot be read. */
async function readText($: EngineInterface, path: string): Promise<string | null> {
  if (!(await $.fs.exists(path).catch(() => false))) {
    return null
  }

  return $.fs.read(path).catch(() => null)
}

/** One dim line in the chat for a problem with a config file, once per problem and load. */
function reportProblem($: EngineInterface, text: string): void {
  if (!reportedProblems.has(text)) {
    reportedProblems.add(text)
    $.ui.log(`aitools: ${text}`)
  }
}

/** The settings the store held before the global file, until the file has taken them over. */
async function storedSettings($: EngineInterface): Promise<StoredSettings> {
  if ((await $.store.get('configMigrated')) === true) {
    return {}
  }
  const entries = await Promise.all(STORED_KEYS.map(async key => [key, await $.store.get(key)] as const))

  return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
}

/** Writes the global file; true once it holds `raw`. */
async function writeGlobal($: EngineInterface, raw: Json): Promise<boolean> {
  const path = globalPath ?? `${await configDir($)}/${CONFIG_FILE}`
  const text = configText(raw)
  try {
    await $.fs.write(path, text)
    globalText = text
    return true
  } catch (err) {
    reportProblem($, `couldn't save ${path}: ${errorText(err)}`)
    return false
  }
}

/**
 * Reads the global file and puts what it says into effect. The first read fills in what it lacks (from the store,
 * where the mod kept its settings before, else the defaults) and writes that back, so the file lists every setting;
 * the store's copies are then dropped. A file that is not valid JSON leaves the settings as they were.
 */
async function loadGlobal($: EngineInterface, isLoad = false): Promise<void> {
  globalPath ??= `${await configDir($)}/${CONFIG_FILE}`
  const text = await readText($, globalPath)
  if (isGlobalLoaded && text === globalText) {
    return
  }
  let raw: Json = {}
  if (text !== null) {
    const parsed = parseConfig(text)
    if ('error' in parsed) {
      globalText = text
      reportProblem($, `${globalPath} isn't valid JSON (${parsed.error}); the settings stay as they were until it is fixed`)
      return
    }
    raw = parsed.value
  }
  globalText = text
  const stored = await storedSettings($)
  const filled = migrated(raw, stored)
  const isWritten = JSON.stringify(filled) === JSON.stringify(raw) || (await writeGlobal($, filled))
  if (isWritten && (await $.store.get('configMigrated')) !== true) {
    await Promise.all(STORED_KEYS.map(key => $.store.delete(key).catch(() => undefined)))
    await $.store.set('configMigrated', true)
  }
  isGlobalLoaded = true
  await applyPersonal($, personalFrom(filled), isLoad)
}

/** Puts the person's settings into effect; outside a session's start, what changed catches up as a toggle would. */
async function applyPersonal($: EngineInterface, p: Personal, isLoad: boolean): Promise<void> {
  const was = normalizeSettings(await read($, settings))
  await update($, settings, () => p.settings)
  const wasHidden = await read($, isHidden)
  await update($, isHidden, () => p.isHidden)
  await update($, agentShowing, () => p.showing)
  await update($, hideAfter, () => p.hideAfter)
  await update($, branchesWhere, () => p.branchesWhere)
  await update($, branchesShow, () => p.branchesShow)
  const wasViews = [await read($, isTaskView), await read($, isCleanView)]
  await update($, isTaskView, () => p.taskView)
  await update($, isCleanView, () => p.cleanView)
  if (isLoad) {
    return
  }
  if (wasHidden && !p.isHidden) {
    await catchUp($)
  }
  for (const key of Object.keys(p.settings) as ToggleKey[]) {
    if (p.settings[key] && !was[key]) await catchUp($, key)
  }
  if (wasViews[0] !== p.taskView || wasViews[1] !== p.cleanView) {
    await showStatus($)
    await startViews($)
  }
  syncListenerPoll($)
  syncBoardReads($)
}

/**
 * Saves settings the mod's own controls changed, to the global file only: it is read again first, so only these keys
 * change. A file that is not valid JSON is left alone, the change kept for this session.
 */
async function savePersonal($: EngineInterface, change: Partial<Personal>): Promise<void> {
  globalPath ??= `${await configDir($)}/${CONFIG_FILE}`
  const text = await readText($, globalPath)
  let raw: Json = {}
  if (text !== null) {
    const parsed = parseConfig(text)
    if ('error' in parsed) {
      reportProblem($, `${globalPath} isn't valid JSON (${parsed.error}), so this change is kept for this session only`)
      return
    }
    raw = parsed.value
  }
  await writeGlobal($, withPersonal(raw, change))
}

/** Reads the project's file into the row: the session's checkout's, else the main checkout's; none outside GitHub. */
async function loadProject($: EngineInterface): Promise<void> {
  const repo = await read($, githubRepo)
  const paths = repo === null ? [] : [...new Set([`${repo.checkout}/.claude/${CONFIG_FILE}`, `${repo.main}/.claude/${CONFIG_FILE}`])]
  let path: string | null = null
  let text: string | null = null
  for (const candidate of paths) {
    text = await readText($, candidate)
    if (text !== null) {
      path = candidate
      break
    }
  }
  if (isProjectLoaded && text === projectText && path === projectPath) {
    return
  }
  isProjectLoaded = true
  projectPath = path
  projectText = text
  if (path === null || text === null) {
    await update($, projectConfig, () => null)
  } else {
    const parsed = parseConfig(text)
    if ('error' in parsed) {
      reportProblem($, `${path} isn't valid JSON (${parsed.error}); the project row keeps what it had`)
      return
    }
    const config = projectFrom(parsed.value)
    for (const problem of config.problems) reportProblem($, `${path}: ${problem}`)
    await update($, projectConfig, () => config)
  }
  await refreshBoard($)
  syncListenerPoll($)
  syncBoardReads($)
}

/** Both files again: every 30 seconds, when ⁝ opens, and after Claude edits one. */
async function reloadConfigs($: EngineInterface): Promise<void> {
  await loadGlobal($)
  await loadProject($)
}

/** Whether a tool call wrote one of the mod's config files. */
function isConfigEdit(e: { tool: string } & Record<string, unknown>): boolean {
  const path = typeof e.file_path === 'string' ? e.file_path : typeof e.notebook_path === 'string' ? e.notebook_path : ''

  return path.endsWith(`/${CONFIG_FILE}`)
}

// ---- The GitHub repository, its board and the session's issue ----

/** Whether the session's first prompt has been read for an issue: later prompts leave it alone. */
let hasFirstPrompt = false
/** A repository read soon after a tool that can change the branch: a burst of calls reads once. */
let repoSoon: Timer | null = null

/** The GitHub repository the session works in, from the main checkout's remotes (`origin` first); null outside one. */
async function readRepo($: EngineInterface): Promise<GithubRepo | null> {
  const cwd = await $.session.cwd().catch(() => null)
  if (cwd === null) {
    return null
  }
  const top = await git($, ['rev-parse', '--show-toplevel'], cwd)
  if (top.exitCode !== 0) {
    return null
  }
  const checkout = top.stdout.trim()
  const common = await git($, ['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd)
  const main = common.exitCode === 0 ? common.stdout.trim().replace(/\/\.git\/?$/, '') : checkout
  const remotes = (await git($, ['remote', '-v'], main)).stdout
    .split('\n')
    .map(line => line.split(/\s+/))
    .filter((parts): parts is [string, string, ...string[]] => parts.length >= 2 && parts[0] !== '' && parts[1] !== undefined)
  const ordered = [...remotes.filter(([name]) => name === 'origin'), ...remotes.filter(([name]) => name !== 'origin')]
  const found = ordered.map(([, url]) => parseGithubRemote(url)).find(r => r !== null)
  if (!found) {
    return null
  }
  const branch = (await git($, ['branch', '--show-current'], cwd)).stdout.trim()

  return { ...found, url: `https://github.com/${found.owner}/${found.name}`, checkout, main, branch }
}

/** Reads the repository again; a new one brings its project file and board, a new branch its issue. */
async function refreshRepo($: EngineInterface): Promise<void> {
  const next = await readRepo($)
  const was = await read($, githubRepo)
  if (JSON.stringify(next) === JSON.stringify(was)) {
    return
  }
  await update($, githubRepo, () => next)
  if (next?.url !== was?.url || next?.checkout !== was?.checkout) {
    isProjectLoaded = false
    await loadProject($)
  }
  await refreshIssueTitle($)
}

function refreshRepoSoon($: EngineInterface): void {
  repoSoon?.cancel()
  repoSoon = $.clock.after(AFTER_TOOL_MS, () => {
    repoSoon = null
    void refreshRepo($)
  })
}

/** How long a board lookup is kept: GitHub's API budget is shared with everything signed in as the person. */
const BOARD_KEEP_MS = 24 * 60 * 60_000

type BoardCache = Record<string, { at: number; url: string | null }>

/**
 * The repository's GitHub Project board: the project file's `board`, else the one Project linked to the repository
 * (none when there are several), looked up once a day through `gh`. Reading Projects needs `gh`'s `read:project`
 * scope; without it there is no board unless the file names one.
 */
async function refreshBoard($: EngineInterface): Promise<void> {
  const was = await read($, boardUrl)
  await lookUpBoard($)
  // A board changed while its items are read: the new one's items, from the store if fresh.
  if ((await read($, boardUrl)) !== was && (await isBoardWanted($))) {
    await loadBoardItems($, false)
  }
}

async function lookUpBoard($: EngineInterface): Promise<void> {
  const repo = await read($, githubRepo)
  const config = await read($, projectConfig)
  if (repo === null || config?.board === false) {
    await update($, boardUrl, () => null)
    return
  }
  if (typeof config?.board === 'string') {
    const url = config.board
    await update($, boardUrl, () => url)
    return
  }
  const slugKey = `${repo.owner}/${repo.name}`
  const cache = ((await $.store.get('boards')) as BoardCache | undefined) ?? {}
  const now = await $.clock.now()
  const kept = cache[slugKey]
  if (kept !== undefined && now - kept.at < BOARD_KEEP_MS) {
    await update($, boardUrl, () => kept.url)
    return
  }
  const query = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2(first:2){totalCount nodes{url}}}}'
  const result = await $.process
    .run(['gh', 'api', 'graphql', '-f', `query=${query}`, '-f', `owner=${repo.owner}`, '-f', `name=${repo.name}`], {
      cwd: repo.main,
      env: { GH_PROMPT_DISABLED: '1' },
      timeoutMs: 20_000,
    })
    .catch(() => null)
  let url: string | null = null
  if (result?.exitCode === 0) {
    try {
      const projects = JSON.parse(result.stdout)?.data?.repository?.projectsV2
      url = projects?.totalCount === 1 && typeof projects.nodes?.[0]?.url === 'string' ? projects.nodes[0].url : null
    } catch {
      url = null
    }
  }
  const fresh = Object.fromEntries(Object.entries(cache).filter(([, v]) => now - v.at < BOARD_KEEP_MS))
  await $.store.set('boards', { ...fresh, [slugKey]: { at: now, url } })
  await update($, boardUrl, () => url)
}

// ---- The board's items: the Project pane's list, and the project row's open count ----

/** How long a read of a board's items is kept in the store: past this it is dropped, whatever its board. */
const BOARD_ITEMS_KEEP_MS = 24 * 60 * 60_000

type BoardItemsCache = Record<string, { at: number; data: BoardData }>

/**
 * Sets the board's one timer: its next read, `ms` from now. The read takes the store's copy when another session read
 * the board since, so sessions open side by side read it once between them.
 */
function armBoardTimer($: EngineInterface, ms: number): void {
  boardTimer?.cancel()
  boardTimer = $.clock.after(Math.max(1000, ms), () => {
    boardTimer = null
    void loadBoardItems($, false)
  })
}

/** Whether the board's items are read: while the Project pane is open, or the project row shows their open count. */
async function isBoardWanted($: EngineInterface): Promise<boolean> {
  return (await read($, isBoardOpen)) || (await isProjectRowShown($))
}

/** Starts the board's reads when they are wanted and none is set; stops them when they are not. */
function syncBoardReads($: EngineInterface): void {
  void (async () => {
    if (!(await isBoardWanted($))) {
      stopBoardTimer()
      return
    }
    if (boardTimer === null && boardReading === null) await loadBoardItems($, false)
  })()
}

function stopBoardTimer(): void {
  boardTimer?.cancel()
  boardTimer = null
}

/**
 * Reads the board's items while they are wanted: the store's when a read of this board is under BOARD_REFRESH_MS old
 * (unless `isForced`), else one GraphQL query through `gh`. Either way the next read is set for when this one turns
 * BOARD_REFRESH_MS old, so the board is read at most that often.
 */
async function loadBoardItems($: EngineInterface, isForced: boolean): Promise<void> {
  if (!(await isBoardWanted($)) || boardReading !== null) {
    return
  }
  const url = await read($, boardUrl)
  if (url === null) {
    stopBoardTimer()
    await update($, board, () => ({ status: 'none' as const }))
    return
  }
  const target = parseBoardUrl(url)
  if (target === null) {
    stopBoardTimer()
    await update($, board, () => ({ status: 'error' as const, text: `${url} isn't a github.com/users/… or github.com/orgs/… Project board` }))
    return
  }
  const now = await $.clock.now()
  const cache = ((await $.store.get('boardItems')) as BoardItemsCache | undefined) ?? {}
  const kept = cache[url]
  if (!isForced && kept !== undefined && now - kept.at < BOARD_REFRESH_MS) {
    await update($, board, () => ({ status: 'ready' as const, source: url, data: kept.data, at: kept.at }))
    armBoardTimer($, kept.at + BOARD_REFRESH_MS - now)
    return
  }
  boardReading = readBoardItems($, url, target, cache, now).finally(() => {
    boardReading = null
  })
  await boardReading
}

/** One read of the board: kept in the store and shown, or, when it fails, why beside what was shown before. */
async function readBoardItems($: EngineInterface, url: string, target: { login: string; number: number }, cache: BoardItemsCache, now: number): Promise<void> {
  await update($, isBoardReading, () => true)
  await update($, board, shown => (shown.status === 'ready' && shown.source === url ? shown : { status: 'loading' as const }))
  const cwd = (await read($, githubRepo))?.main ?? (await $.session.cwd())
  const result = await $.process
    .run(['gh', 'api', 'graphql', '-f', `query=${BOARD_QUERY}`, '-f', `login=${target.login}`, '-F', `number=${target.number}`], {
      cwd,
      env: { GH_PROMPT_DISABLED: '1' },
      timeoutMs: 20_000,
    })
    .catch(() => null)
  // gh prints GitHub's answer even when it carries errors, and exits 1; its own failures go to stderr.
  const parsed = result === null ? { error: "gh isn't installed" } : result.stdout.trim() ? parseBoardItems(result.stdout) : { error: firstLine(result.stderr) || 'gh failed' }
  if ('data' in parsed) {
    const fresh = Object.fromEntries(Object.entries(cache).filter(([, v]) => now - v.at < BOARD_ITEMS_KEEP_MS))
    await $.store.set('boardItems', { ...fresh, [url]: { at: now, data: parsed.data } })
    await update($, board, () => ({ status: 'ready' as const, source: url, data: parsed.data, at: now }))
  } else {
    await update($, board, shown =>
      shown.status === 'ready' && shown.source === url ? { ...shown, error: parsed.error } : { status: 'error' as const, text: parsed.error },
    )
  }
  await update($, isBoardReading, () => false)
  if (await isBoardWanted($)) {
    armBoardTimer($, BOARD_REFRESH_MS)
  }
}

/** Opens or closes the Project pane; opening shows the board's items, read now unless the last read is fresh. */
async function setBoardOpen($: EngineInterface, isOpen: boolean): Promise<void> {
  await update($, isBoardOpen, () => isOpen)
  if (!isOpen) {
    syncBoardReads($)
    await $.ui.close({ id: PROJECT_PANE })
    return
  }
  await update($, board, shown => (shown.status === 'ready' ? shown : { status: 'loading' as const }))
  await $.ui.open({ id: PROJECT_PANE, title: 'Project' })
  void loadBoardItems($, false)
}

/** The 🛠 menu's Project: opens the pane (its own close mark closes it), and closes the menu. */
async function openProject($: EngineInterface): Promise<void> {
  await update($, isToolsOpen, () => false)
  await setBoardOpen($, true)
}

/** The issue the row links to: the one the first prompt names, else the one the branch is named for. */
async function currentIssue($: EngineInterface): Promise<number | null> {
  const fromPrompt = await read($, promptIssue)
  const repo = await read($, githubRepo)

  return fromPrompt ?? (repo === null ? null : issueInBranch(repo.branch))
}

/** Reads the session's first prompt for an issue, once: as it is sent, or from the transcript after a load. */
async function noteFirstPrompt($: EngineInterface, text: string): Promise<void> {
  if (hasFirstPrompt) {
    return
  }
  hasFirstPrompt = true
  const issue = issueInPrompt(text)
  await update($, promptIssue, () => issue)
  await refreshIssueTitle($)
}

/** How many issue titles the store keeps. */
const TITLES_KEEP = 200

/** The linked issue's title, from the store or GitHub's REST API (one call per issue, kept). */
async function refreshIssueTitle($: EngineInterface): Promise<void> {
  const repo = await read($, githubRepo)
  const issue = await currentIssue($)
  if (repo === null || issue === null) {
    return
  }
  if ((await read($, issueTitle))?.number === issue) {
    return
  }
  const key = `${repo.owner}/${repo.name}#${issue}`
  const titles = ((await $.store.get('issueTitles')) as Record<string, string> | undefined) ?? {}
  let title: string | undefined = titles[key]
  if (title === undefined) {
    const result = await $.process
      .run(['gh', 'api', `repos/${repo.owner}/${repo.name}/issues/${issue}`, '--jq', '.title'], {
        cwd: repo.main,
        env: { GH_PROMPT_DISABLED: '1' },
        timeoutMs: 20_000,
      })
      .catch(() => null)
    title = result?.exitCode === 0 ? result.stdout.trim() : undefined
    if (title) {
      const kept = Object.entries(titles).slice(-(TITLES_KEEP - 1))
      await $.store.set('issueTitles', { ...Object.fromEntries(kept), [key]: title })
    }
  }
  if (title) {
    const found = title
    await update($, issueTitle, () => ({ number: issue, title: found }))
  }
}

/** Opens a link in the person's default browser: `xdg-open`, else macOS's `open`, else Windows' `start`. */
async function openInBrowser($: EngineInterface, url: string): Promise<void> {
  for (const argv of [['xdg-open', url], ['open', url], ['cmd', '/c', 'start', '', url]]) {
    const result = await $.process.run(argv, { timeoutMs: 10_000 }).catch(() => null)
    if (result?.exitCode === 0) return
  }
  $.ui.log(`aitools: couldn't open ${url} in a browser`, { to: 'debug' })
}

// ---- The project row's tools: links, commands, servers ----

/** Bumped per start or stop of a tool, so output from a replaced run is ignored. */
const toolGenerations = new Map<string, number>()
/** Each running tool's child, ended to stop a server that names no stop command. */
const toolChildren = new Map<string, AsyncGenerator<unknown, unknown>>()
/** The timer that reads what listens on the server tools' ports, while any names a port. */
let listenerTimer: Timer | null = null
let isPollingListeners = false
/** How often the servers' ports are read. */
const LISTENER_POLL_MS = 3000

async function toolById($: EngineInterface, id: string): Promise<ProjectTool | null> {
  return (await read($, projectConfig))?.tools.find(t => t.id === id) ?? null
}

/** The values a tool's commands and links may name: `{checkout}`, `{main}`, `{branch}`, `{repo}`, `{issue}`, … */
async function toolVars($: EngineInterface, tool: ProjectTool): Promise<ToolVars | null> {
  const repo = await read($, githubRepo)
  if (repo === null) {
    return null
  }
  const issue = await currentIssue($)

  return {
    checkout: repo.checkout,
    main: repo.main,
    branch: repo.branch,
    repo: `${repo.owner}/${repo.name}`,
    owner: repo.owner,
    name: repo.name,
    issue: issue === null ? '' : String(issue),
    port: tool.type === 'server' && tool.port !== undefined ? String(tool.port) : '',
  }
}

async function setRun($: EngineInterface, id: string, generation: number, run: ToolRun | null): Promise<boolean> {
  if (toolGenerations.get(id) !== generation) {
    return false
  }
  await update($, toolRuns, runs => {
    const next = { ...runs }
    if (run === null) delete next[id]
    else next[id] = run
    return next
  })

  return true
}

async function appendLog($: EngineInterface, id: string, generation: number, lines: readonly string[]): Promise<void> {
  if (lines.length === 0) {
    return
  }
  await update($, toolLogs, logs =>
    toolGenerations.get(id) === generation ? { ...logs, [id]: [...(logs[id] ?? []), ...lines].slice(-LOG_KEEP) } : logs,
  )
  void $.ui.scroll({ in: logPaneId(id), to: 'end' }).catch(() => undefined)
}

/**
 * Runs a command or starts a server as the mod's own child, its output into the tool's log: a server is ready once
 * its `ready` pattern shows (its first group, a URL, kept), a command passes when it exits 0. Only a press runs one.
 */
async function runTool($: EngineInterface, id: string): Promise<void> {
  const tool = await toolById($, id)
  if (tool === null || tool.type === 'link') {
    return
  }
  const vars = await toolVars($, tool)
  if (vars === null) {
    return
  }
  const generation = (toolGenerations.get(id) ?? 0) + 1
  toolGenerations.set(id, generation)
  const argv = (tool.type === 'server' ? tool.start : tool.run).map(arg => expand(arg, vars))
  const cwd = tool.cwd === undefined ? vars.checkout : expand(tool.cwd, vars)
  const isServer = tool.type === 'server'
  const ready = isServer && tool.ready !== undefined ? new RegExp(tool.ready) : null
  await update($, toolLogs, logs => ({ ...logs, [id]: [`$ ${argv.join(' ')}`] }))
  await setRun($, id, generation, { phase: isServer ? (ready ? 'starting' : 'running') : 'running', branch: vars.branch, detail: '' })
  if (!isServer) {
    await openLog($, id)
  }
  let rest = ''
  try {
    const child = $.process.spawn({ argv, cwd })
    toolChildren.set(id, child)
    for await (const { text } of child) {
      if (toolGenerations.get(id) !== generation) continue
      const split = splitOutput(rest, text)
      rest = split.rest
      await appendLog($, id, generation, split.lines)
      const match = ready === null ? null : split.lines.map(line => ready.exec(line)).find(m => m !== null)
      if (match) await setRun($, id, generation, { phase: 'ready', branch: vars.branch, detail: match[1] ?? '' })
    }
    const { code, signal } = await child.result
    await appendLog($, id, generation, rest ? [rest] : [])
    const reason = signal ?? `code ${code}`
    await setRun($, id, generation, isServer ? { phase: 'exited', branch: vars.branch, detail: reason } : { phase: code === 0 ? 'passed' : 'failed', branch: vars.branch, detail: reason })
  } catch (err) {
    await appendLog($, id, generation, [errorText(err)])
    await setRun($, id, generation, { phase: 'failed', branch: vars.branch, detail: errorText(err) })
  } finally {
    if (toolGenerations.get(id) === generation) toolChildren.delete(id)
  }
}

/**
 * Stops a server: its `stop` command when it names one, else this session's own child, and what listens on its port.
 * Its port is read again at once, so the button turns back without waiting for the next read.
 */
async function stopTool($: EngineInterface, id: string): Promise<void> {
  const tool = await toolById($, id)
  if (tool?.type !== 'server') {
    return
  }
  const vars = await toolVars($, tool)
  const generation = (toolGenerations.get(id) ?? 0) + 1
  toolGenerations.set(id, generation)
  const listener = (await read($, toolListeners))[id] ?? null
  await setRun($, id, generation, { phase: 'stopping', branch: listener?.label ?? vars?.branch ?? '', detail: '' })
  let error = ''
  if (tool.stop !== undefined && vars !== null) {
    const result = await $.process
      .run(tool.stop.map(arg => expand(arg, vars)), { cwd: vars.checkout, timeoutMs: 60_000 })
      .catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: errorText(err) }))
    if (result.exitCode !== 0) error = result.stderr.trim() || `exit ${result.exitCode}`
  } else {
    const child = toolChildren.get(id)
    toolChildren.delete(id)
    await child?.return(undefined).catch(() => undefined)
    if (listener?.pid != null) {
      await $.process.run(['kill', String(listener.pid)]).catch(() => null)
    }
  }
  await setRun($, id, generation, error ? { phase: 'failed', branch: '', detail: error } : null)
  await pollListeners($)
}

/** Opens a tool's log pane, scrolled to its newest line. */
async function openLog($: EngineInterface, id: string): Promise<void> {
  const tool = await toolById($, id)
  await $.ui.open({ id: logPaneId(id), title: `${tool?.label ?? id} log` })
  void $.ui.scroll({ in: logPaneId(id), to: 'end' }).catch(() => undefined)
}

/** Closes a tool's log pane while it shows, else opens it. */
async function toggleLog($: EngineInterface, id: string): Promise<void> {
  const pane = (await $.ui.panes()).find(p => p.id === logPaneId(id))
  if (pane?.isShown) {
    await $.ui.close({ id: logPaneId(id) })
    return
  }
  await openLog($, id)
}

/**
 * What listens on a port, whoever started it (another session, an editor, a terminal): its checkout and branch,
 * through its process's working folder; null when nothing does. Reads `ss` and `/proc`, so Linux only.
 */
async function findListener($: EngineInterface, port: number): Promise<ToolListener | null> {
  const ss = await $.process.run(['ss', '-ltnHp', `sport = :${port}`], { timeoutMs: 5000 }).catch(() => null)
  if (!ss?.stdout.trim()) {
    return null
  }
  const pid = ss.stdout.match(/pid=(\d+)/)?.[1]
  if (pid === undefined) {
    return { checkout: '', label: 'another user', pid: null }
  }
  const link = await $.process.run(['readlink', `/proc/${pid}/cwd`], { timeoutMs: 5000 }).catch(() => null)
  const dir = link?.exitCode === 0 ? link.stdout.trim() : ''
  if (!dir) {
    return { checkout: '', label: `pid ${pid}`, pid: Number(pid) }
  }
  if (dir.endsWith(' (deleted)')) {
    return { checkout: dir.slice(0, -' (deleted)'.length), label: 'removed worktree', pid: Number(pid) }
  }
  const top = await git($, ['-C', dir, 'rev-parse', '--show-toplevel'], dir)
  if (top.exitCode !== 0) {
    return { checkout: dir, label: dir, pid: Number(pid) }
  }
  const branch = (await git($, ['-C', dir, 'branch', '--show-current'], dir)).stdout.trim()

  return { checkout: top.stdout.trim(), label: branch || 'detached', pid: Number(pid) }
}

/** Reads every server tool's port, redrawing only when what listens changed; one read at a time. */
async function pollListeners($: EngineInterface): Promise<void> {
  if (isPollingListeners) {
    return
  }
  isPollingListeners = true
  try {
    const servers = ((await read($, projectConfig))?.tools ?? []).filter(
      (t): t is Extract<ProjectTool, { type: 'server' }> => t.type === 'server' && t.port !== undefined,
    )
    const found = Object.fromEntries(await Promise.all(servers.map(async t => [t.id, await findListener($, t.port ?? 0)] as const)))
    if (JSON.stringify(found) !== JSON.stringify(await read($, toolListeners))) {
      await update($, toolListeners, () => found)
    }
  } finally {
    isPollingListeners = false
  }
}

/** Reads the servers' ports while the row shows and a server names a port; stops reading otherwise. */
function syncListenerPoll($: EngineInterface): void {
  void (async () => {
    const config = await read($, projectConfig)
    const isWanted =
      (await isProjectRowShown($)) && (config?.tools.some(t => t.type === 'server' && t.port !== undefined) ?? false)
    if (isWanted) {
      listenerTimer ??= $.clock.every(LISTENER_POLL_MS, () => void pollListeners($))
      await pollListeners($)
      return
    }
    listenerTimer?.cancel()
    listenerTimer = null
  })()
}

/** Whether the project row shows: a GitHub repository, the row not turned off (by the person or the project). */
async function isProjectRowShown($: EngineInterface): Promise<boolean> {
  if (!(await isShown($, 'projectRow')) || (await read($, githubRepo)) === null) {
    return false
  }

  return (await read($, projectConfig))?.isEnabled ?? true
}

/** The project row for the band, or null where it does not show. */
async function drawProjectRow($: EngineInterface, el: Parameters<typeof renderProjectRow>[0], gap: number) {
  const repo = await read($, githubRepo)
  if (repo === null || !(await isProjectRowShown($))) {
    return null
  }
  const config = await read($, projectConfig)
  const issueNumber = (await read($, promptIssue)) ?? issueInBranch(repo.branch)
  const title = await read($, issueTitle)

  return renderProjectRow(
    el,
    {
      repo,
      name: config?.name ?? repo.name,
      boardUrl: await read($, boardUrl),
      issue: issueNumber === null ? null : { number: issueNumber, title: title?.number === issueNumber ? title.title : null },
      tools: config?.tools ?? [],
      runs: await read($, toolRuns),
      listeners: await read($, toolListeners),
      tasks: await read($, runningTasks),
      openItems: await openBoardItems($),
      gap,
    },
    {
      open: url => void openToolUrl($, url),
      startServer: id => void runTool($, id),
      stopServer: id => void stopTool($, id),
      toggleLog: id => void toggleLog($, id),
      runCommand: id => void runTool($, id),
      openTasks: () => void setDockOpen($, true),
      openBoard: () => void setBoardOpen($, true),
    },
  )
}

/** How many of the board's items are open, beyond the ones read too; null before a read. */
async function openBoardItems($: EngineInterface): Promise<number | null> {
  const url = await read($, boardUrl)
  const shown = await read($, board)

  if (url === null || shown.status !== 'ready' || shown.source !== url) {
    return null
  }

  return shown.data.open ?? filterCounts(shown.data.items).open
}

/** Opens a row link: a link tool's URL may name the repository's values in braces. */
async function openToolUrl($: EngineInterface, url: string): Promise<void> {
  const repo = await read($, githubRepo)
  const issue = await currentIssue($)
  const vars: ToolVars | null =
    repo === null
      ? null
      : { checkout: repo.checkout, main: repo.main, branch: repo.branch, repo: `${repo.owner}/${repo.name}`, owner: repo.owner, name: repo.name, issue: issue === null ? '' : String(issue), port: '' }
  await openInBrowser($, vars === null ? url : expand(url, vars))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // The person's settings, from ~/.claude/aitools.json (taken over from the store the first time).
    await loadGlobal($, true)
    // $.state outlives a hot reload: a snapshot already there is this session's, so keep it.
    // A new session carries over only the limits; thread cost and context are its own.
    if ((await read($, snapshot)) === null) {
      const last = (await $.store.get('lastSnapshot')) as Snapshot | undefined
      const usage = await $.session.usage()
      const fresh: Snapshot = {
        fiveHour: toWindow(usage.rateLimits.find(r => r.kind === 'five_hour')) ?? last?.fiveHour,
        weekly: toWindow(usage.rateLimits.find(r => r.kind === 'seven_day')) ?? last?.weekly,
        context: usage.context,
        threadUsd: usage.cost?.usd,
      }
      await update($, snapshot, () => fresh)
    }
    await restoreCacheAt($)
    // The chat's model, before its first request here (a resumed session): what a cold cache is priced at.
    if ((await read($, mainModel)) === null) {
      const model = await $.session.model().catch(() => null)
      if (model) await update($, mainModel, () => model)
    }
    // A reload keeps /keepwarm's window in $.state, a restart in $.store; its timer went with the old module.
    await restoreKeepWarm($)
    // The tick redraws countdowns while the bar shows, and checks whether the mascot has stood idle long enough to
    // fall asleep.
    $.clock.every(TICK_MS, () => void onTick($))
    await $.command.register({ name: 'aitools', description: 'Show or hide the aitools bar, or its project row', argumentHint: '[on|off|project [on|off]]' })
    await showStatus($)
    // A load (a reload at a turn's end, a restart) sees no turn.complete for what came before: read it back, for
    // what is on.
    await startViews($)
    const rows = await $.session.messages().catch(() => [])
    await update($, isAskable, () => isAskableIn(rows))
    // The project row: the repository, its file, and the issue the first prompt named (read from the transcript on
    // a load; a new session's comes with its first prompt).
    await refreshRepo($)
    await loadProject($)
    const first = rows.find(row => row.role === 'user' && row.text.trim() && !row.toolResults?.length)
    if (first !== undefined) await noteFirstPrompt($, first.text)
    await refreshIssueTitle($)
    if (await isMascotOn($)) {
      const isAsked = isQuestionOpenIn(rows)
      await update($, isQuestionOpen, () => isAsked)
      // A new session starts the mascot waving. A reload keeps his pose, but its timers went with the old module: a
      // moment pose gives way now and a transition still playing is dropped.
      const shown = await read($, mascot)
      if (shown.change === 0) {
        await showMascot($, 'wave', await restingPose($))
      } else if (ONE_SHOT_MS[shown.pose] !== undefined) {
        await showMascot($, shown.rest)
      } else {
        await settleMascot($, shown.change)
      }
    }
    await $.command.register({ name: 'taskview', description: 'Turn Task View on or off', argumentHint: '[on|off]' })
    await $.command.register({ name: 'cleanview', description: 'Turn Clean View on or off', argumentHint: '[on|off]' })
    await $.command.register({ name: 'tasks', description: 'Open or close the Background tasks pane' })
    // A reload starts the module's bookkeeping over: the running lines are the subagents still at work.
    for (const card of (await read($, agentRun))?.cards ?? []) {
      seenAgents.add(card.id)
      if (card.status === 'running' && (kindOf(card) === 'subagent' || kindOf(card) === 'workflow')) trackedAgents.add(card.id)
    }
    // A reload takes the dock pane down with the old module; the dock stays open until the person closes it.
    if ((await read($, isDockOpen)) && !(await $.ui.panes()).some(p => p.id === DOCK_PANE)) {
      await $.ui.open({ id: DOCK_PANE, title: DOCK_TITLE })
    }
    await syncDock($)
    // The Notes pane went with the old module too: it opens again on the note as saved.
    if ((await read($, isNotesOpen)) && !(await $.ui.panes()).some(p => p.id === NOTES_PANE)) {
      await $.ui.open({ id: NOTES_PANE, title: 'Notes' })
      await loadNotes($)
    }
    await $.command.register({ name: 'branches', description: 'Open or close the Branches pane' })
    // The Branches pane went with the old module too, its timers with it: it opens again and reads afresh.
    if (await read($, isBranchesOpen)) {
      await setBranchesOpen($, true)
    }
    // The Project pane too: it opens again, on the stored read while that is fresh.
    if (await read($, isBoardOpen)) {
      await setBoardOpen($, true)
    }
    // And the settings pane.
    if ((await read($, isSettingsOpen)) && !(await $.ui.panes()).some(p => p.id === SETTINGS_PANE)) {
      await $.ui.open({ id: SETTINGS_PANE, title: SETTINGS_TITLE })
    }
    await $.command.register({ name: 'handoff', description: 'Print a handoff brief for a fresh session and copy it' })
    await $.command.register({ name: 'keepwarm', description: 'Keep the prompt cache warm while you are away (6h bare)', argumentHint: '[6h|90m|off|status|help]' })
    await $.command.register({
      name: 'askme',
      description: 'Ask the questions from the last answer as pop-up choices with a recommendation',
      argumentHint: '[note]',
    })
    startScan($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isTurnRunning = true
    if ((await read($, asking)) === 0) {
      await showMascot($, 'working')
    }
    // The cost when the turn started: the last-turn cost's baseline, only while it is shown.
    if (await isShown($, 'lastTurnCost')) {
      const cost = (await $.session.usage()).cost?.usd
      if (cost !== undefined) {
        await update($, turnBaseline, () => ({ turnId: e.turnId, usd: cost }))
      }
    }

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await measure($, e)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      if ((await read($, mainModel)) !== e.model) {
        await update($, mainModel, () => e.model)
      }
      // Kept whether the cache meter shows or not: /keepwarm times its pings from it.
      const at = await $.clock.now()
      await update($, cacheAt, () => at)
      // Persisting is a nicety (survives reloads); it must never hold up the model request.
      await rememberCacheAt($, at).catch(() => undefined)
      return yield* next(e)
    }
    // A subagent: its first request can come before its start is recorded, so an unknown one waits briefly for the
    // starts still in flight, then gets a line if it still has none.
    if (startsInFlight.size > 0) {
      await waitAtMost($, Promise.all(startsInFlight), SPAWN_WAIT_MS)
    }
    if (!seenAgents.has(e.agentId)) {
      await noticeAgent($, e.agentId)
    }

    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      // Its background commands that end with it end now: no notice will say so.
      for (const card of (await read($, agentRun))?.cards.filter(c => c.status === 'running' && c.endsWith === id) ?? []) {
        await endTask($, card.id, 'stopped')
      }
      // Only a subagent with a line is the pane's business.
      if ((await read($, agentRun))?.cards.some(c => c.id === id) ?? false) {
        await traceDock($, `finished ${id} (${e.reason})`)
        await endTask($, id, e.reason === 'answer' ? 'done' : 'failed')
      }

      return next(e)
    }
    isTurnRunning = false
    if (e.usage?.model && (await read($, mainModel)) !== e.usage.model) {
      const model = e.usage.model
      await update($, mainModel, () => model)
    }
    await armKeepWarm($)
    const isAsking = e.reason === 'answer' && !isAskedThisRequest && asksQuestions(e.answer)
    await update($, isAskable, () => isAsking)
    if (await read($, isCleanView)) {
      await update($, finals, list => addFinal(list, e.answer))
    }
    if (await isMascotOn($)) {
      // A finished answer is celebrated, unless it asks something; a turn that failed or was interrupted startles him.
      const isAsked = e.reason === 'answer' && endsWithQuestion(e.answer)
      await update($, isQuestionOpen, () => isAsked)
      const rest = await restingPose($)
      await showMascot($, e.reason !== 'answer' ? 'error' : isAsked ? 'puzzled' : 'celebrate', rest)
    }
    const baseline = await read($, turnBaseline)
    const base = baseline?.turnId === e.turnId ? baseline.usd : undefined
    await update($, turnBaseline, () => null)
    if (e.usage !== undefined) {
      const lastTurnTokens = usageTokens(e.usage)
      await update($, snapshot, snap => ({ ...(snap ?? {}), lastTurnTokens }))
    }
    if (await isShown($, COST_KEYS)) {
      const cost = (await $.session.usage()).cost?.usd
      if (cost !== undefined) {
        const lastTurnUsd = base === undefined ? undefined : cost - base
        await update($, snapshot, snap => ({ ...(snap ?? {}), threadUsd: cost, lastTurnUsd }))
      }
    }
    startScan($)
    // Any subagent whose finish went unheard is settled once Claude replies.
    await settleCards($)

    return next(e)
  })

  on('command.run', { command: 'aitools' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/)
    if (words[0] === 'project') {
      const was = normalizeSettings(await read($, settings)).projectRow
      const shown = words[1] === 'on' || words[1] === 'show' ? true : words[1] === 'off' || words[1] === 'hide' ? false : words[1] === undefined ? !was : null
      if (shown === null) {
        return { text: 'Usage: /aitools project [on|off] (no argument toggles the project row)' }
      }
      if (shown !== was) await toggleSetting($, 'projectRow')
      return { text: shown ? 'Project row shown.' : 'Project row hidden in every project. /aitools project shows it again.' }
    }
    const hidden = nextHidden(e.args, await read($, isHidden))
    if (hidden === null) {
      return { text: 'Usage: /aitools [on|off] (no argument toggles the bar)' }
    }
    await update($, isHidden, () => hidden)
    await savePersonal($, { isHidden: hidden })
    syncListenerPoll($)
    syncBoardReads($)
    if (!hidden) {
      await catchUp($)
    }

    return { text: hidden ? 'aitools bar hidden. Run /aitools to show it.' : 'aitools bar shown.' }
  })

  on('command.run', { command: 'taskview' }, ($, e) => viewCommand($, 'task', e.args))
  on('command.run', { command: 'cleanview' }, ($, e) => viewCommand($, 'clean', e.args))

  on('command.run', { command: 'keepwarm' }, ($, e) => keepWarmCommand($, e.args))

  // Compaction replaces the conversation the cache held: its warmth is unknown until the next request, and keepwarm
  // waits for that, as cache-tax does.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      await update($, cacheAt, () => null)
      await armKeepWarm($)
    }

    return result
  })

  // The brief is the command's output row: the chat renders it as markdown.
  on('command.run', { command: 'handoff' }, async $ => ({ text: await handoff($) }))

  // A command may not submit a prompt while it runs (the prompt would wait on the command), so a timer sends it just
  // after; it then runs as the next turn.
  on('command.run', { command: 'askme' }, ($, e) => {
    const text = askmeText(e.args)
    $.clock.after(0, () => {
      $.prompt.submit({ text, asUser: true }).catch(() => undefined)
    })
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: HANDOFF_PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const shown = await read($, brief)
    if (shown === null || shown.status === 'writing') {
      return <Text dimColor>Writing the handoff brief…</Text>
    }
    if (shown.status === 'error') {
      return <Text color={RED}>{shown.text}</Text>
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="flex-end">
          <Button key="copy" label="Copy" plain dimColor onPress={press => void copyBrief($, press.surface)} />
        </Box>
        <Markdown text={paneMarkdown(shown.text)} />
      </Box>
    )
  })

  // The person's own prompt starts a new request, whatever is on: a fresh checklist (the Background tasks pane keeps its
  // finished lines for the session). A task notice arrives as a prompt too, and starts nothing, but a notice that a
  // task ended finishes its line. A view on adds its note.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') {
      await endNoticedTasks($, e.text)
    }
    if (PERSON_ORIGINS.has(e.origin.kind)) {
      // The session's first prompt names the issue the project row links to, if any.
      await noteFirstPrompt($, e.text)
      await update($, checklist, () => null)
      await update($, isChecklistClosed, () => false)
      await update($, isQuestionOpen, () => false)
      await update($, isAskable, () => false)
      isAskedThisRequest = false
    }
    const view = viewNote({ isTaskView: await read($, isTaskView), isCleanView: await read($, isCleanView) })

    return view === null ? next(e) : next({ ...e, context: [...(e.context ?? []), view] })
  })

  // Every subagent gets a line, following its tool calls and, while the pane is open, the progress it reports.
  on('agent.spawn', ($, e, next) => (e.fork ? next(e) : startSubagent($, e, next)))

  // A command run in the background, or sent there with Ctrl+B, gets a line until its notice says it ended.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    const ran = 'result' in result ? (result.result as { backgroundTaskId?: unknown; backgroundEndsWithFinalResponse?: unknown } | undefined) : undefined
    if (typeof ran?.backgroundTaskId === 'string') {
      const line = commandLine(e)
      // A synchronous subagent's background command is stopped when it answers, with no notice of its own.
      const endsWith = ran.backgroundEndsWithFinalResponse === true ? e.agentId : undefined
      await trackTask($, ran.backgroundTaskId, line.task, 'command', { doing: line.doing, endsWith })
    }

    return result
  })

  // A task's notice delivered into a running turn, the main chat's or a subagent's, comes as an attachment rather
  // than a prompt (a subagent's own background command reports to it): a notice that a task ended finishes its line.
  on('prompt.attachment', { type: 'queued_command' }, async ($, e, next) => {
    await endNoticedTasks($, e.text)

    return next(e)
  })

  // A monitor gets a line until its notice says it ended, or its deadline passes.
  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const result = await next(e)
    const started = 'result' in result ? (result.result as { taskId?: unknown; timeoutMs?: unknown; persistent?: unknown } | undefined) : undefined
    if (typeof started?.taskId === 'string') {
      const id = started.taskId
      const timeoutMs = typeof started.timeoutMs === 'number' && started.persistent !== true ? started.timeoutMs : 0
      const expiresAt = timeoutMs > 0 ? (await $.clock.now()) + timeoutMs + MONITOR_GRACE_MS : undefined
      await trackTask($, id, clip(e.description, 60) || 'Monitor', 'monitor', { expiresAt, doing: clip(e.command ?? e.ws?.url, 60) || undefined })
      if (expiresAt !== undefined) $.clock.after(timeoutMs + MONITOR_GRACE_MS, () => void settleCards($))
    }

    return result
  })

  // A task Claude stops ends as stopped.
  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const result = await next(e)
    const stopped = 'result' in result ? (result.result as { task_id?: unknown } | undefined)?.task_id : undefined
    const id = typeof stopped === 'string' ? stopped : (e.task_id ?? e.shell_id)
    if (result.deny === undefined && result.isError !== true && id !== undefined) await endTask($, id, 'stopped')

    return result
  })

  // A workflow the main chat starts: its agents' lines take its name.
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    if (e.agentId === undefined) {
      lastWorkflow = workflowName(e as unknown as Record<string, unknown>)
      workflowAgents = 0
    }

    return next(e)
  })

  // A subagent's own report: answered here, so it never asks for permission.
  on('tool.call', { tool: PROGRESS_TOOL_ID }, async ($, e) => {
    const id = e.agentId
    if (id === undefined) {
      return { deny: 'Only subagents report progress.' }
    }
    const doing = typeof e.doing === 'string' ? e.doing : ''
    const percent = typeof e.percent === 'number' ? e.percent : 0
    await update($, agentRun, run => (run === null ? run : reportProgress(run, id, doing, percent)))

    return { result: 'Progress noted.' }
  })

  on('command.run', { command: 'tasks' }, async $ => {
    return { text: (await toggleDock($)) ? 'Background tasks open.' : 'Background tasks closed.' }
  })

  on('command.run', { command: 'branches' }, async $ => {
    const isOpen = !(await read($, isBranchesOpen))
    await setBranchesOpen($, isOpen)

    return { text: isOpen ? 'Branches open.' : 'Branches closed.' }
  })

  on('ui.render', { component: 'Pane', requestId: BRANCHES_PANE }, async ($, e) => {
    const view = {
      list: await read($, branchList),
      action: await read($, branchAction),
      where: await read($, branchesWhere),
      show: await read($, branchesShow),
      now: await $.clock.now(),
    }
    const el = $.ui.resolve(e)
    // Clawd is SVG: the terminal never gets him, whatever its table holds.
    const Svg = e.surface !== 'terminal' && 'Svg' in el ? el.Svg : undefined

    return renderBranches({ Box: el.Box, Text: el.Text, Button: el.Button, Svg }, view, {
      ask: target => void askBranches($, target),
      confirm: () => void confirmBranches($),
      cancel: () => void askBranches($, null),
      refresh: () => void refreshBranchesNow($),
      setWhere: where => void setBranchesWhere($, where),
      setShow: show => void setBranchesShow($, show),
    })
  })

  on('ui.render', { component: 'Pane', requestId: SETTINGS_PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    // Clawd is SVG: the terminal never gets him, whatever its table holds. Mobile draws no fields.
    const Svg = e.surface !== 'terminal' && 'Svg' in el ? el.Svg : undefined
    const Input = 'Input' in el ? el.Input : undefined
    const home = await $.env.get('HOME').catch(() => undefined)
    const repo = await read($, githubRepo)
    const view = {
      settings: normalizeSettings(await read($, settings)),
      globalFile: homeRelative(globalPath ?? `${await configDir($)}/${CONFIG_FILE}`, home),
      repo,
      project: await read($, projectConfig),
      projectFile: repo === null ? null : homeRelative(projectPath ?? `${repo.checkout}/.claude/${CONFIG_FILE}`, home),
      note: await read($, settingsNote),
    }

    return renderSettings({ Box: el.Box, Text: el.Text, Button: el.Button, Input, Svg }, view, {
      toggle: key => void toggleSetting($, key),
      setProject: change => void saveProject($, change),
    })
  })

  on('ui.render', { component: 'Pane', requestId: PROJECT_PANE }, async ($, e) => {
    // The 30-second tick keeps `updated 3m ago` current.
    await read($, tick)
    const repo = await read($, githubRepo)
    const view = {
      board: await read($, board),
      filter: await read($, boardFilter),
      isReading: await read($, isBoardReading),
      repo: repo === null ? null : `${repo.owner}/${repo.name}`,
      now: await $.clock.now(),
    }
    const el = $.ui.resolve(e)
    // Clawd is SVG: the terminal never gets him, whatever its table holds.
    const Svg = e.surface !== 'terminal' && 'Svg' in el ? el.Svg : undefined

    return renderBoard({ Box: el.Box, Text: el.Text, Button: el.Button, Svg }, view, {
      open: url => void openInBrowser($, url),
      setFilter: filter => void update($, boardFilter, () => filter),
      refresh: () => void loadBoardItems($, true),
    })
  })

  on('ui.render', { component: 'Pane', requestId: DOCK_PANE }, async ($, e) => {
    await read($, dockTick)
    // The 30-second tick keeps finished lines' `3m ago` current.
    await read($, tick)
    const state = {
      showing: await read($, agentShowing),
      hideAfter: await read($, hideAfter),
      run: await read($, agentRun),
      now: await $.clock.now(),
    }

    const el = $.ui.resolve(e)
    // The totem is SVG: the terminal never gets it, whatever its table holds.
    const Svg = e.surface !== 'terminal' && 'Svg' in el ? el.Svg : undefined

    return renderDock({ Box: el.Box, Text: el.Text, Button: el.Button, Svg }, state, {
      setShowing: showing => void setShowing($, showing),
      setHideAfter: minutes => void setHideAfter($, minutes),
    })
  })

  // The person closing the dock pane turns the dock off; the mod's own close has already, and an unload (a reload)
  // leaves the setting for the pane the next load opens.
  on('ui.render', { component: 'Pane', requestId: NOTES_PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    const { Box, Text, Button } = el
    const shown = await read($, notes)
    if (shown === null) {
      return <Text dimColor>Loading the note…</Text>
    }
    if ('error' in shown) {
      return <Text color={RED}>{shown.error}</Text>
    }
    if (!('Client' in el)) {
      return <Text dimColor>{`The note can't be edited here; it is kept in ${NOTES_FILE}.`}</Text>
    }
    const { Client } = el

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={FAINT_TEXT}>{`Note saved to ${NOTES_FILE} in your project.`}</Text>
          <Button key="copy" label="Copy" plain dimColor onPress={press => void copyNotes($, press.surface)} />
        </Box>
        <Client key={NOTES_EDITOR} module="../src/noteseditor.tsx" props={{ text: shown.text, columns: e.props.bodyColumns }} />
      </Box>
    )
  })

  // The editor posts the whole note after each change.
  on('ui.message', async ($, e, next) => {
    if (e.requestId !== NOTES_PANE) {
      return next(e)
    }
    const data = e.data as { text?: unknown } | null
    if (typeof data?.text === 'string') {
      saveNotes($, data.text)
    }

    return {}
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === SETTINGS_PANE && e.origin.kind === 'person') {
      await update($, isSettingsOpen, () => false)
    }
    if (e.id === NOTES_PANE && e.origin.kind === 'person') {
      await update($, isNotesOpen, () => false)
    }
    if (e.id === BRANCHES_PANE && e.origin.kind === 'person') {
      await update($, isBranchesOpen, () => false)
      syncBranches($, false)
    }
    if (e.id === PROJECT_PANE && e.origin.kind === 'person') {
      await update($, isBoardOpen, () => false)
      syncBoardReads($)
    }
    if (e.id === DOCK_PANE && e.origin.kind === 'person') {
      await update($, isDockOpen, () => false)
      await syncDock($)
      await showStatus($)
    }

    return next(e)
  })

  // The mascot follows the main chat's tools: reading while a read-only tool runs, puzzled while an AskUserQuestion
  // dialog waits (its `next` resolves once answered), startled when a call fails or is refused.
  //
  // A subagent with a line in the Background tasks pane shows its latest tool call there: `Reading bar.tsx`,
  // `Running npm test`.
  on('tool.call', async ($, e, next) => {
    try {
      if (e.agentId !== undefined) {
        if (trackedAgents.has(e.agentId)) {
          const id = e.agentId
          const doing = activityText(e.tool, e as unknown as Record<string, unknown>)
          await update($, agentRun, run => (run === null ? run : noteActivity(run, id, doing)))
        }
        return next(e)
      }
      if (QUIET_TOOLS.has(e.tool) || !(await isMascotOn($))) {
        return next(e)
      }
      if (e.tool === 'AskUserQuestion') {
        await update($, asking, n => n + 1)
        await showMascot($, 'puzzled', 'working')
        try {
          return await next(e)
        } finally {
          await update($, asking, n => Math.max(0, n - 1))
          await showMascot($, 'working')
        }
      }
      const isReading = READ_TOOLS.has(e.tool)
      if (isReading) {
        readsInFlight += 1
        await showMascot($, 'reading', 'working')
      }
      let isFailed = true
      try {
        const result = await next(e)
        isFailed = result.deny !== undefined || result.isError === true
        return result
      } finally {
        if (isReading) {
          readsInFlight = Math.max(0, readsInFlight - 1)
        }
        if (isFailed) {
          await showMascot($, 'error', readsInFlight > 0 ? 'reading' : 'working')
        } else if (isReading && readsInFlight === 0) {
          await showMascot($, 'working')
        }
      }
    } finally {
      // While the Branches pane is open, a tool that can change files reads it again shortly after.
      if (CHANGING_TOOLS.has(e.tool) && (await read($, isBranchesOpen))) {
        branchesSoon($)
      }
      // An edit to either aitools.json takes effect at once; a tool that can change the branch reads the repository
      // soon, for the project row's issue and its tools' {branch}.
      if (e.agentId === undefined && isConfigEdit(e as unknown as { tool: string } & Record<string, unknown>)) {
        await reloadConfigs($)
      }
      if (e.agentId === undefined && CHANGING_TOOLS.has(e.tool)) {
        refreshRepoSoon($)
      }
    }
  })

  // A tool's log, every kept line; the pane's window scrolls over them, following the newest.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (!e.requestId.startsWith('aitools-log-')) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const id = e.requestId.slice('aitools-log-'.length)
    const lines = (await read($, toolLogs))[id] ?? []
    const listener = (await read($, toolListeners))[id]
    if (lines.length === 0) {
      return (
        <Text dimColor>
          {listener ? `${listener.label} is serving its port, started outside this session: its log is not here.` : 'No output yet.'}
        </Text>
      )
    }

    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={`line-${i}`} dimColor>
            {line || ' '}
          </Text>
        ))}
      </Box>
    )
  })

  // Questions put as pop-up choices need no ? button for the rest of the request.
  on('tool.call', { tool: ASK_TOOL }, async ($, e, next) => {
    if (e.agentId === undefined) {
      isAskedThisRequest = true
      await update($, isAskable, () => false)
    }

    return next(e)
  })

  // Answered here without `next`: the call never reaches a permission dialog, and nothing runs but this.
  on('tool.call', { tool: CHECKLIST_TOOL_ID }, async ($, e) => {
    const parsed = parseChecklist(e)
    if (typeof parsed === 'string') {
      return { deny: `Checklist not updated: ${parsed}` }
    }
    await update($, checklist, () => parsed)

    return { result: 'Checklist updated.' }
  })

  // Clean View hides every tool row; Task View hides only the checklist tool's own, which the band already shows.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => ((await isToolRowHidden($, e.props.tool)) ? drawNothing($, e) : next(e)))
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => ((await isToolRowHidden($, e.props.tool)) ? drawNothing($, e) : next(e)))
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => ((await read($, isCleanView)) ? drawNothing($, e) : next(e)))
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => ((await read($, isCleanView)) ? drawNothing($, e) : next(e)))

  // Clean View shows only text that belongs to a finished turn's final reply; the rest is work in progress.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, isCleanView)) || isFinalReply(e.props.text, await read($, finals))) {
      return next(e)
    }

    return drawNothing($, e)
  })

  // The band holds one tree, so the bar stacks above whatever the plugins beneath drew
  // rather than ending the chain; core's own drawing beneath is left out.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }
    const below = await next(e)
    const el = $.ui.resolve(e)
    // The mascot is SVG: the terminal never gets it, whatever its table holds.
    const Svg = e.surface !== 'terminal' && 'Svg' in el ? el.Svg : undefined
    const bar = await drawBar($, { Box: el.Box, Text: el.Text, Button: el.Button, Svg }, e.props.isWorking)
    const { Box } = el
    // The terminal sets the bar off from the chat above by a blank line; the desktop's band has its own room.
    const top = e.surface === 'terminal' ? TERMINAL_TOP_MARGIN : 0
    if (below.type === 'engine') {
      return top ? <Box flexDirection="column" width="100%" marginTop={top}>{bar}</Box> : bar
    }
    return (
      <Box flexDirection="column" width="100%" gap={1} marginTop={top}>
        {bar}
        {below}
      </Box>
    )
  })
}
