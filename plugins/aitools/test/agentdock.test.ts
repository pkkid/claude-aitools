import { describe, expect, test } from 'claude-code/testing'

import {
  addCard,
  commandLine,
  noticeEnd,
  parseTaskNotices,
  runningCount,
  tasksLabel,
  FINISHED_KEEP,
  finishCard,
  headerText,
  isRunning,
  activityText,
  hideAfterLabel,
  visibleCards,
  newRun,
  noteActivity,
  orderedCards,
  reportProgress,
  workflowName,
} from '../src/agentdock'
import { elapsed } from '../src/format'

describe('agent runs', () => {
  test('a started subagent gets a running line, once', () => {
    const run = addCard(addCard(newRun(0), 'a1', 'Draft', 5), 'a1', 'Draft', 6)
    expect(run.cards).toEqual([{ id: 'a1', task: 'Draft', kind: 'subagent', status: 'running', startedAt: 5 }])
    expect(isRunning(run)).toBe(true)
  })

  test('progress is rounded and held to 0 to 100; an empty doing keeps the last one', () => {
    let run = addCard(newRun(0), 'a1', 'Draft', 0)
    run = reportProgress(run, 'a1', 'Reading notes', 42.4)
    run = reportProgress(run, 'a1', '  ', 140)
    expect(run.cards[0]).toMatchObject({ doing: 'Reading notes', percent: 100 })
  })

  test('a finished subagent is done when it answered, failed otherwise', () => {
    let run = addCard(addCard(newRun(0), 'a1', 'Draft', 0), 'a2', 'Check', 0)
    run = finishCard(run, 'a1', 'done', 9)
    run = finishCard(run, 'a2', 'failed', 9)
    expect(run.cards.map(c => [c.status, c.endedAt])).toEqual([
      ['done', 9],
      ['failed', 9],
    ])
    expect(isRunning(run)).toBe(false)
  })
})

describe('dock text', () => {
  test('the header shows only the counts that are not zero', () => {
    expect(headerText(null)).toBe('')
    let run = addCard(addCard(addCard(newRun(0), 'a1', 'A', 0), 'a2', 'B', 0), 'a3', 'C', 0)
    run = finishCard(finishCard(run, 'a2', 'done', 1), 'a3', 'failed', 1)
    expect(headerText(run)).toBe('1 running · 1 done · 1 failed')
  })

  test('elapsed reads as minutes and seconds, hours once past one', () => {
    expect(elapsed(65_000)).toBe('1:05')
    expect(elapsed(3_725_000)).toBe('1:02:05')
    expect(elapsed(-5)).toBe('0:00')
  })
})

describe('every subagent', () => {
  test('a tool call reads as a few words on what the subagent is doing', () => {
    expect(activityText('Read', { file_path: '/repo/src/bar.tsx' })).toBe('Reading bar.tsx')
    expect(activityText('Edit', { file_path: '/repo/README.md' })).toBe('Editing README.md')
    expect(activityText('Bash', { command: 'npm   test' })).toBe('Running npm test')
    expect(activityText('Bash', { command: 'x'.repeat(60) })).toBe(`Running ${'x'.repeat(39)}…`)
    expect(activityText('Grep', { pattern: 'TODO' })).toBe('Searching for TODO')
    expect(activityText('WebFetch', { url: 'https://example.com/a' })).toBe('Fetching example.com/a')
    expect(activityText('mcp__github__create_issue', {})).toBe('Using create_issue')
  })

  test("a workflow's name comes from the tool's name, else its script's meta", () => {
    expect(workflowName({ name: 'nightly' })).toBe('nightly')
    expect(workflowName({ script: "export const meta = {\n  name: 'review-changes',\n}" })).toBe('review-changes')
    expect(workflowName({})).toBe('workflow')
  })

  test("activity shows on its own subagent's line", () => {
    let run = addCard(addCard(newRun(0), 's1', 'Survey', 0), 's2', 'Check', 0, 'workflow')
    run = noteActivity(run, 's2', 'Reading b')
    expect(run.cards.map(c => c.doing)).toEqual([undefined, 'Reading b'])
  })

  test('running lines come first, oldest on top; finished ones follow, the latest first', () => {
    let run = addCard(addCard(addCard(newRun(0), 'a', 'A', 1, 'subagent'), 'b', 'B', 2, 'subagent'), 'c', 'C', 3, 'subagent')
    run = finishCard(finishCard(run, 'b', 'done', 9), 'a', 'failed', 5)
    expect(orderedCards(run).map(c => c.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('finished lines', () => {
  test('stay for the session, the newest FINISHED_KEEP of them', () => {
    let run = newRun(0)
    for (let i = 0; i <= FINISHED_KEEP; i++) {
      run = finishCard(addCard(run, `a${i}`, `Task ${i}`, i, 'subagent'), `a${i}`, 'done', i + 1)
    }
    run = addCard(run, 'live', 'Still going', 99, 'subagent')
    expect(run.cards.filter(c => c.status === 'done')).toHaveLength(FINISHED_KEEP)
    expect(run.cards.some(c => c.id === 'a0')).toBe(false)
    expect(run.cards.some(c => c.id === 'live')).toBe(true)
  })
})

describe('Showing and Hide after', () => {
  const run = finishCard(
    addCard(addCard(addCard(newRun(0), 'old', 'Old', 1_000, 'subagent'), 'wf', 'flow · agent 1', 5_000, 'workflow'), 'new', 'New', 9_000, 'subagent'),
    'old',
    'done',
    2_000,
  )
  const ids = (view: Parameters<typeof visibleCards>[1]) => visibleCards(run.cards, view).map(c => c.id)
  const base = { showing: 'all' as const, hideAfter: 15 as const, now: 60_000 }

  test('All shows every line; each kind shows only its own', () => {
    expect(ids(base)).toEqual(['old', 'wf', 'new'])
    expect(ids({ ...base, showing: 'subagent' })).toEqual(['old', 'new'])
    expect(ids({ ...base, showing: 'workflow' })).toEqual(['wf'])
    expect(ids({ ...base, showing: 'command' })).toEqual([])
  })

  test("a finished line goes once Hide after's time is up; Immediate hides it at once", () => {
    expect(ids({ ...base, hideAfter: 5, now: 301_000 })).toEqual(['old', 'wf', 'new'])
    expect(ids({ ...base, hideAfter: 5, now: 302_000 })).toEqual(['wf', 'new'])
    expect(ids({ ...base, hideAfter: 0, now: 2_000 })).toEqual(['wf', 'new'])
    expect(ids({ ...base, hideAfter: 'never', now: 99 * 60 * 60_000 })).toEqual(['old', 'wf', 'new'])
  })

  test('the picks read Never, then minutes, then Immediate', () => {
    expect((['never', 60, 15, 5, 0] as const).map(hideAfterLabel)).toEqual(['Never', '1h', '15m', '5m', 'Immediate'])
  })
})

describe('background commands and monitors', () => {
  test("a command's line is its description, else its command; the command is its note", () => {
    expect(commandLine({ command: 'npm   run dev', description: 'Start the dev server' })).toEqual({
      task: 'Start the dev server',
      doing: 'npm run dev',
    })
    expect(commandLine({ command: 'npm run dev' })).toEqual({ task: 'npm run dev', doing: 'npm run dev' })
  })

  test('task notices give each task id with its status or event', () => {
    const text =
      '<task-notification>\n<task-id>b7yjorn2h</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n' +
      '<status>completed</status>\n<summary>Background command "Watch CI" completed (exit code 0)</summary>\n' +
      '</task-notification>\n<task-notification>\n<task-id>bpj8hhdqa</task-id>\n' +
      '<summary>Monitor event: "phone on adb"</summary>\n<event>[Monitor expired after 20m with no events delivered.]</event>\n' +
      '</task-notification>'
    expect(parseTaskNotices(text)).toEqual([
      { id: 'b7yjorn2h', status: 'completed', event: undefined },
      { id: 'bpj8hhdqa', status: undefined, event: '[Monitor expired after 20m with no events delivered.]' },
    ])
    expect(parseTaskNotices('no notices here')).toEqual([])
  })

  test("a notice ends its task by its status, or a monitor's closing event; an ordinary event ends nothing", () => {
    expect(noticeEnd({ id: 'a', status: 'completed' })).toBe('done')
    expect(noticeEnd({ id: 'a', status: 'failed' })).toBe('failed')
    expect(noticeEnd({ id: 'a', status: 'killed' })).toBe('stopped')
    expect(noticeEnd({ id: 'a', status: 'stopped' })).toBe('stopped')
    expect(noticeEnd({ id: 'a', event: '[Monitor expired after 30m with 2 events delivered.]' })).toBe('done')
    expect(noticeEnd({ id: 'a', event: 'PR 291 checks passed' })).toBeNull()
  })

  test('a finished line keeps how it ended; the header counts stopped ones', () => {
    let run = addCard(newRun(0), 'c1', 'Dev server', 0, 'command', { doing: 'npm run dev' })
    expect(runningCount(run)).toBe(1)
    run = finishCard(run, 'c1', 'stopped', 5)
    run = finishCard(run, 'c1', 'done', 9)
    expect(run.cards[0]).toMatchObject({ status: 'stopped', endedAt: 5, doing: 'npm run dev' })
    expect(runningCount(run)).toBe(0)
    expect(headerText(run)).toBe('1 stopped')
  })

  test("the project row's button counts the running tasks", () => {
    expect(tasksLabel(1)).toBe('1 task')
    expect(tasksLabel(5)).toBe('5 tasks')
  })
})
