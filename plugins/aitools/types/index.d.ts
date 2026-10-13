export type ToggleKey =
  | 'label'
  | 'projectRow'
  | 'fiveHour'
  | 'weekly'
  | 'fiveHourReset'
  | 'weeklyReset'
  | 'contextPercent'
  | 'contextTokens'
  | 'threadTokens'
  | 'lastTurnTokens'
  | 'cacheWarmth'
  | 'coldCost'
  | 'threadCost'
  | 'lastTurnCost'
  | 'threadPercent'
  | 'monthlyCost'
  | 'burnRate'
  | 'thresholdColors'
  | 'mascot'

export type Settings = Record<ToggleKey, boolean>

export type LimitWindow = { percentUsed: number; resetsAt?: string }

export type ContextFill = { tokens?: number; window: number; percent?: number }

export type Snapshot = {
  fiveHour?: LimitWindow
  weekly?: LimitWindow
  context?: ContextFill
  threadUsd?: number
  lastTurnUsd?: number
  /** Every token the thread's responses used this month, its helpers' included, from the transcript scan. */
  threadTokens?: number
  /** Every token the last main-thread turn used. */
  lastTurnTokens?: number
}

/** The handoff pane's content: the brief being written, the brief itself, or why there is none. */
export type Brief = { status: 'writing' | 'ready' | 'error'; text: string }

/** The note as read when the Notes pane opened, or why it could not be read; null while it loads. */
export type NotesFile = { text: string } | { error: string } | null

/** Which checklist view is on: Task View keeps the chat as is, Clean View hides tool calls and in-progress replies. */
export type ViewMode = 'off' | 'task' | 'clean'

/** One step; `percent` is the model's estimate of how far along a step in progress is (0 to 100). */
export type ChecklistItem = { text: string; status: 'todo' | 'doing' | 'done'; percent?: number }

/** The plan the model last reported through the checklist tool. */
export type Checklist = { title: string; items: ChecklistItem[] }

/** Which background tasks the pane lists: all of them, or only those of one kind. */
export type AgentShowing = 'all' | AgentKind

/** How long a finished task's line stays, in minutes: 0 hides it as soon as it finishes, `never` keeps it. */
export type HideAfter = 0 | 5 | 15 | 60 | 'never'

/**
 * What a background task is: a subagent Claude started, one of a workflow's agents (named for its workflow,
 * numbered), a shell command running in the background, or a monitor watching a command's output.
 */
export type AgentKind = 'subagent' | 'workflow' | 'command' | 'monitor'

/** One background task's line in the Background tasks pane. */
export type AgentCard = {
  id: string
  task: string
  kind: AgentKind
  doing?: string
  percent?: number
  /** Stopped: killed by the person or by Claude, or its time limit reached. */
  status: 'running' | 'done' | 'failed' | 'stopped'
  startedAt: number
  endedAt?: number
  /** A monitor's deadline, when it has one: it ends then if no notice says so sooner. */
  expiresAt?: number
}

/** The background tasks seen this session. */
export type AgentRun = { startedAt: number; cards: AgentCard[] }

/** What the mascot is doing; Celebrating, Oops and Waving play for a moment and give way. */
export type MascotPose = 'idle' | 'working' | 'reading' | 'puzzled' | 'sleeping' | 'celebrate' | 'error' | 'wave'

/**
 * The mascot's pose and what it changed from (its transition plays while `from` is set). `rest` is the pose a moment
 * pose gives way to; `change` counts pose changes and `seq` source changes; `since` is when the pose began.
 */
export type MascotState = {
  pose: MascotPose
  rest: MascotPose
  from: MascotPose | null
  change: number
  seq: number
  since: number
}

export type MonthTotal = {
  usd: number
  isEstimate: boolean
  status: 'loading' | 'ready' | 'error'
  /** Cost per hour (key: hours since the epoch) over the last 8 days, for the weekly window's total. */
  hours?: Record<string, number>
}

/** A worktree's CI at its commit: passed, failed, still running, or none found. */
export type CiState = 'pass' | 'fail' | 'running' | 'none'

/** A worktree branch's pull request on GitHub. */
export type WorktreePr = { number: number; url: string; state: 'open' | 'merged' | 'closed' }

/** One row of the Worktrees pane: what git and GitHub say of a worktree. */
export type Worktree = {
  path: string
  /** Null for a detached HEAD. */
  branch: string | null
  head: string
  /** The repository's main working tree: never removed. */
  isMain: boolean
  /** The worktree this session runs in: never removed. */
  isCurrent: boolean
  isLocked: boolean
  /** Its folder is gone; git still lists it until pruned. */
  isMissing: boolean
  /** Lines added and removed since it left the base branch, uncommitted work included. */
  added: number
  removed: number
  /** Changed, staged and untracked files. */
  changedFiles: number
  /** Commits on it the base branch lacks. */
  ahead: number
  /** Commits its remote branch lacks: all of `ahead` with no remote branch. */
  unpushed: number
  /** Nothing on it the base branch lacks, or its pull request merged at its commit. */
  isMerged: boolean
  /** The remote branch it tracks, while that exists. */
  remote: { name: string; branch: string } | null
  /** Its last commit (epoch ms). */
  committedAt: number | null
  pr: WorktreePr | null
  ci: CiState
}

/** The Worktrees pane's rows, read while it is open; `base` is the branch merges are measured against. */
export type WorktreeList =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; base: string; worktrees: Worktree[] }

/** What a /keepwarm ping read and cost (priced at the chat's model; null for one with no known rates). */
export type PingReceipt = { at: number; read: number; usd: number | null; isEstimate: boolean }

/** /keepwarm's window: when it ends, and the last ping's receipt. */
export type KeepWarm = { until: number; lastPing: PingReceipt | null }

/** The GitHub repository the session works in: from the main checkout's `origin` remote. */
export type GithubRepo = {
  owner: string
  name: string
  /** `https://github.com/<owner>/<name>`. */
  url: string
  /** The session's checkout (a worktree's own folder) and the main checkout. */
  checkout: string
  main: string
  /** The checkout's branch; '' when detached. */
  branch: string
}

/** A tool on the project row's right, as a project's `.claude/aitools.json` defines it. */
export type ProjectTool =
  | { type: 'link'; id: string; label: string; url: string }
  | { type: 'command'; id: string; label: string; run: string[]; cwd?: string }
  | { type: 'server'; id: string; label: string; start: string[]; stop?: string[]; port?: number; ready?: string; cwd?: string }

/** The project section of a project's `.claude/aitools.json`, with what was wrong in it. */
export type ProjectConfig = {
  isEnabled: boolean
  name?: string
  /** The GitHub Project board's URL, or false to show none; absent, the repository's one linked board is looked up. */
  board?: string | false
  tools: ProjectTool[]
  problems: string[]
}

/** How a tool's run in this session stands; `detail` is its URL once ready, or why it ended. */
export type ToolRun = {
  phase: 'starting' | 'ready' | 'running' | 'stopping' | 'passed' | 'failed' | 'exited'
  branch: string
  detail: string
}

/** Whatever listens on a server tool's port, whoever started it: its checkout, a label (its branch) and its pid. */
export type ToolListener = { checkout: string; label: string; pid: number | null }

/** What a press in the Worktrees pane is about: Clean worktrees, or one row's delete. */
export type WorktreeTarget = { kind: 'clean' } | { kind: 'delete'; path: string }

/** A question the pane is asking, the removal under way, or what the last one did; null when none. */
export type WorktreeAction =
  | { step: 'ask' | 'busy'; target: WorktreeTarget }
  | { step: 'done'; text: string; isError: boolean }
  | null

/** One item on the GitHub Project board: an issue, a pull request or a draft. */
export type BoardItem = {
  kind: 'issue' | 'pr' | 'draft'
  /** Null for a draft. */
  number: number | null
  /** `owner/name` of the repository it lives in; null for a draft. */
  repo: string | null
  title: string
  /** Null for a draft. */
  url: string | null
  /** GitHub's state of the issue or pull request; null for a draft. */
  state: 'OPEN' | 'CLOSED' | 'MERGED' | null
  /** The board's Status column it sits in; null when it has none. */
  status: string | null
  /** The pull request it links to: itself for one, else the one picked from those that close it. */
  pr: { number: number; url: string } | null
  /** When the item last changed on the board, in milliseconds; null when GitHub did not say. */
  updatedAt: number | null
}

/** What one read of the board found: its title and URL, its first items and how many it has in all. */
/**
 * A read of the board: `total` counts every item on it, `open` the open ones (absent in a read kept from before it
 * was counted), and `items` the ones read, open ones first.
 */
export type BoardData = { title: string; url: string; total: number; open?: number; items: BoardItem[] }

/**
 * The Project pane's contents: `source` is the board URL read, `at` when, and `error` why the read after it failed.
 */
export type BoardState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; source: string; data: BoardData; at: number; error?: string }

/** Which items the Project pane lists. */
export type BoardFilter = 'open' | 'done' | 'all'

/** The Project pane's Clawd: stacking blocks, asleep by a finished tower, or puzzled by a fallen one. */
export type TowerMode = 'building' | 'resting' | 'puzzled'

declare module 'claude-code' {
  interface PluginState {
    aitools: {
      snapshot: Snapshot | null
      month: MonthTotal
      projection: number | null
      /** When the last main-thread model request started (epoch ms): the prompt cache's timer restarts then. */
      cacheAt: number | null
      /** Session cost when the running main-thread turn started: last-turn cost's baseline. */
      turnBaseline: { turnId: string; usd: number } | null
      /** Bumped every 30 s so countdowns redraw while idle. */
      tick: number
      settings: Settings
      /** Whether the AI Tool Settings pane is open, so a reload opens it again. */
      isSettingsOpen: boolean
      /** What the settings pane's last project change came to, when it went wrong; null otherwise. */
      settingsNote: { text: string; isError: boolean } | null
      /** The whole bar hidden by /aitools; mirrored in $.store so it holds across sessions. */
      isHidden: boolean
      isHandingOff: boolean
      /** Whether the 🛠 menu is showing its Handoff and Workflows options. */
      isToolsOpen: boolean
      /** What the handoff pane shows; null until the 🛠 menu's Handoff first runs. */
      brief: Brief | null
      /** Which checklist view is on; mirrored in $.store so it holds across sessions. */
      viewMode: ViewMode
      /** The checklist for the current request; cleared when the person sends a new one. */
      checklist: Checklist | null
      /** Final replies of finished turns: the only assistant text Clean View shows. */
      finals: string[]
      /** Whether the Subagents pane is open; closed, none of its settings apply. Not kept across sessions. */
      isDockOpen: boolean
      /** Whether the Notes pane is open, so a reload opens it again. Not kept across sessions. */
      isNotesOpen: boolean
      /** The note as read when the pane opened: the editor keeps its own text after that. */
      notes: NotesFile
      /** The pane's Showing and Hide after picks; mirrored in $.store. */
      agentShowing: AgentShowing
      hideAfter: HideAfter
      /** The background tasks seen this session, finished ones included. */
      agentRun: AgentRun | null
      /** How many of them are running: what the project row's button shows. */
      runningTasks: number
      /** Bumped every second while subagents run, so their times redraw. */
      dockTick: number
      /** What the mascot shows; a new session starts it waving. */
      mascot: MascotState
      /** How many AskUserQuestion dialogs are open: the mascot looks puzzled while any is. */
      asking: number
      /** Whether Claude's last reply ended by asking something; cleared by the person's next prompt. */
      isQuestionOpen: boolean
      /** Whether Claude's last reply asks something it never put as pop-up choices: the bar's ? button runs /askme. */
      isAskable: boolean
      /** The main chat's model, as its last request sent it: what a cold cache's cost is priced at. */
      mainModel: string | null
      /** The GitHub repository the session works in; null outside one. */
      githubRepo: GithubRepo | null
      /** The project's `.claude/aitools.json` project section; null when it has none. */
      projectConfig: ProjectConfig | null
      /** The repository's GitHub Project board, as configured or looked up; null when it has none (or several). */
      boardUrl: string | null
      /** The issue the session's first prompt names; null when it names none (the branch may still name one). */
      promptIssue: number | null
      /** The title of the issue the row links to, once fetched. */
      issueTitle: { number: number; title: string } | null
      /** Each tool's run in this session, by tool id. */
      toolRuns: Record<string, ToolRun>
      /** What listens on each server tool's port, by tool id. */
      toolListeners: Record<string, ToolListener | null>
      /** Each tool's log, by tool id: the newest LOG_KEEP lines. */
      toolLogs: Record<string, string[]>
      /** /keepwarm's window while it runs; null while it is off. */
      keepWarm: KeepWarm | null
      /** Why /keepwarm last stopped before its time (a failed or cold ping); null when it ended on time or was turned off. */
      keepWarmStopped: string | null
      /** Whether the Worktrees pane is open, so a reload opens it again; git is only read while it is. */
      isWorktreesOpen: boolean
      /** The pane's rows; null until it first opens. */
      worktrees: WorktreeList | null
      /** The pane's question, removal under way, or last result. */
      worktreeAction: WorktreeAction
      /** Whether the Project pane is open, so a reload opens it again; the board is only read while it is. */
      isBoardOpen: boolean
      /** The Project pane's board items. */
      board: BoardState
      /** Which items the Project pane lists. */
      boardFilter: BoardFilter
      /** Whether a read of the board is under way: the pane's Refresh says so. */
      isBoardReading: boolean
    }
  }
}
