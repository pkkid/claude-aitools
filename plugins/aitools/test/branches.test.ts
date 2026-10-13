import { describe, expect, test } from 'claude-code/testing'

import {
  age,
  checkoutText,
  cleanText,
  combineChecks,
  deleteText,
  headerText,
  isCleanable,
  isDeletable,
  joinBranches,
  noteParts,
  onText,
  parsePrs,
  parseRefs,
  parseRuns,
  parseShortstat,
  parseWorktreeList,
  partsText,
  prunerMode,
  refFormat,
  removedText,
  sortBranches,
  visibleBranches,
} from '../src/branches'
import type { LocalRef, RemoteRef, RepoFacts, WorktreeEntry } from '../src/branches'
import { PRUNER_HEIGHT, PRUNER_WIDTH, prunerAlt, prunerSvg } from '../src/pruner'
import type { Branch } from '../types'

const LIST = `worktree /repo
HEAD aaa
branch refs/heads/main

worktree /repo/.claude/worktrees/feat
HEAD bbb
branch refs/heads/feat/x

worktree /repo/.claude/worktrees/old
HEAD ccc
detached
locked in use
prunable gitdir file points to non-existent location
`

const local = (name: string, over: Partial<LocalRef> = {}): LocalRef => ({
  name,
  sha: `sha-${name}`,
  committedAt: 1_000,
  aheadOfBase: 0,
  upstream: { remote: 'origin', branch: name },
  unpushed: 0,
  ...over,
})
const remote = (branch: string, over: Partial<RemoteRef> = {}): RemoteRef => ({
  remote: 'origin',
  branch,
  sha: `sha-${branch}`,
  committedAt: 1_000,
  aheadOfBase: 0,
  ...over,
})
const entry = (path: string, branch: string | null, head = 'h'): WorktreeEntry => ({ path, head, branch, isLocked: false, isMissing: false })

/** A repository: main checked out in /repo, and whatever the test adds. */
function facts(over: Partial<RepoFacts> = {}): RepoFacts {
  return {
    base: 'origin/main',
    remote: 'origin',
    entries: [entry('/repo', 'main', 'sha-main')],
    current: '/repo',
    locals: new Map([['main', local('main')]]),
    remotes: new Map([['origin/main', remote('main')]]),
    checkouts: new Map(),
    stats: new Map(),
    baseLine: new Set(['sha-main']),
    prs: new Map(),
    runs: new Map(),
    ...over,
  }
}

const byName = (rows: readonly Branch[], name: string) => {
  const row = rows.find(b => b.name === name)
  if (row === undefined) throw new Error(`no row ${name}`)
  return row
}

describe('branches: reading git', () => {
  test('the porcelain list: branches, a detached HEAD, locked and missing folders', () => {
    const entries = parseWorktreeList(LIST)
    expect(entries.map(e => e.path)).toEqual(['/repo', '/repo/.claude/worktrees/feat', '/repo/.claude/worktrees/old'])
    expect(entries[1]).toEqual({ path: '/repo/.claude/worktrees/feat', head: 'bbb', branch: 'feat/x', isLocked: false, isMissing: false })
    expect(entries[2]).toMatchObject({ branch: null, isLocked: true, isMissing: true })
  })

  test('refs: local branches with what they track and how far ahead; remote branches; no remote HEAD', () => {
    expect(refFormat('origin/main')).toContain('%(ahead-behind:origin/main)')
    const { locals, remotes } = parseRefs(
      [
        'refs/heads/feat/x\tx1\t1760000000\trefs/remotes/origin/feat/x\t[ahead 2, behind 1]\t3 0',
        'refs/heads/gone\tg1\t1760000000\trefs/remotes/origin/gone\t[gone]\t0 4',
        'refs/heads/solo\ts1\t\t\t\t1 0',
        'refs/remotes/origin/HEAD\tm1\t1760000000\t\t\t0 0',
        'refs/remotes/origin/feat/y\ty1\t1760000000\t\t\t0 9',
      ].join('\n'),
    )
    expect(locals.get('feat/x')).toEqual({
      name: 'feat/x',
      sha: 'x1',
      committedAt: 1760000000000,
      aheadOfBase: 3,
      upstream: { remote: 'origin', branch: 'feat/x' },
      unpushed: 2,
    })
    expect(locals.get('gone')?.upstream).toBeNull()
    expect(locals.get('solo')).toMatchObject({ committedAt: null, aheadOfBase: 1, upstream: null })
    expect([...remotes.keys()]).toEqual(['origin/feat/y'])
  })

  test('shortstat: insertions and deletions, either missing', () => {
    expect(parseShortstat(' 3 files changed, 12 insertions(+), 4 deletions(-)')).toEqual({ added: 12, removed: 4 })
    expect(parseShortstat(' 1 file changed, 1 insertion(+)')).toEqual({ added: 1, removed: 0 })
    expect(parseShortstat('')).toEqual({ added: 0, removed: 0 })
  })
})

describe('branches: GitHub', () => {
  test("a pull request's checks: any failure fails, else anything running runs", () => {
    const prs = parsePrs(
      JSON.stringify([
        { number: 4, url: 'u4', state: 'OPEN', headRefName: 'a', headRefOid: 'x', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }] },
        { number: 5, url: 'u5', state: 'MERGED', headRefName: 'b', headRefOid: 'y', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'FAILURE' }] },
        { number: 6, url: 'u6', state: 'MERGED', headRefName: 'c', headRefOid: 'z', statusCheckRollup: [] },
      ]),
    )
    expect(prs.get('a')?.[0]?.ci).toBe('running')
    expect(prs.get('b')?.[0]).toMatchObject({ number: 5, state: 'merged', ci: 'fail' })
    expect(prs.get('c')?.[0]?.ci).toBe('none')
    expect(parsePrs('not json').size).toBe(0)
  })

  test('workflow runs combine per commit', () => {
    const runs = parseRuns(
      JSON.stringify([
        { headSha: 'x', status: 'completed', conclusion: 'success' },
        { headSha: 'x', status: 'completed', conclusion: 'skipped' },
        { headSha: 'y', status: 'completed', conclusion: 'success' },
        { headSha: 'y', status: 'queued', conclusion: '' },
      ]),
    )
    expect(runs.get('x')).toBe('pass')
    expect(runs.get('y')).toBe('running')
    expect(combineChecks([])).toBe('none')
  })
})

describe('branches: one row per branch', () => {
  test('a local branch joins its remote branch and its worktree; a remote branch alone is a row of its own', () => {
    const rows = joinBranches(
      facts({
        entries: [entry('/repo', 'main', 'sha-main'), entry('/repo/wt/x', 'feat/x', 'sha-feat/x')],
        locals: new Map([['main', local('main')], ['feat/x', local('feat/x', { aheadOfBase: 2 })], ['solo', local('solo', { upstream: null, aheadOfBase: 1 })]]),
        remotes: new Map([['origin/main', remote('main')], ['origin/feat/x', remote('feat/x', { aheadOfBase: 2 })], ['origin/feat/y', remote('feat/y', { aheadOfBase: 3 })]]),
      }),
    )
    expect(rows.map(b => [b.name, onText(b), checkoutText(b)])).toEqual([
      ['main', 'both', 'main folder'],
      ['feat/x', 'both', 'worktree'],
      ['solo', 'local', '–'],
      ['feat/y', 'remote', '–'],
    ])
    expect(byName(rows, 'main').state).toBe('base')
    expect(byName(rows, 'feat/x').state).toBe('active')
    // With no remote branch, all its commits are unpushed.
    expect(byName(rows, 'solo')).toMatchObject({ state: 'active', unpushed: 1 })
  })

  test('done when its parent has all its work; empty when it never had any; changes keep it active', () => {
    const rows = joinBranches(
      facts({
        entries: [entry('/repo', 'main', 'sha-main'), entry('/repo/wt/dirty', 'feat/dirty', 'sha-feat/dirty')],
        locals: new Map([
          ['main', local('main')],
          ['feat/merged', local('feat/merged')],
          ['feat/fresh', local('feat/fresh', { sha: 'sha-main' })],
          ['feat/dirty', local('feat/dirty')],
        ]),
        checkouts: new Map([['/repo/wt/dirty', { changedFiles: 2, aheadOfBase: 0, committedAt: 5, added: 1, removed: 0 }]]),
      }),
    )
    expect(byName(rows, 'feat/merged').state).toBe('done')
    expect(byName(rows, 'feat/fresh').state).toBe('empty')
    expect(byName(rows, 'feat/dirty').state).toBe('active')
    expect(noteParts(byName(rows, 'feat/dirty'))).toEqual(['2 changed'])
  })

  test("a squash-merged branch is done while it is still at its pull request's commit", () => {
    const prs = parsePrs(
      JSON.stringify([{ number: 9, url: 'u', state: 'MERGED', headRefName: 'feat/sq', headRefOid: 'sha-feat/sq', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] }]),
    )
    const at = (sha: string) =>
      byName(joinBranches(facts({ locals: new Map([['main', local('main')], ['feat/sq', local('feat/sq', { sha, aheadOfBase: 3 })]]), prs })), 'feat/sq')
    expect(at('sha-feat/sq')).toMatchObject({ state: 'done', ci: 'pass', pr: { number: 9, state: 'merged' } })
    expect(at('sha-later').state).toBe('active')
  })

  test("a remote branch ahead of its local one keeps the row active", () => {
    const rows = joinBranches(
      facts({
        locals: new Map([['main', local('main')], ['feat/x', local('feat/x')]]),
        remotes: new Map([['origin/main', remote('main')], ['origin/feat/x', remote('feat/x', { aheadOfBase: 4 })]]),
      }),
    )
    expect(byName(rows, 'feat/x')).toMatchObject({ state: 'active', ahead: 4 })
  })

  test("a detached worktree joins the branch named for its folder, as the desktop app makes them; else it stands alone", () => {
    const rows = joinBranches(
      facts({
        entries: [entry('/repo', 'main', 'sha-main'), entry('/repo/.claude/worktrees/owl-f748', null, 'sha-main'), entry('/repo/.claude/worktrees/lone', null, 'x9')],
        locals: new Map([['main', local('main')], ['claude/owl-f748', local('claude/owl-f748', { upstream: null, sha: 'sha-main' })]]),
      }),
    )
    const owl = byName(rows, 'claude/owl-f748')
    expect([onText(owl), checkoutText(owl), owl.state]).toEqual(['local', 'worktree', 'empty'])
    expect(noteParts(owl)).toEqual(['empty', 'detached'])
    const lone = byName(rows, 'lone')
    expect([onText(lone), lone.isLocal, lone.remote]).toEqual(['–', false, null])
    expect(deleteText(lone).question).toBe('Delete lone (worktree)?')
  })
})

describe('branches: filters, order and words', () => {
  const rows = joinBranches(
    facts({
      entries: [entry('/repo', 'main', 'sha-main'), entry('/repo/wt/cur', 'feat/cur', 'sha-feat/cur')],
      current: '/repo/wt/cur',
      locals: new Map([
        ['main', local('main', { committedAt: 1 })],
        ['feat/cur', local('feat/cur', { aheadOfBase: 1, committedAt: 2 })],
        ['feat/done', local('feat/done', { committedAt: 9 })],
      ]),
      remotes: new Map([['origin/main', remote('main')], ['origin/feat/done', remote('feat/done')], ['origin/old', remote('old', { committedAt: 5 })]]),
    }),
  )

  test('Local is what this computer has; Remote what the remote has; Done leaves the finished ones', () => {
    expect(visibleBranches(rows, 'local', 'all').map(b => b.name)).toEqual(['main', 'feat/cur', 'feat/done'])
    expect(visibleBranches(rows, 'remote', 'all').map(b => b.name)).toEqual(['main', 'feat/done', 'old'])
    expect(visibleBranches(rows, 'both', 'done').map(b => b.name)).toEqual(['feat/done', 'old'])
    expect(visibleBranches(rows, 'both', 'active').map(b => b.name)).toEqual(['main', 'feat/cur'])
  })

  test('the base branch first, then the main folder, this session, then the latest commit', () => {
    expect(sortBranches(rows).map(b => b.name)).toEqual(['main', 'feat/cur', 'feat/done', 'old'])
  })

  test('the base, the main folder and this session are never deleted; done ones are cleaned', () => {
    expect(rows.map(b => [b.name, isDeletable(b), isCleanable(b)])).toEqual([
      ['main', false, false],
      ['feat/cur', false, false],
      ['feat/done', true, true],
      ['old', true, true],
    ])
  })

  test('the header, the Clean up line and its question', () => {
    expect(headerText(rows)).toBe('4 branches · 1 worktree · 2 done')
    expect(cleanText(rows, 'origin/main')).toBe('Clean up removes 2 done branches: 1 local and 2 remote branches.')
    expect(partsText(rows.filter(isCleanable))).toBe('1 local and 2 remote branches')
    expect(cleanText(rows.slice(0, 2), 'origin/main')).toBe("Nothing to clean up: every branch has work that isn't on main yet.")
  })

  test("deleting one row says what it takes and what it would lose", () => {
    const wip = byName(
      joinBranches(
        facts({
          entries: [entry('/repo', 'main', 'sha-main'), entry('/repo/wt/wip', 'feat/wip')],
          locals: new Map([['main', local('main')], ['feat/wip', local('feat/wip', { aheadOfBase: 2 })]]),
          remotes: new Map([['origin/main', remote('main')], ['origin/feat/wip', remote('feat/wip', { aheadOfBase: 2 })]]),
          checkouts: new Map([['/repo/wt/wip', { changedFiles: 3, aheadOfBase: 2, committedAt: 1, added: 0, removed: 0 }]]),
        }),
      ),
      'feat/wip',
    )
    expect(deleteText(wip)).toEqual({
      question: 'Delete feat/wip (worktree, local branch and remote branch)?',
      warning: 'This loses 3 uncommitted files and 2 commits not on the base branch.',
    })
    expect(deleteText(byName(rows, 'old'))).toEqual({ question: 'Delete old (remote branch)?', warning: '' })
  })

  test('what removing came to', () => {
    expect(
      removedText([
        { name: 'a', isWorktreeRemoved: true, isBranchDeleted: true, isRemoteDeleted: true },
        { name: 'b', isWorktreeRemoved: false, isBranchDeleted: true, isRemoteDeleted: false },
        { name: 'c', isWorktreeRemoved: false, isBranchDeleted: false, isRemoteDeleted: false, error: 'contains modified files' },
      ]),
    ).toEqual({ text: "Removed 1 worktree, 2 local branches, 1 remote branch. Couldn't remove c: contains modified files.", isError: true })
  })

  test('ages in their largest unit', () => {
    expect(age(30_000)).toBe('now')
    expect(age(5 * 60_000)).toBe('5m')
    expect(age(3 * 3_600_000)).toBe('3h')
    expect(age(12 * 86_400_000)).toBe('12d')
  })
})

describe('pruner', () => {
  test('pruning while something is done, napping with nothing to clean up, sweeping while removing', () => {
    const ready = (branches: Branch[]) => ({ status: 'ready' as const, base: 'origin/main', branches })
    const rows = joinBranches(facts({ locals: new Map([['main', local('main')], ['feat/done', local('feat/done')]]) }))
    expect(prunerMode(ready(rows), null)).toBe('pruning')
    expect(prunerMode(ready(rows.slice(0, 1)), null)).toBe('napping')
    expect(prunerMode(ready(rows.slice(0, 1)), { step: 'busy', target: { kind: 'clean' } })).toBe('sweeping')
    expect(prunerMode(null, null)).toBe('pruning')
  })

  test('napping, Clawd and the tree are all grey', () => {
    const napping = prunerSvg('napping')
    for (const color of ['#D77757', '#7FB685', '#8B5A3C']) {
      expect(napping).not.toContain(color)
      expect(prunerSvg('pruning')).toContain(color)
    }
    expect(prunerAlt('napping')).toBe('Clawd asleep under a tree')
    expect(prunerSvg('sweeping')).toContain(`width="${PRUNER_WIDTH}" height="${PRUNER_HEIGHT}"`)
  })
})
