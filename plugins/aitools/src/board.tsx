/**
 * The Project pane: the GitHub Project board's items, each with its id, title, Status and pull request, read with one
 * GraphQL query at most every BOARD_REFRESH_MS while the pane is open or the project row shows the open count. A header links to the board and filters the
 * items to the open ones, the done ones or all; where SVG is drawn, Clawd stacks task blocks at the top left.
 */

import type { Elements, RenderChildren } from 'claude-code'

import { BLUE, DOING_TEXT, FAINT_TEXT, GREEN, RED, YELLOW } from './palette'
import { TOWER_HEIGHT, TOWER_WIDTH, towerAlt, towerSvg } from './tower'
import { age } from './worktrees'
import type { BoardData, BoardFilter, BoardItem, BoardState, TowerMode } from '../types'

export const PROJECT_PANE = 'project'

/** How often the open pane reads the board, and how long a read stays fresh across closing and reopening it. */
export const BOARD_REFRESH_MS = 5 * 60_000

/** How many items a read keeps: GitHub's most for one page. */
export const BOARD_PAGE = 100

/** The Status names that mean done, as the board filter and isDone both read them. */
export const DONE_STATUSES = ['Done', 'Closed', 'Complete', 'Completed', 'Finished', 'Shipped', 'Merged'] as const

/** How far back a read looks for done items: the most recently changed are the ones worth listing. */
export const DONE_WINDOW_DAYS = 30

const ITEM_FIELDS =
  'type updatedAt status:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} ' +
  'content{... on DraftIssue{title} ... on Issue{number title url state repository{nameWithOwner} ' +
  'closedByPullRequestsReferences(first:3,includeClosedPrs:true){nodes{number url state}}} ' +
  '... on PullRequest{number title url state repository{nameWithOwner}}}'

/**
 * The board in one query: its item count, its Status columns in order, up to BOARD_PAGE items not in a done column,
 * and up to BOARD_PAGE done ones changed in the last DONE_WINDOW_DAYS days. GitHub sorts items only by their position
 * on the board, so the query picks them by filter and the read sorts them (sortItems). `repositoryOwner` takes a
 * user's login or an organization's, so either kind of board is one query.
 */
export const BOARD_QUERY =
  'query($login:String!,$number:Int!){repositoryOwner(login:$login){... on ProjectV2Owner{projectV2(number:$number){' +
  'title url all:items(first:0){totalCount} ' +
  'field(name:"Status"){... on ProjectV2SingleSelectField{options{name}}} ' +
  `open:items(first:${BOARD_PAGE},query:"-status:${DONE_STATUSES.join(',')}"){totalCount nodes{${ITEM_FIELDS}}} ` +
  `done:items(first:${BOARD_PAGE},query:"status:${DONE_STATUSES.join(',')} updated:>@today-${DONE_WINDOW_DAYS}d"){nodes{${ITEM_FIELDS}}}` +
  '}}}}'

/** A Project board's owner and number from its URL: `https://github.com/users/<login>/projects/<n>`, or `/orgs/`. */
export function parseBoardUrl(url: string): { login: string; number: number } | null {
  const match = /^https?:\/\/github\.com\/(?:users|orgs)\/([^/\s]+)\/projects\/(\d+)(?:[/?#]|$)/.exec(url.trim())

  return match?.[1] && match[2] ? { login: match[1], number: Number(match[2]) } : null
}

type Pr = { number: number; url: string; state: string }

/** The pull request an issue links to, of those that close it: an open one first, then a merged one, newest first. */
export function pickPr(prs: readonly Pr[]): { number: number; url: string } | null {
  const rank = (pr: Pr) => (pr.state === 'OPEN' ? 0 : pr.state === 'MERGED' ? 1 : 2)
  const best = [...prs].sort((a, b) => rank(a) - rank(b) || b.number - a.number)[0]

  return best ? { number: best.number, url: best.url } : null
}

const STATES: ReadonlySet<string> = new Set(['OPEN', 'CLOSED', 'MERGED'])

/** One item from the query's answer; null for one it cannot show (content the person may not read). */
function toItem(node: unknown): BoardItem | null {
  const n = (node ?? {}) as { type?: unknown; updatedAt?: unknown; status?: { name?: unknown } | null; content?: Record<string, unknown> | null }
  const content = n.content ?? {}
  const title = typeof content.title === 'string' ? content.title : null
  if (title === null) {
    return null
  }
  const status = typeof n.status?.name === 'string' ? n.status.name : null
  const updated = typeof n.updatedAt === 'string' ? Date.parse(n.updatedAt) : Number.NaN
  const updatedAt = Number.isFinite(updated) ? updated : null
  if (n.type === 'DRAFT_ISSUE') {
    return { kind: 'draft', number: null, repo: null, title, url: null, state: null, status, pr: null, updatedAt }
  }
  const number = typeof content.number === 'number' ? content.number : null
  const url = typeof content.url === 'string' ? content.url : null
  if (number === null || url === null) {
    return null
  }
  const repo = (content.repository as { nameWithOwner?: unknown } | undefined)?.nameWithOwner
  const state = typeof content.state === 'string' && STATES.has(content.state) ? (content.state as BoardItem['state']) : null
  const isPr = n.type === 'PULL_REQUEST'
  const closing = (content.closedByPullRequestsReferences as { nodes?: unknown } | undefined)?.nodes
  const prs = Array.isArray(closing)
    ? closing.filter((p): p is Pr => typeof p?.number === 'number' && typeof p?.url === 'string' && typeof p?.state === 'string')
    : []

  return {
    kind: isPr ? 'pr' : 'issue',
    number,
    repo: typeof repo === 'string' ? repo : null,
    title,
    url,
    state,
    status,
    pr: isPr ? { number, url } : pickPr(prs),
    updatedAt,
  }
}

/**
 * The items as the pane lists them: open ones before done ones, each by its Status column in the board's order
 * (`columns`; one with no Status, or a column the board no longer has, after them), the most recently changed first.
 */
export function sortItems(items: readonly BoardItem[], columns: readonly string[]): BoardItem[] {
  const column = (item: BoardItem) => {
    const at = item.status === null ? -1 : columns.indexOf(item.status)
    return at < 0 ? columns.length : at
  }

  return [...items].sort(
    (a, b) => Number(isDone(a)) - Number(isDone(b)) || column(a) - column(b) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  )
}

/** The query's answer as the pane shows it, or why it holds no board. */
export function parseBoardItems(json: string): { data: BoardData } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { error: "GitHub's answer wasn't JSON" }
  }
  type Items = { totalCount?: unknown; nodes?: unknown } | null | undefined
  const answer = raw as { data?: { repositoryOwner?: { projectV2?: unknown } | null }; errors?: { message?: unknown }[] }
  const project = answer.data?.repositoryOwner?.projectV2 as
    | { title?: unknown; url?: unknown; all?: Items; open?: Items; done?: Items; field?: { options?: unknown } | null }
    | null
    | undefined
  if (!project) {
    const message = answer.errors?.find(e => typeof e.message === 'string')?.message
    return { error: typeof message === 'string' ? message : 'GitHub found no such Project board' }
  }
  const read = (list: Items) => (Array.isArray(list?.nodes) ? list.nodes : []).map(toItem).filter((item): item is BoardItem => item !== null)
  const open = read(project.open)
  const done = read(project.done)
  const options = Array.isArray(project.field?.options) ? project.field.options : []
  const columns = options.map(o => (o as { name?: unknown })?.name).filter((name): name is string => typeof name === 'string')
  const items = sortItems([...open, ...done], columns).slice(0, BOARD_PAGE)
  // The open filter also brings items with no Status whose issue is closed: they count as done.
  const openCount = typeof project.open?.totalCount === 'number' ? project.open.totalCount - open.filter(isDone).length : undefined

  return {
    data: {
      title: typeof project.title === 'string' ? project.title : 'Project',
      url: typeof project.url === 'string' ? project.url : '',
      total: typeof project.all?.totalCount === 'number' ? project.all.totalCount : items.length,
      open: openCount,
      items,
    },
  }
}

const DONE_STATUS = new RegExp(`^(${DONE_STATUSES.join('|')})$`, 'i')

/** Whether an item counts as done: its Status says so, or with no Status, its issue or pull request is closed. */
export function isDone(item: BoardItem): boolean {
  if (item.status !== null) {
    return DONE_STATUS.test(item.status.trim())
  }

  return item.state === 'CLOSED' || item.state === 'MERGED'
}

export function filterItems(items: readonly BoardItem[], filter: BoardFilter): BoardItem[] {
  return filter === 'all' ? [...items] : items.filter(item => isDone(item) === (filter === 'done'))
}

export function filterCounts(items: readonly BoardItem[]): Record<BoardFilter, number> {
  const done = items.filter(isDone).length

  return { open: items.length - done, done, all: items.length }
}

/** An item's id: `#12` in the session's repository, `name#12` in another, `draft` for a draft. */
export function itemId(item: BoardItem, repo: string | null): string {
  if (item.number === null) {
    return 'draft'
  }
  if (item.repo === null || repo === null || item.repo.toLowerCase() === repo.toLowerCase()) {
    return `#${item.number}`
  }

  return `${item.repo.split('/').pop()}#${item.number}`
}

/** A Status's dot and color, read from its name: filled for one under way or finished, hollow for one not started. */
export function statusMark(status: string | null): { dot: string; color: string } {
  const s = status?.trim().toLowerCase() ?? ''
  if (s === '') return { dot: '○', color: FAINT_TEXT }
  if (DONE_STATUS.test(s)) return { dot: '●', color: GREEN }
  if (/block/.test(s)) return { dot: '●', color: RED }
  if (/review/.test(s)) return { dot: '●', color: BLUE }
  if (/progress|doing|active|working|started/.test(s)) return { dot: '●', color: YELLOW }
  if (/todo|to do|backlog|ready|new|triage|planned|later/.test(s)) return { dot: '○', color: FAINT_TEXT }

  return { dot: '●', color: DOING_TEXT }
}

/** The status column's text: its dot and name, a long name cut to fit STATUS_MAX cells. */
export function statusText(status: string | null): string {
  const chars = Array.from(`${statusMark(status).dot} ${status?.trim() || '–'}`)

  return chars.length > STATUS_MAX ? `${chars.slice(0, STATUS_MAX - 1).join('')}…` : chars.join('')
}

/** Clawd's mood: puzzled with no board to show, asleep with nothing open, else stacking. */
export function towerMode(board: BoardState): TowerMode {
  if (board.status === 'none' || board.status === 'error') return 'puzzled'
  if (board.status === 'loading') return 'building'

  return filterCounts(board.data.items).open === 0 ? 'resting' : 'building'
}

/** The header's faint note: how many items (and how many a read fetched, when fewer), and how long since the read. */
export function metaText(data: BoardData, at: number, now: number): string {
  const count =
    data.total > data.items.length ? `${data.items.length} of ${data.total} items` : `${data.total} ${data.total === 1 ? 'item' : 'items'}`
  const ago = age(now - at)

  return `${count} · updated ${ago === 'now' ? 'just now' : `${ago} ago`}`
}

const FILTERS: readonly { filter: BoardFilter; label: string; empty: string }[] = [
  { filter: 'open', label: 'Open', empty: 'Nothing open on the board.' },
  { filter: 'done', label: 'Done', empty: 'Nothing done yet.' },
  { filter: 'all', label: 'All', empty: 'The board is empty.' },
]

/** The PR column's width in cells: room for `PR #1234`. */
export const PR_WIDTH = 9
/** The most cells the status column's text takes; a longer Status is cut. */
export const STATUS_MAX = 16

/** `Svg` only where the surface draws it (the desktop): Clawd shows there alone. */
type El = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & { Svg?: Elements['desktop']['Svg'] }

/** Quiet buttons, as the bar's own: dim text and no outline at rest, full strength under the pointer. */
const QUIET = { plain: true, dimColor: true } as const

export type BoardView = {
  board: BoardState
  filter: BoardFilter
  isReading: boolean
  /** The session's repository as `owner/name`: its own items' ids leave the name off. */
  repo: string | null
  now: number
}

type BoardActions = { open(url: string): void; setFilter(filter: BoardFilter): void; refresh(): void }

/**
 * The pane: the board's name, Open in GitHub and a faint note on one line, the filters and Refresh on the next, Clawd
 * to their left; then a line per item in fixed-width columns.
 */
export function renderBoard(el: El, view: BoardView, on: BoardActions) {
  const { Box, Text, Button, Svg } = el
  const { board } = view
  const ready = board.status === 'ready' ? board : null

  let header: RenderChildren
  if (board.status === 'none') {
    header = <Text key="none" color={FAINT_TEXT}>This repository has no GitHub Project board. Set project.board in .claude/aitools.json.</Text>
  } else if (board.status === 'loading') {
    header = <Text key="loading" color={FAINT_TEXT}>Reading the board…</Text>
  } else if (board.status === 'error') {
    header = (
      <Box key="error" flexDirection="column">
        <Text color={FAINT_TEXT}>{`Couldn't read the board: ${board.text}`}</Text>
        <Box marginTop={1}>{refreshButton(el, view, on)}</Box>
      </Box>
    )
  } else {
    const counts = filterCounts(board.data.items)
    const url = board.data.url
    header = (
      <Box key="header" flexDirection="column">
        <Box flexDirection="row" columnGap={2} flexWrap="wrap">
          <Text key="title" color={DOING_TEXT}>{board.data.title}</Text>
          {url && <Button key="open" label="Open in GitHub" {...QUIET} onPress={() => on.open(url)} />}
          <Text key="meta" color={FAINT_TEXT}>{metaText(board.data, board.at, view.now)}</Text>
        </Box>
        <Box flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
          {FILTERS.map(f => (
            <Button
              key={`filter-${f.filter}`}
              label={`${view.filter === f.filter ? '●' : '○'} ${f.label} ${counts[f.filter]}`}
              {...QUIET}
              onPress={() => on.setFilter(f.filter)}
            />
          ))}
          {refreshButton(el, view, on)}
        </Box>
        {board.error && <Text key="stale" color={FAINT_TEXT}>{`Couldn't read the board again: ${board.error}`}</Text>}
      </Box>
    )
  }

  const items = ready ? filterItems(ready.data.items, view.filter) : []
  const mode = towerMode(board)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {Svg && (
          <Box key="tower" flexShrink={0} marginRight={2}>
            <Svg source={towerSvg(mode)} alt={towerAlt(mode)} width={TOWER_WIDTH} height={TOWER_HEIGHT} />
          </Box>
        )}
        <Box flexDirection="column" flexShrink={1}>
          {header}
        </Box>
      </Box>
      {ready && (
        <Box flexDirection="column" marginTop={1}>
          {items.length === 0 ? (
            <Text key="empty" color={FAINT_TEXT}>{FILTERS.find(f => f.filter === view.filter)?.empty}</Text>
          ) : (
            renderRows(el, items, view, on)
          )}
        </Box>
      )}
    </Box>
  )
}

/** Refresh, or what it is doing while a read runs. */
function refreshButton(el: El, view: BoardView, on: BoardActions) {
  const { Text, Button } = el

  return view.isReading ? (
    <Text key="refresh" color={FAINT_TEXT}>Refreshing…</Text>
  ) : (
    <Button key="refresh" label="Refresh" {...QUIET} onPress={() => on.refresh()} />
  )
}

/**
 * One line per item: its id (opening it) and title on the left, its status and pull request on the right. The id and
 * status columns are as wide as their widest entry, so every line lines up.
 */
function renderRows(el: El, items: readonly BoardItem[], view: BoardView, on: BoardActions) {
  const { Box, Text, Button } = el
  const ids = items.map(item => itemId(item, view.repo))
  const idWidth = Math.max(...ids.map(id => Array.from(id).length)) + 1
  const statusWidth = Math.max(...items.map(item => Array.from(statusText(item.status)).length)) + 1
  const cell = (key: string, width: number, child: RenderChildren) => (
    <Box key={key} width={width} flexShrink={0} flexDirection="row">
      {child}
    </Box>
  )

  return items.map((item, i) => {
    const id = ids[i] ?? ''
    const { url, pr } = item

    return (
      <Box key={`item-${url ?? `draft-${i}`}`} flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" flexShrink={1} minWidth={0} overflow="hidden">
          {cell('id', idWidth, url === null ? <Text color={FAINT_TEXT}>{id}</Text> : <Button key={`id-${i}`} label={id} {...QUIET} onPress={() => on.open(url)} />)}
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text color={isDone(item) ? FAINT_TEXT : DOING_TEXT} wrap="truncate-end">
              {item.title}
            </Text>
          </Box>
        </Box>
        <Box flexDirection="row" flexShrink={0} marginLeft={2}>
          {cell('status', statusWidth, <Text color={statusMark(item.status).color}>{statusText(item.status)}</Text>)}
          {cell('pr', PR_WIDTH, pr === null ? null : <Button key={`pr-${i}`} label={`PR #${pr.number}`} {...QUIET} onPress={() => on.open(pr.url)} />)}
        </Box>
      </Box>
    )
  })
}
