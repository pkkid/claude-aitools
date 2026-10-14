import { describe, expect, test } from 'claude-code/testing'

import { BOARD_QUERY, filterCounts, filterItems, isDone, itemId, metaText, parseBoardItems, parseBoardUrl, pickPr, sortItems, statusMark, statusText, towerMode } from '../src/board'
import { TOWER_HEIGHT, TOWER_WIDTH, towerAlt, towerSvg } from '../src/tower'
import type { BoardItem } from '../types'
import { RED, YELLOW } from '../src/palette'

const item = (over: Partial<BoardItem> = {}): BoardItem => ({
  kind: 'issue',
  number: 1,
  repo: 'pkkid/vowelit',
  title: 'A task',
  url: 'https://github.com/pkkid/vowelit/issues/1',
  state: 'OPEN',
  status: 'Todo',
  pr: null,
  updatedAt: null,
  ...over,
})

describe('board: reading GitHub', () => {
  test("a board's owner and number, from a user's or an organization's URL; anything else is none", () => {
    expect(parseBoardUrl('https://github.com/users/pkkid/projects/3')).toEqual({ login: 'pkkid', number: 3 })
    expect(parseBoardUrl('https://github.com/orgs/acme/projects/12/views/2')).toEqual({ login: 'acme', number: 12 })
    expect(parseBoardUrl('https://github.com/pkkid/vowelit/projects/1')).toBeNull()
    expect(parseBoardUrl('https://example.com/users/x/projects/1')).toBeNull()
  })

  test('the items: issues with their closing PR, pull requests linking to themselves, drafts, and unreadable ones left out', () => {
    const answer = {
      data: {
        repositoryOwner: {
          projectV2: {
            title: 'Dalica',
            url: 'https://github.com/users/pkkid/projects/3',
            all: { totalCount: 140 },
            field: { options: [{ name: 'Todo' }, { name: 'In Review' }, { name: 'Done' }] },
            open: {
              totalCount: 30,
              nodes: [
                { type: 'ISSUE', updatedAt: '2026-10-09T10:00:00Z', status: { name: 'In Review' }, content: { number: 7, title: 'Login', url: 'u7', state: 'OPEN', repository: { nameWithOwner: 'pkkid/dalica' }, closedByPullRequestsReferences: { nodes: [{ number: 8, url: 'p8', state: 'CLOSED' }, { number: 9, url: 'p9', state: 'MERGED' }] } } },
                { type: 'PULL_REQUEST', updatedAt: '2026-10-08T10:00:00Z', status: null, content: { number: 11, title: 'Fix', url: 'p11', state: 'MERGED', repository: { nameWithOwner: 'pkkid/dalica' } } },
                { type: 'DRAFT_ISSUE', updatedAt: '2026-10-01T10:00:00Z', status: { name: 'Todo' }, content: { title: 'Someday' } },
                { type: 'REDACTED', status: null, content: null },
              ],
            },
            done: {
              nodes: [
                { type: 'DRAFT_ISSUE', updatedAt: '2026-10-10T10:00:00Z', status: { name: 'Done' }, content: { title: 'Shipped it' } },
              ],
            },
          },
        },
      },
    }
    const parsed = parseBoardItems(JSON.stringify(answer))
    if (!('data' in parsed)) throw new Error(parsed.error)
    expect(parsed.data.title).toBe('Dalica')
    expect(parsed.data.total).toBe(140)
    // The merged PR with no Status came in with the open ones, but counts as done.
    expect(parsed.data.open).toBe(29)
    const at = (iso: string) => Date.parse(iso)
    expect(parsed.data.items).toEqual([
      { kind: 'draft', number: null, repo: null, title: 'Someday', url: null, state: null, status: 'Todo', pr: null, updatedAt: at('2026-10-01T10:00:00Z') },
      { kind: 'issue', number: 7, repo: 'pkkid/dalica', title: 'Login', url: 'u7', state: 'OPEN', status: 'In Review', pr: { number: 9, url: 'p9' }, updatedAt: at('2026-10-09T10:00:00Z') },
      { kind: 'draft', number: null, repo: null, title: 'Shipped it', url: null, state: null, status: 'Done', pr: null, updatedAt: at('2026-10-10T10:00:00Z') },
      { kind: 'pr', number: 11, repo: 'pkkid/dalica', title: 'Fix', url: 'p11', state: 'MERGED', status: null, pr: { number: 11, url: 'p11' }, updatedAt: at('2026-10-08T10:00:00Z') },
    ])
  })

  test('the query picks open items, and done ones changed in the last 30 days, as GitHub cannot sort them', () => {
    expect(BOARD_QUERY).toContain('open:items(first:100,query:"-status:Done,Closed,Complete,Completed,Finished,Shipped,Merged")')
    expect(BOARD_QUERY).toContain('done:items(first:100,query:"status:Done,Closed,Complete,Completed,Finished,Shipped,Merged updated:>@today-30d")')
    expect(BOARD_QUERY).not.toContain('orderBy')
  })

  test('items sort open before done, then by Status column in board order, then the most recently changed first', () => {
    const columns = ['Todo', 'In Progress', 'Done']
    const items = [
      item({ title: 'old todo', status: 'Todo', updatedAt: 1 }),
      item({ title: 'done', status: 'Done', updatedAt: 9 }),
      item({ title: 'no status', status: null, updatedAt: 8 }),
      item({ title: 'doing', status: 'In Progress', updatedAt: 2 }),
      item({ title: 'new todo', status: 'Todo', updatedAt: 5 }),
    ]
    expect(sortItems(items, columns).map(i => i.title)).toEqual(['new todo', 'old todo', 'doing', 'no status', 'done'])
  })

  test("GitHub's errors and a missing board say why", () => {
    expect(parseBoardItems(JSON.stringify({ data: { repositoryOwner: null }, errors: [{ message: 'Your token has not been granted the required scopes' }] }))).toEqual({
      error: 'Your token has not been granted the required scopes',
    })
    expect(parseBoardItems(JSON.stringify({ data: { repositoryOwner: { projectV2: null } } }))).toEqual({ error: 'GitHub found no such Project board' })
    expect(parseBoardItems('oops')).toEqual({ error: "GitHub's answer wasn't JSON" })
  })

  test('the PR an issue links to: an open one first, then merged, then the newest', () => {
    expect(pickPr([])).toBeNull()
    expect(pickPr([{ number: 5, url: 'a', state: 'MERGED' }, { number: 3, url: 'b', state: 'OPEN' }])).toEqual({ number: 3, url: 'b' })
    expect(pickPr([{ number: 5, url: 'a', state: 'CLOSED' }, { number: 4, url: 'b', state: 'MERGED' }])).toEqual({ number: 4, url: 'b' })
    expect(pickPr([{ number: 5, url: 'a', state: 'CLOSED' }, { number: 6, url: 'b', state: 'CLOSED' }])).toEqual({ number: 6, url: 'b' })
  })
})

describe('board: the pane', () => {
  test('done by its Status, or with none by its state; the filters and their counts', () => {
    const items = [item({ status: 'Done' }), item({ status: 'In Progress', state: 'CLOSED' }), item({ status: null, state: 'MERGED' }), item({ status: null })]
    expect(items.map(isDone)).toEqual([true, false, true, false])
    expect(filterCounts(items)).toEqual({ open: 2, done: 2, all: 4 })
    expect(filterItems(items, 'open')).toEqual([items[1], items[3]])
    expect(filterItems(items, 'all')).toHaveLength(4)
  })

  test("ids: the session's repository's plain, another's with its name, drafts as draft", () => {
    expect(itemId(item({ number: 12 }), 'pkkid/vowelit')).toBe('#12')
    expect(itemId(item({ number: 12 }), 'PKKID/Vowelit')).toBe('#12')
    expect(itemId(item({ number: 4, repo: 'pkkid/dalica' }), 'pkkid/vowelit')).toBe('dalica#4')
    expect(itemId(item({ kind: 'draft', number: null, repo: null, url: null }), 'pkkid/vowelit')).toBe('draft')
  })

  test('status marks by name, long names cut', () => {
    expect(statusMark('Todo').dot).toBe('○')
    expect(statusMark('In Progress').color).toBe(YELLOW)
    expect(statusMark('Blocked').color).toBe(RED)
    expect(statusMark('Done').dot).toBe('●')
    expect(statusText(null)).toBe('○ -')
    expect(statusText('Waiting on design review')).toBe('● Waiting on de…')
  })

  test('the header note: count and age, and how many were fetched of more', () => {
    const data = { title: 'B', url: '', total: 3, items: [item(), item(), item()] }
    expect(metaText(data, 0, 30_000)).toBe('3 items · updated just now')
    expect(metaText({ ...data, total: 140 }, 0, 3 * 60_000)).toBe('3 of 140 items · updated 3m ago')
  })

  test('Clawd stacks while anything is open, sleeps with nothing open, and is puzzled with no board', () => {
    const ready = (items: BoardItem[]) => ({ status: 'ready' as const, source: 'u', at: 0, data: { title: 'B', url: '', total: items.length, items } })
    expect(towerMode({ status: 'loading' })).toBe('building')
    expect(towerMode(ready([item()]))).toBe('building')
    expect(towerMode(ready([item({ status: 'Done' })]))).toBe('resting')
    expect(towerMode({ status: 'none' })).toBe('puzzled')
    expect(towerMode({ status: 'error', text: 'x' })).toBe('puzzled')
  })
})

describe('tower', () => {
  test('each mode draws once, at the pruner size, and says what it shows', () => {
    for (const mode of ['building', 'resting', 'puzzled'] as const) {
      const svg = towerSvg(mode)
      expect(svg).toContain(`width="${TOWER_WIDTH}" height="${TOWER_HEIGHT}"`)
      expect(towerSvg(mode)).toBe(svg)
      expect(towerAlt(mode)).toContain('Clawd')
    }
  })

  test('resting is all grey: no orange Clawd, no colored blocks', () => {
    const svg = towerSvg('resting')
    expect(svg).not.toContain('#D77757')
    expect(svg).not.toContain('#7FB685')
  })
})
