/**
 * The Branches pane: every branch of the repository, on this computer and on its remote, one row each, with the
 * worktree it is checked out in. A branch is done once its parent has all its work, so the pane can clean up the
 * worktrees, local branches and remote branches that are finished with.
 */

import type { Elements, RenderChildren } from 'claude-code'

import type { Branch, BranchAction, BranchCheckout, BranchList, BranchPr, BranchTarget, BranchesShow, BranchesWhere, CiState } from '../types'
import { NOTE_SHRINK } from './format'
import { BLUE, DOING_TEXT, FAINT_TEXT, GREEN, RED, YELLOW } from './palette'
import { renderPick } from './picks'
import { PRUNER_HEIGHT, PRUNER_WIDTH, prunerAlt, prunerSvg } from './pruner'
import type { PrunerMode } from './pruner'

export const BRANCHES_PANE = 'branches'
export const BRANCHES_TITLE = 'Branches'
/**
 * How often the open pane fetches from the remote and reads git and GitHub (PRs and CI) again: every 5 minutes, since
 * GitHub's API budget is shared with everything else signed in as the person. Refresh reads them now.
 */
export const REFRESH_MS = 5 * 60_000
/** How long after a tool that can change files the project row reads the repository again: a burst of edits reads once. */
export const AFTER_TOOL_MS = 1500
/** How long the sweeping Clawd shows at least, so a quick clean is still seen. */
export const SWEEP_MS = 2400
/** Tools that can change a branch or make a worktree: the project row reads the repository again after one. */
export const CHANGING_TOOLS: ReadonlySet<string> = new Set(['Bash', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Agent', 'EnterWorktree', 'ExitWorktree'])
/** How far back the base branch's own line is read, to tell a branch never given commits from a merged one. */
export const FIRST_PARENT_DEPTH = 2000

export const WHERE_PICKS = ['both', 'local', 'remote'] as const
export const WHERE_LABELS: Record<BranchesWhere, string> = { both: 'Local + remote', local: 'Local', remote: 'Remote' }
export const SHOW_PICKS = ['all', 'active', 'done'] as const
export const SHOW_LABELS: Record<BranchesShow, string> = { all: 'All', active: 'Active', done: 'Done' }
export const DEFAULT_WHERE: BranchesWhere = 'both'
export const DEFAULT_SHOW: BranchesShow = 'all'

export function isBranchesWhere(value: unknown): value is BranchesWhere {
  return WHERE_PICKS.some(pick => pick === value)
}

export function isBranchesShow(value: unknown): value is BranchesShow {
  return SHOW_PICKS.some(pick => pick === value)
}

// ---- Reading git ----

/** One entry of `git worktree list --porcelain`. */
export type WorktreeEntry = { path: string; head: string; branch: string | null; isLocked: boolean; isMissing: boolean }

/** The entries of `git worktree list --porcelain`, the main working tree first; bare entries left out. */
export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  for (const block of stdout.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(Boolean)
    const path = lines.find(l => l.startsWith('worktree '))?.slice('worktree '.length)
    if (path === undefined || lines.includes('bare')) {
      continue
    }
    const branch = lines.find(l => l.startsWith('branch '))?.slice('branch '.length)
    entries.push({
      path,
      head: lines.find(l => l.startsWith('HEAD '))?.slice('HEAD '.length) ?? '',
      branch: branch === undefined ? null : branch.replace(/^refs\/heads\//, ''),
      isLocked: lines.some(l => l === 'locked' || l.startsWith('locked ')),
      isMissing: lines.some(l => l === 'prunable' || l.startsWith('prunable ')),
    })
  }

  return entries
}

/**
 * The `git for-each-ref` format `parseRefs` reads, over `refs/heads` and `refs/remotes`: one ref a line, tab
 * separated, with how far ahead of `base` each is.
 */
export function refFormat(base: string): string {
  return `%(refname)%09%(objectname)%09%(committerdate:unix)%09%(upstream)%09%(upstream:track)%09%(ahead-behind:${base})`
}

/** A branch ref: its commit, its last commit's time, and how many commits the base branch lacks. */
type Ref = { sha: string; committedAt: number | null; aheadOfBase: number }

/** A local branch, with the remote branch it tracks (null with none, or when that is gone) and how far ahead of it. */
export type LocalRef = Ref & { name: string; upstream: { remote: string; branch: string } | null; unpushed: number }

/** A branch on a remote. */
export type RemoteRef = Ref & { remote: string; branch: string }

/** Local branches by name, and remote branches by `remote/branch`; a remote's HEAD left out. */
export function parseRefs(stdout: string): { locals: Map<string, LocalRef>; remotes: Map<string, RemoteRef> } {
  const locals = new Map<string, LocalRef>()
  const remotes = new Map<string, RemoteRef>()
  for (const line of stdout.split('\n')) {
    const [refname = '', sha = '', date = '', upstream = '', track = '', aheadBehind = ''] = line.split('\t')
    const seconds = Number(date)
    const ref: Ref = {
      sha,
      committedAt: date !== '' && Number.isFinite(seconds) ? seconds * 1000 : null,
      aheadOfBase: Number(aheadBehind.split(' ')[0] || 0),
    }
    if (refname.startsWith('refs/heads/')) {
      const name = refname.slice('refs/heads/'.length)
      const up = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(upstream)
      locals.set(name, {
        ...ref,
        name,
        upstream: up?.[1] && up[2] && !track.includes('gone') ? { remote: up[1], branch: up[2] } : null,
        unpushed: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
      })
    } else if (refname.startsWith('refs/remotes/') && !refname.endsWith('/HEAD')) {
      const match = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(refname)
      if (match?.[1] && match[2]) remotes.set(`${match[1]}/${match[2]}`, { ...ref, remote: match[1], branch: match[2] })
    }
  }

  return { locals, remotes }
}

/**
 * How many branches a repository has besides the base, local and remote counted once by name, from
 * `git for-each-ref --format=%(refname) refs/heads refs/remotes/<remote>`.
 */
export function countBranches(stdout: string, remote: string, base: string): number {
  const names = new Set<string>()
  for (const ref of stdout.split('\n').map(l => l.trim())) {
    const name = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref.startsWith(`refs/remotes/${remote}/`) ? ref.slice(`refs/remotes/${remote}/`.length) : null
    if (name !== null && name !== 'HEAD' && name !== base) names.add(name)
  }

  return names.size
}

/** Lines added and removed from `git diff --shortstat`. */
export function parseShortstat(stdout: string): { added: number; removed: number } {
  return {
    added: Number(/(\d+) insertion/.exec(stdout)?.[1] ?? 0),
    removed: Number(/(\d+) deletion/.exec(stdout)?.[1] ?? 0),
  }
}

/** Entries of `git status --porcelain`: changed, staged and untracked files. */
export function countChanged(stdout: string): number {
  return stdout.split('\n').filter(l => l.trim() !== '').length
}

/** Each commit's parents, by commit, from `git rev-list --parents`. */
export function parseParents(stdout: string): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const line of stdout.split('\n')) {
    const [sha, ...parents] = line.trim().split(' ')
    if (sha) graph.set(sha, parents)
  }

  return graph
}

/** Where a commit left the base: how many commits of its own the base lacks, and the base commit it grew from. */
export type Fork = { ahead: number; fork: string | null }

/**
 * Where each tip left the base, from the commits the base lacks (`git rev-list --parents ^<base> <tips>`, read once
 * for every branch): its own commits, and the one base commit they grew from, its merge base. A tip the base has is
 * its own fork; one that grew from several (the base merged into it) or none (an unrelated history) has null, for
 * `git merge-base` to settle.
 */
export function findForks(graph: ReadonlyMap<string, readonly string[]>, tips: readonly string[]): Map<string, Fork> {
  const forks = new Map<string, Fork>()
  for (const tip of new Set(tips.filter(Boolean))) {
    if (!graph.has(tip)) {
      forks.set(tip, { ahead: 0, fork: tip })
      continue
    }
    const own = new Set<string>()
    const edges = new Set<string>()
    const stack = [tip]
    for (let sha = stack.pop(); sha !== undefined; sha = stack.pop()) {
      const parents = graph.get(sha)
      if (parents === undefined) {
        // Not among the commits the base lacks: the base has it.
        edges.add(sha)
      } else if (!own.has(sha)) {
        own.add(sha)
        stack.push(...parents)
      }
    }
    forks.set(tip, { ahead: own.size, fork: edges.size === 1 ? [...edges][0]! : null })
  }

  return forks
}

/**
 * Lines added and removed by each commit, by commit, from `git diff-tree --stdin --shortstat` given `<tip> <fork>`
 * lines: a commit line, then its stat line. A tip with no changes since its fork writes neither, so is left out.
 */
export function parseTreeStats(stdout: string): Map<string, { added: number; removed: number }> {
  const stats = new Map<string, { added: number; removed: number }>()
  let sha = ''
  for (const line of stdout.split('\n').map(l => l.trim())) {
    if (/^[0-9a-f]{40,64}$/.test(line)) {
      sha = line
    } else if (sha && line.includes('changed')) {
      stats.set(sha, parseShortstat(line))
    }
  }

  return stats
}

/** Each commit's time in milliseconds, by commit, from `git log --format='%H %ct'`. */
export function parseCommitTimes(stdout: string): Map<string, number> {
  const times = new Map<string, number>()
  for (const line of stdout.split('\n')) {
    const [sha = '', seconds = ''] = line.trim().split(' ')
    if (sha && seconds && Number.isFinite(Number(seconds))) times.set(sha, Number(seconds) * 1000)
  }

  return times
}

// ---- Reading GitHub ----

type Check = { __typename?: string; status?: string; conclusion?: string; state?: string }

/** One check of a pull request's status rollup: a check run, or a commit status. */
function checkState(c: Check): CiState {
  if (c.state !== undefined && c.status === undefined) {
    return c.state === 'SUCCESS' ? 'pass' : c.state === 'PENDING' || c.state === 'EXPECTED' ? 'running' : 'fail'
  }
  if (c.status !== undefined && c.status.toUpperCase() !== 'COMPLETED') {
    return 'running'
  }
  const conclusion = (c.conclusion ?? '').toUpperCase()

  return conclusion === 'SUCCESS' || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED' ? 'pass' : 'fail'
}

/** Several checks as one: any failed fails, else any running runs, else passed; none is none. */
export function combineChecks(states: readonly CiState[]): CiState {
  return states.includes('fail') ? 'fail' : states.includes('running') ? 'running' : states.includes('pass') ? 'pass' : 'none'
}

/** A pull request as `gh pr list --json` gives it, with its checks combined. */
export type PrFacts = BranchPr & { branch: string; headOid: string; ci: CiState }

/** `gh pr list --json number,url,state,headRefName,headRefOid,statusCheckRollup`, by branch, newest first. */
export function parsePrs(json: string): Map<string, PrFacts[]> {
  const prs = new Map<string, PrFacts[]>()
  let rows: unknown
  try {
    rows = JSON.parse(json)
  } catch {
    return prs
  }
  if (!Array.isArray(rows)) {
    return prs
  }
  for (const row of rows as Record<string, unknown>[]) {
    const branch = typeof row.headRefName === 'string' ? row.headRefName : ''
    const state = String(row.state ?? '').toLowerCase()
    if (!branch || typeof row.number !== 'number' || (state !== 'open' && state !== 'merged' && state !== 'closed')) {
      continue
    }
    const checks = Array.isArray(row.statusCheckRollup) ? (row.statusCheckRollup as Check[]) : []
    const pr: PrFacts = {
      number: row.number,
      url: typeof row.url === 'string' ? row.url : '',
      state,
      branch,
      headOid: typeof row.headRefOid === 'string' ? row.headRefOid : '',
      ci: combineChecks(checks.map(checkState)),
    }
    prs.set(branch, [...(prs.get(branch) ?? []), pr].sort((a, b) => b.number - a.number))
  }

  return prs
}

/** `gh run list --json headSha,status,conclusion`: each commit's workflow runs combined. */
export function parseRuns(json: string): Map<string, CiState> {
  const bySha = new Map<string, CiState[]>()
  let rows: unknown
  try {
    rows = JSON.parse(json)
  } catch {
    return new Map()
  }
  if (!Array.isArray(rows)) {
    return new Map()
  }
  for (const row of rows as Record<string, unknown>[]) {
    if (typeof row.headSha !== 'string') {
      continue
    }
    const state = checkState({ status: String(row.status ?? ''), conclusion: String(row.conclusion ?? '') })
    bySha.set(row.headSha, [...(bySha.get(row.headSha) ?? []), state])
  }

  return new Map([...bySha].map(([sha, states]) => [sha, combineChecks(states)]))
}

/** A branch's pull request: the one at its commit, else the open one, else the newest. */
export function pickPr(prs: readonly PrFacts[] | undefined, head: string): PrFacts | null {
  if (!prs || prs.length === 0) {
    return null
  }

  return prs.find(p => p.headOid === head) ?? prs.find(p => p.state === 'open') ?? prs[0]!
}

// ---- Joining them into rows ----

/** What git says of one worktree's folder: its changes, its commits the base lacks, its last commit, its lines. */
export type CheckoutFacts = { changedFiles: number; aheadOfBase: number; committedAt: number | null; added: number; removed: number }

/** Everything one read of the repository brings, for joinBranches. */
export type RepoFacts = {
  /** The branch merges are measured against, as git names it: `origin/main`. */
  base: string
  /** The remote whose branches are listed: the base's, else origin. */
  remote: string
  entries: readonly WorktreeEntry[]
  /** The worktree this session runs in. */
  current: string
  locals: ReadonlyMap<string, LocalRef>
  remotes: ReadonlyMap<string, RemoteRef>
  /** Each worktree's own facts, by path. */
  checkouts: ReadonlyMap<string, CheckoutFacts>
  /** Lines added and removed since the base, by commit, for branches no worktree has. */
  stats: ReadonlyMap<string, { added: number; removed: number }>
  /** The base branch's own commits (its first parents), recent ones: a branch tip among them was never given commits. */
  baseLine: ReadonlySet<string>
  prs: ReadonlyMap<string, PrFacts[]>
  runs: ReadonlyMap<string, CiState>
}

/** The last part of a path: what a detached worktree is called. */
function folderName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

/** The base branch as a person names it: `origin/main` is main. */
export function baseName(base: string): string {
  return base.replace(/^[^/]+\//, '')
}

type Draft = { name: string; local: LocalRef | null; remote: RemoteRef | null; entry: WorktreeEntry | null }

/**
 * Every branch of the repository as one row: a local branch with its remote branch (the one it tracks, else the one
 * of its name), a remote branch no local one has, and the worktree each is checked out in. A detached worktree joins
 * the branch named for its folder (`claude/<folder>`, as the desktop app makes them), else is a row of its own.
 */
export function joinBranches(f: RepoFacts): Branch[] {
  const drafts = new Map<string, Draft>()
  const claimed = new Set<string>()
  for (const local of f.locals.values()) {
    const tracked = local.upstream === null ? undefined : f.remotes.get(`${local.upstream.remote}/${local.upstream.branch}`)
    const remote = tracked ?? f.remotes.get(`${f.remote}/${local.name}`) ?? null
    if (remote !== null) claimed.add(`${remote.remote}/${remote.branch}`)
    drafts.set(local.name, { name: local.name, local, remote, entry: null })
  }
  for (const [key, remote] of f.remotes) {
    if (remote.remote !== f.remote || claimed.has(key) || drafts.has(remote.branch)) {
      continue
    }
    drafts.set(remote.branch, { name: remote.branch, local: null, remote, entry: null })
  }
  const loose: Draft[] = []
  for (const entry of f.entries) {
    const named = entry.branch === null ? undefined : drafts.get(entry.branch)
    if (named !== undefined) {
      named.entry = entry
      continue
    }
    const folder = folderName(entry.path)
    const match =
      entry.branch === null
        ? [...drafts.values()].find(d => d.entry === null && (d.name === folder || d.name.endsWith(`/${folder}`)))
        : undefined
    if (match !== undefined) {
      match.entry = entry
    } else {
      loose.push({ name: entry.branch ?? folder, local: null, remote: null, entry })
    }
  }

  return [...drafts.values(), ...loose].map(d => toBranch(d, f))
}

/** One row from its parts: what it holds, its pull request and CI, and how it stands. */
function toBranch(d: Draft, f: RepoFacts): Branch {
  const { local, remote, entry } = d
  const facts = entry === null ? undefined : f.checkouts.get(entry.path)
  const checkout: BranchCheckout | null =
    entry === null
      ? null
      : {
          path: entry.path,
          head: entry.head,
          isMain: entry.path === f.entries[0]?.path,
          isCurrent: entry.path === f.current,
          isLocked: entry.isLocked,
          isMissing: entry.isMissing,
          isDetached: entry.branch === null,
          changedFiles: facts?.changedFiles ?? 0,
        }
  // The branch's own commit: its local branch's, else its remote's, else the worktree's for one with neither.
  const tip = local?.sha ?? remote?.sha ?? entry?.head ?? ''
  const isBranch = local !== null || remote !== null
  const prFacts = isBranch ? pickPr(f.prs.get(d.name), tip) : ([...f.prs.values()].flat().find(p => p.headOid === tip) ?? null)
  const isMergedPr = prFacts !== null && prFacts.state === 'merged' && prFacts.headOid === tip
  const ahead = Math.max(local?.aheadOfBase ?? 0, remote?.aheadOfBase ?? 0, facts?.aheadOfBase ?? 0)
  const unpushed = local === null ? 0 : remote === null ? local.aheadOfBase : local.unpushed
  const changedFiles = checkout?.changedFiles ?? 0
  const stat = facts ?? f.stats.get(tip) ?? { added: 0, removed: 0 }
  const times = [local?.committedAt, remote?.committedAt, facts?.committedAt].filter((t): t is number => typeof t === 'number')
  const ci = prFacts !== null && prFacts.headOid === tip && prFacts.ci !== 'none' ? prFacts.ci : (f.runs.get(tip) ?? 'none')
  let state: Branch['state']
  if (isBranch && d.name === baseName(f.base)) {
    state = 'base'
  } else if (changedFiles > 0 || (ahead > 0 && !isMergedPr)) {
    state = 'active'
  } else if (!isMergedPr && f.baseLine.has(tip)) {
    // Its tip is one of the base branch's own commits: it was branched off and never given commits of its own.
    state = 'empty'
  } else {
    state = 'done'
  }

  return {
    name: d.name,
    isLocal: local !== null,
    remote: remote === null ? null : { name: remote.remote, branch: remote.branch },
    checkout,
    ahead,
    unpushed,
    added: stat.added,
    removed: stat.removed,
    committedAt: times.length > 0 ? Math.max(...times) : null,
    pr: prFacts === null ? null : { number: prFacts.number, url: prFacts.url, state: prFacts.state },
    ci,
    state,
  }
}

// ---- What the pane makes of the rows ----

/** Where a branch lives, for the On column: `both`, `local`, `remote`, or `-` for a worktree with no branch. */
export function onText(b: Branch): string {
  return b.isLocal && b.remote !== null ? 'both' : b.isLocal ? 'local' : b.remote !== null ? 'remote' : '-'
}

/** Where it is checked out, for its column: the main folder, a worktree, or nowhere. */
export function checkoutText(b: Branch): string {
  return b.checkout === null ? '-' : b.checkout.isMain ? 'main folder' : 'worktree'
}

/** Whether the row offers its own delete: never on the base branch, the main folder's, this session's, or a locked one. */
export function isDeletable(b: Branch): boolean {
  return b.state !== 'base' && b.checkout?.isMain !== true && b.checkout?.isCurrent !== true && b.checkout?.isLocked !== true
}

/** Whether Clean up removes it: done or empty, and deletable. */
export function isCleanable(b: Branch): boolean {
  return (b.state === 'done' || b.state === 'empty') && isDeletable(b)
}

/** The rows the two filters leave: Local is what this computer has (a worktree included), Remote what the remote has. */
export function visibleBranches(list: readonly Branch[], where: BranchesWhere, show: BranchesShow): Branch[] {
  const isPlaced = (b: Branch) => where === 'both' || (where === 'local' ? b.isLocal || b.checkout !== null : b.remote !== null)
  const isShown = (b: Branch) =>
    show === 'all' || (show === 'done' ? b.state === 'done' || b.state === 'empty' : b.state === 'base' || b.state === 'active')

  return list.filter(b => isPlaced(b) && isShown(b))
}

/**
 * Rows in order: the base branch, then the active ones, then the done ones (empty ones with them); within each, the
 * main folder's, this session's, then the rest, the latest commit first.
 */
export function sortBranches(list: readonly Branch[]): Branch[] {
  const group = (b: Branch) => (b.state === 'base' ? 0 : b.state === 'done' || b.state === 'empty' ? 2 : 1)
  const rank = (b: Branch) => (b.checkout?.isMain ? 0 : b.checkout?.isCurrent ? 1 : 2)

  return [...list].sort((a, b) => group(a) - group(b) || rank(a) - rank(b) || (b.committedAt ?? 0) - (a.committedAt ?? 0))
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The faint words after a row's name, most telling first, so a cut row still says them. */
export function noteParts(b: Branch): string[] {
  const parts: string[] = []
  if (b.checkout && b.checkout.changedFiles > 0) parts.push(`${b.checkout.changedFiles} changed`)
  if (b.state === 'active' && b.unpushed > 0) {
    parts.push(`${b.unpushed} unpushed`)
  } else if (b.state === 'active' && b.ahead > 0) {
    parts.push(`${b.ahead} unmerged`)
  }
  if (b.state === 'empty') parts.push('empty')
  if (b.state === 'base') parts.push('base')
  if (b.checkout?.isMissing) parts.push('folder missing')
  if (b.checkout?.isLocked) parts.push('locked')
  if (b.checkout?.isDetached) parts.push('detached')
  if (b.checkout?.isCurrent) parts.push('this session')
  if (b.pr?.state === 'closed') parts.push('PR closed')

  return parts
}

/** The row's mark: ● blue where this session is, ● yellow with changes, ↑ yellow unpushed, ✓ faint done, ○ else. */
export function branchMark(b: Branch): { text: string; color: string } {
  if (b.checkout?.isCurrent) return { text: '●', color: BLUE }
  if (b.checkout && b.checkout.changedFiles > 0) return { text: '●', color: YELLOW }
  if (b.state === 'active' && b.unpushed > 0) return { text: '↑', color: YELLOW }
  if (b.state === 'done' || b.state === 'empty') return { text: '✓', color: FAINT_TEXT }

  return { text: '○', color: FAINT_TEXT }
}

/** CI's mark, a small dot as GitHub shows it: green passed, red failed, yellow running; - none. */
export const CI_MARKS: Record<CiState, { text: string; color: string }> = {
  pass: { text: '•', color: GREEN },
  fail: { text: '•', color: RED },
  running: { text: '•', color: YELLOW },
  none: { text: '-', color: FAINT_TEXT },
}

/** The header line: how many branches and worktrees the Branches filter leaves, and how many of them are done. */
export function headerText(list: readonly Branch[]): string {
  const parts = [plural(list.length, 'branch', 'branches')]
  const trees = list.filter(b => b.checkout !== null && !b.checkout.isMain).length
  if (trees > 0) parts.push(plural(trees, 'worktree'))
  const done = list.filter(isCleanable).length
  if (done > 0) parts.push(`${done} done`)

  return parts.join(' · ')
}

/** The parts of several rows, counted: `1 worktree, 3 local and 4 remote branches`. */
export function partsText(rows: readonly Branch[]): string {
  const worktrees = rows.filter(b => b.checkout !== null).length
  const locals = rows.filter(b => b.isLocal).length
  const remotes = rows.filter(b => b.remote !== null).length
  const out: string[] = []
  if (worktrees > 0) out.push(plural(worktrees, 'worktree'))
  if (locals > 0 && remotes > 0) {
    out.push(`${locals} local and ${remotes} remote ${remotes === 1 ? 'branch' : 'branches'}`)
  } else if (locals > 0) {
    out.push(plural(locals, 'local branch', 'local branches'))
  } else if (remotes > 0) {
    out.push(plural(remotes, 'remote branch', 'remote branches'))
  }

  return out.join(', ')
}

/** What Clean up would do, said before it is pressed. */
export function cleanText(list: readonly Branch[], base: string): string {
  const rows = list.filter(isCleanable)
  if (rows.length === 0) {
    return `Nothing to clean up: every branch has work that isn't on ${baseName(base)} yet.`
  }

  return `Clean up removes ${plural(rows.length, 'done branch', 'done branches')}: ${partsText(rows)}.`
}

/** What deleting one row asks first (what it takes), and what it would lose. */
export function deleteText(b: Branch): { question: string; warning: string } {
  const what = [b.checkout !== null ? 'worktree' : '', b.isLocal ? 'local branch' : '', b.remote !== null ? 'remote branch' : ''].filter(Boolean)
  const listed = what.length <= 1 ? what.join('') : `${what.slice(0, -1).join(', ')} and ${what.at(-1)}`
  const lost: string[] = []
  if (b.checkout && b.checkout.changedFiles > 0) lost.push(plural(b.checkout.changedFiles, 'uncommitted file'))
  if (b.state === 'active' && b.ahead > 0) lost.push(plural(b.ahead, 'commit', 'commits') + ' not on the base branch')

  return {
    question: `Delete ${b.name}${listed ? ` (${listed})` : ''}?`,
    warning: lost.length > 0 ? `This loses ${lost.join(' and ')}.` : '',
  }
}

/** Clawd's pose: sweeping while branches are removed, napping with nothing to clean up, else pruning. */
export function prunerMode(list: BranchList | null, action: BranchAction): PrunerMode {
  if (action?.step === 'busy') {
    return 'sweeping'
  }

  return list?.status === 'ready' && !list.branches.some(isCleanable) ? 'napping' : 'pruning'
}

/** How long since, in its largest unit, compact: `5m`, `3h`, `12d`; `now` under a minute. */
export function age(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)

  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 24 * 60 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / (24 * 60))}d`
}

const sameTarget = (a: BranchTarget, b: BranchTarget) => a.kind === b.kind && (a.kind === 'clean' || (b.kind === 'delete' && a.name === b.name))

// ---- Drawing ----

/** `Svg` only where the surface draws it (the desktop): Clawd shows there alone. */
type El = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & { Svg?: Elements['desktop']['Svg'] }

type Actions = {
  ask(target: BranchTarget): void
  confirm(): void
  cancel(): void
  refresh(): void
  open(url: string): void
  setWhere(where: BranchesWhere): void
  setShow(show: BranchesShow): void
}

/**
 * The Branches pane: the two filters, then the header, what Clean up would do (or what it did), and Clean up with
 * Refresh (or its question); then the columns' titles and a row per branch. Where SVG is drawn, Clawd stands left of
 * the controls.
 */
export function renderBranches(
  el: El,
  view: { list: BranchList | null; action: BranchAction; where: BranchesWhere; show: BranchesShow; now: number },
  on: Actions,
) {
  const { Box, Text, Svg } = el
  const { list, action } = view
  const mode = prunerMode(list, action)
  const all = list?.status === 'ready' ? list.branches : []
  const placed = visibleBranches(all, view.where, 'all')
  const rows = sortBranches(visibleBranches(all, view.where, view.show))

  let lines: RenderChildren[]
  if (list === null || list.status === 'loading') {
    lines = [<Text key="loading" dimColor>Reading branches…</Text>]
  } else if (list.status === 'error') {
    lines = [<Text key="error" dimColor>{list.text}</Text>]
  } else {
    lines = [
      <Text key="header" dimColor>{headerText(placed)}</Text>,
      action?.step === 'done' ? (
        <Text key="note" color={action.isError ? RED : FAINT_TEXT}>{action.text}</Text>
      ) : (
        <Text key="note" color={FAINT_TEXT}>{cleanText(all, list.base)}</Text>
      ),
      renderClean(el, all, action, on),
    ]
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {Svg && (
          <Box key="pruner" flexShrink={0} marginRight={2}>
            <Svg source={prunerSvg(mode)} alt={prunerAlt(mode)} width={PRUNER_WIDTH} height={PRUNER_HEIGHT} />
          </Box>
        )}
        <Box flexDirection="column" flexShrink={1} gap={1}>
          {renderFilters(el, view, on)}
          <Box flexDirection="column">{lines}</Box>
        </Box>
      </Box>
      {rows.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {renderTitles(el)}
          {rows.map(b => renderRow(el, b, view, on))}
        </Box>
      )}
    </Box>
  )
}

/** The pane's two option rows: where the branches live, and how they stand. */
function renderFilters(el: El, view: { where: BranchesWhere; show: BranchesShow }, on: Actions) {
  const { Box, Text } = el

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>Branches:</Text>
        {WHERE_PICKS.map(pick => renderPick(el, `where-${pick}`, WHERE_LABELS[pick], view.where === pick, () => on.setWhere(pick)))}
      </Box>
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>Show:</Text>
        {SHOW_PICKS.map(pick => renderPick(el, `show-${pick}`, SHOW_LABELS[pick], view.show === pick, () => on.setShow(pick)))}
      </Box>
    </Box>
  )
}

/**
 * Clean up (faint and unpressable with nothing done) and Refresh, which reads git and GitHub and fetches now; or
 * Clean up's question once pressed, or what it is doing. A blank line above.
 */
function renderClean(el: El, all: readonly Branch[], action: BranchAction, on: Actions) {
  const { Box, Text, Button } = el
  const done = all.filter(isCleanable)
  if (action?.step === 'busy') {
    return (
      <Box key="clean" marginTop={1}>
        <Text dimColor>{action.target.kind === 'clean' ? 'Cleaning up…' : 'Deleting…'}</Text>
      </Box>
    )
  }
  if (action?.step === 'ask' && action.target.kind === 'clean') {
    return (
      <Box key="clean" flexDirection="row" columnGap={1} marginTop={1}>
        <Text>{`Remove ${partsText(done)}?`}</Text>
        <Button key="clean-yes" label="Yes" plain dimColor={false} onPress={() => on.confirm()} />
        <Button key="clean-no" label="No" plain dimColor onPress={() => on.cancel()} />
      </Box>
    )
  }
  const label = done.length === 0 ? 'Clean up' : `Clean up ${done.length} done`

  return (
    <Box key="clean" flexDirection="row" columnGap={2} marginTop={1}>
      {done.length === 0 ? (
        <Text key="clean-off" color={FAINT_TEXT}>{label}</Text>
      ) : (
        <Button key="clean" label={label} plain dimColor={false} onPress={() => on.ask({ kind: 'clean' })} />
      )}
      <Button key="refresh" label="Refresh" plain dimColor onPress={() => on.refresh()} />
    </Box>
  )
}

/**
 * The right-hand columns' widths in cells: where it lives, where it is checked out, age, lines added and removed,
 * pull request, CI, delete. Each sits in a box of its own width, so the columns line up on every row whatever is in
 * them: a desktop's native × button is wider than a cell, and rows without one keep its room empty.
 */
export const COLUMNS = { on: 8, out: 12, age: 4, added: 6, removed: 6, pr: 7, ci: 3, delete: 3 } as const

type Justify = 'flex-start' | 'flex-end' | 'center'

function cell(el: El, key: string, width: number, child: RenderChildren, justify: Justify = 'flex-end') {
  const { Box } = el

  return (
    <Box key={key} width={width} flexShrink={0} flexDirection="row" justifyContent={justify}>
      {child}
    </Box>
  )
}

/** The columns' titles, dim, over the rows: Branch on the left, the rest over their columns. */
function renderTitles(el: El) {
  const { Box, Text } = el
  const title = (text: string) => <Text dimColor>{text}</Text>

  return (
    <Box key="titles" flexDirection="row" justifyContent="space-between">
      <Text dimColor>{'  Branch'}</Text>
      <Box flexDirection="row" flexShrink={0}>
        {cell(el, 'on', COLUMNS.on, title(' On'), 'flex-start')}
        {cell(el, 'out', COLUMNS.out, title('Checked out'), 'flex-start')}
        {cell(el, 'age', COLUMNS.age, title('Last'))}
        {cell(el, 'changes', COLUMNS.added + COLUMNS.removed, title('Changes'))}
        {cell(el, 'pr', COLUMNS.pr, title('PR'))}
        {cell(el, 'ci', COLUMNS.ci, title('CI'), 'center')}
        {cell(el, 'delete', COLUMNS.delete, null)}
      </Box>
    </Box>
  )
}

/**
 * One branch's row: its mark, name and faint note on the left; where it lives and is checked out, how long since its
 * last commit, lines added and removed, its pull request (pressing it opens it on GitHub), CI and × on the right, in
 * fixed columns. A done branch's row is all faint, as a finished background task's is. Pressing × asks first, on a
 * line beneath the row, with what deleting it takes and would lose; pressing it again takes the question back.
 */
function renderRow(el: El, b: Branch, view: { action: BranchAction; now: number }, on: Actions) {
  const { Box, Text, Button } = el
  const target: BranchTarget = { kind: 'delete', name: b.name }
  const isAsking = view.action?.step === 'ask' && sameTarget(view.action.target, target)
  const isBusy = view.action?.step === 'busy'
  const mark = branchMark(b)
  const ci = CI_MARKS[b.ci]
  const note = noteParts(b).join(' · ')
  const isFinished = b.state === 'done' || b.state === 'empty'
  const ago = b.committedAt === null ? '' : age(view.now - b.committedAt)
  const ask = isAsking ? deleteText(b) : null
  const hasChanges = b.added > 0 || b.removed > 0
  // A done row keeps its marks, but faint: only its delete button stands out.
  const tone = (color: string) => (isFinished ? FAINT_TEXT : color)

  return (
    <Box key={`branch-${b.name}`} flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" flexShrink={1} minWidth={0} overflow="hidden">
          <Text color={mark.color}>{`${mark.text} `}</Text>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text color={isFinished ? FAINT_TEXT : DOING_TEXT} wrap="truncate-end">
              {b.name}
            </Text>
          </Box>
          {note && (
            <Box flexShrink={NOTE_SHRINK} minWidth={0} overflow="hidden">
              <Text color={FAINT_TEXT} wrap="truncate-end">
                {` · ${note}`}
              </Text>
            </Box>
          )}
        </Box>
        <Box flexDirection="row" flexShrink={0}>
          {cell(el, 'on', COLUMNS.on, <Text color={FAINT_TEXT}>{` ${onText(b)}`}</Text>, 'flex-start')}
          {cell(el, 'out', COLUMNS.out, <Text color={FAINT_TEXT}>{checkoutText(b)}</Text>, 'flex-start')}
          {cell(el, 'age', COLUMNS.age, <Text color={FAINT_TEXT}>{ago}</Text>)}
          {cell(el, 'added', COLUMNS.added, hasChanges ? <Text color={tone(GREEN)}>{`+${b.added}`}</Text> : <Text color={FAINT_TEXT}>-</Text>)}
          {cell(el, 'removed', COLUMNS.removed, hasChanges ? <Text color={tone(RED)}>{`-${b.removed}`}</Text> : <Text color={FAINT_TEXT}>-</Text>)}
          {cell(el, 'pr', COLUMNS.pr, renderPr(el, b.pr, on))}
          {cell(el, 'ci', COLUMNS.ci, <Text color={tone(ci.color)}>{ci.text}</Text>, 'center')}
          {cell(
            el,
            'delete',
            COLUMNS.delete,
            isDeletable(b) && !isBusy ? (
              <Button key={`delete-${b.name}`} label="×" plain dimColor={!isAsking} onPress={() => (isAsking ? on.cancel() : on.ask(target))} />
            ) : null,
            'center',
          )}
        </Box>
      </Box>
      {ask && (
        <Box flexDirection="column" alignItems="flex-end">
          <Box flexDirection="row" columnGap={1}>
            <Text color={YELLOW}>{ask.question}</Text>
            <Button key={`delete-yes-${b.name}`} label="Yes" plain dimColor={false} onPress={() => on.confirm()} />
            <Button key={`delete-no-${b.name}`} label="No" plain dimColor onPress={() => on.cancel()} />
          </Box>
          {ask.warning && <Text color={FAINT_TEXT}>{ask.warning}</Text>}
        </Box>
      )}
    </Box>
  )
}

/** A row's pull request: `#12`, a button that opens it on GitHub; `-` with none. */
function renderPr(el: El, pr: BranchPr | null, on: Actions) {
  const { Text, Button } = el
  if (pr === null) {
    return <Text color={FAINT_TEXT}>-</Text>
  }
  const label = `#${pr.number}`

  return pr.url ? <Button key={`pr-${pr.number}`} label={label} plain dimColor onPress={() => on.open(pr.url)} /> : <Text color={FAINT_TEXT}>{label}</Text>
}

// ---- Removing ----

/** What removing one row came to: its worktree, its local branch, its remote branch, or why it stopped. */
export type Removal = { name: string; isWorktreeRemoved: boolean; isBranchDeleted: boolean; isRemoteDeleted: boolean; error?: string }

/** The line the pane shows once branches are removed: what went, then what could not be removed and why. */
export function removedText(results: readonly Removal[]): { text: string; isError: boolean } {
  const parts: string[] = []
  const worktrees = results.filter(r => r.isWorktreeRemoved).length
  const locals = results.filter(r => r.isBranchDeleted).length
  const remotes = results.filter(r => r.isRemoteDeleted).length
  const gone = [
    worktrees > 0 ? plural(worktrees, 'worktree') : '',
    locals > 0 ? plural(locals, 'local branch', 'local branches') : '',
    remotes > 0 ? plural(remotes, 'remote branch', 'remote branches') : '',
  ].filter(Boolean)
  if (gone.length > 0) parts.push(`Removed ${gone.join(', ')}.`)
  for (const r of results.filter(r => r.error !== undefined)) {
    parts.push(`Couldn't remove ${r.name}: ${r.error}.`)
  }

  return { text: parts.join(' ') || 'Nothing to remove.', isError: results.some(r => r.error !== undefined) }
}

/** The first line a failed command wrote, for the pane: git's `fatal: ` or `error: ` left off. */
export function firstLine(stderr: string): string {
  const line = stderr.split('\n').find(l => l.trim() !== '') ?? ''

  return line.replace(/^(fatal|error): /, '').trim().replace(/\.$/, '')
}
