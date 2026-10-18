import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import { SUBAGENT_NOTE } from '../src/agentdock'
import { askmeText } from '../src/askme'
import { ID_WIDTH } from '../src/board'
import { NOTE_SHRINK } from '../src/format'
import { BLUE, DOING_TEXT, FAINT_TEXT, GREEN } from '../src/palette'
import { SETTINGS_PANE } from '../src/settingspane'
import { STATUSLINE_WRITE } from '../src/statusline'

const NOW = new Date(2026, 9, 4, 12, 0).getTime()

/** The test's clock, set by `start`. */
let clock: MockClock
/** The tools the mod has offered the model, by short name, set by `start`. */
let registered: string[] = []
/** How many times the transcript scan listed a folder, set by `start`. */
let scans = 0

const PREVIOUS = {
  fiveHour: { percentUsed: 40 },
  threadUsd: 12.4,
  lastTurnUsd: 0.83,
  context: { window: 200_000, tokens: 120_000, percent: 61 },
}

function band() {
  return {
    plugin: 'aitools',
    surface: 'desktop' as const,
    component: 'AbovePrompt' as const,
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 200, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }
}

/** The handoff pane's props as a docked desktop pane receives them. */
type Mounted = {
  find(query: { key?: string; type?: string; text?: string }): Promise<{ type: string; props: Record<string, unknown>; text: string } | undefined>
  findAll(query: object): Promise<{ key: string | undefined }[]>
}

/** A choice as the pane draws it, a plain button as the bar's: `[x] 5` picked (full strength), `[ ] 20` dim. */
async function pick(view: Mounted, key: string): Promise<string> {
  const el = await view.find({ key })
  const isPicked = el?.props.plain === true && el.props.dimColor === false
  return `${isPicked ? '[x]' : '[ ]'} ${el?.text}`
}

/** The choices of one row, by key prefix, in order: picked or not. */
async function picks(view: Mounted, prefix: string): Promise<(string | undefined)[]> {
  return (await view.findAll({})).map(e => e.key).filter(k => k?.startsWith(prefix))
}

const PANE = {
  title: 'Handoff brief',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

/** The AI Tool Settings pane, docked on the desktop. */
const SETTINGS = { plugin: 'aitools', surface: 'desktop' as const, component: 'Pane' as const, requestId: SETTINGS_PANE, props: { ...PANE, title: 'AI Tool Settings' } }

/** Answers the band as core does when no plugin beneath draws it: its own drawing, by ref. */
function coreBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine' as const, ref: 0 }))
}

type Row = { role: 'user' | 'assistant'; text: string; toolUses: never[]; toolResults?: never[] }

type Step = { agentId?: string; model: string; effort?: unknown }

/** Panes as the engine keeps them: every id opened, in order, the ones open now, and whether they are on screen. */
type Panes = { opened: string[]; open: Set<string>; isPlaced: boolean }

/** Answers `$.ui.open`, `$.ui.close` and `$.ui.panes` as the engine would; panes are on screen unless `isPlaced` is off. */
function mockPanes(on: On): Panes {
  const panes: Panes = { opened: [], open: new Set(), isPlaced: true }
  on('ui.open', (_, e) => {
    panes.opened.push(e.id)
    panes.open.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_, e) => {
    panes.open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...panes.open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: panes.isPlaced })),
  }))

  return panes
}

/**
 * Starts a session whose `$.session.usage()` reports `cost.usd` as `costs.usd` and whose history is `messages`;
 * `steps` collects each model request's agent, model and effort as the bottom sends it. Returns its panes.
 */
async function start(
  $: Engine,
  on: On,
  costs: { usd: number },
  stored: Record<string, unknown> = {},
  messages: Row[] = [],
  steps: Step[] = [],
) {
  mock.store(on, { lastSnapshot: PREVIOUS, ...stored })
  clock = mock.clock(on, { now: NOW })
  coreBand(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  registered = []
  scans = 0
  on('tool.register', (_, e) => {
    registered.push(e.name)
    return { value: { tool: `mcp__aitools__${e.name}` } }
  })
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/test' : undefined }))
  on('fs.list', () => {
    scans += 1
    return { value: [] }
  })
  on('session.messages', () => ({ value: messages }))
  const panes = mockPanes(on)
  on('session.id', () => ({ value: 'session-1' }))
  on('session.surfaces', () => ({ value: ['desktop' as const] }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [], cost: { usd: costs.usd } } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.step', async function* (_, e) {
    steps.push({ agentId: e.agentId, model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })

  return panes
}

async function step($: Engine, agentId?: string) {
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId })) {
    // drain
  }
}

function complete(turnId: string, agentId?: string) {
  return { reason: 'answer' as const, text: '', answer: '', durationMs: 1, isAborted: false, turnId, agentId }
}

async function barText($: Engine): Promise<string> {
  const ui = await $.ui.mount(band())
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  await ui.unmount()

  return text
}

describe('wiring', () => {
  test('a new session keeps last limits but not last thread cost or context', async ($, on) => {
    await start($, on, { usd: 0 })
    const text = await barText($)
    expect(text).toContain('5h 40%')
    expect(text).toContain('thread $0.00')
    expect(text).not.toContain('12.40')
    expect(text).not.toContain('0.83')
    expect(text).toContain('ctx -')
  })

  test('last-turn cost spans the main turn, ignoring subagent turns', async ($, on) => {
    const costs = { usd: 1 }
    await start($, on, costs)
    await $.turn.start({ text: 'go', turnId: 't1' })
    costs.usd = 2.5
    await $.turn.complete(complete('s1', 'sub'))
    expect(await barText($)).not.toContain('(+')
    costs.usd = 3
    await $.turn.complete(complete('t1'))
    expect(await barText($)).toContain('thread $3.00 (+$2.00)')
  })

  test('no last-turn cost without a turn start baseline', async ($, on) => {
    const costs = { usd: 2 }
    await start($, on, costs)
    await $.turn.complete(complete('unknown'))
    const text = await barText($)
    expect(text).toContain('thread $2.00')
    expect(text).not.toContain('(+')
  })

  test('a main-thread request starts the cache countdown', async ($, on) => {
    await start($, on, { usd: 0 })
    expect(await barText($)).toContain('cache -')
    await step($)
    expect(await barText($)).toContain('cache 60m')
  })

  test('subagent requests leave the cache countdown alone', async ($, on) => {
    await start($, on, { usd: 0 })
    await step($, 'sub')
    expect(await barText($)).toContain('cache -')
  })

  test('a reload of the same session keeps thread and last-turn cost', async ($, on) => {
    const costs = { usd: 1 }
    await start($, on, costs)
    await $.turn.start({ text: 'go', turnId: 't1' })
    costs.usd = 3
    await $.turn.complete(complete('t1'))
    await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
    expect(await barText($)).toContain('thread $3.00 (+$2.00)')
  })

  test("the last turn's tokens show on the bar once it completes", async ($, on) => {
    await start($, on, { usd: 0 })
    const usage = { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 }
    await $.turn.complete({ ...complete('t1'), usage: { ...usage, model: 'claude-opus-5-5' } })
    expect(await barText($)).toContain('tok - (+12k)')
  })

  test('/handoff prints the brief to the chat and copies it, writing no file', async ($, on) => {
    const brief = '## Goal\nShip aitools\n\n## Next step\nMerge'
    const writes: string[] = []
    const copies: string[] = []
    on('model.fork', () => ({
      value: { isAnswered: true, text: brief, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    }))
    on('fs.write', (_, e) => {
      writes.push(e.path)
      return { value: undefined }
    })
    on('ui.copy', (_, e) => {
      copies.push(e.text)
      return { value: { isCopied: true as const } }
    })
    await start($, on, { usd: 0 })
    const result = await $.command.run({
      command: 'handoff',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
    expect(result.text).toBe(`Handoff brief\n\n${brief}`)
    expect(copies).toEqual([brief])
    // The settings file is written on a first run; the brief is never.
    expect(writes.filter(path => !path.endsWith('/aitools.json'))).toEqual([])
  })

  describe('the ? button', () => {
    /** Records each prompt the mod submits, answering it as core would. */
    function sends(on: On) {
      const sent: { text: string; asUser?: true }[] = []
      on('prompt.submit', (_, e) => {
        if (e.origin.kind === 'plugin') sent.push({ text: e.text, asUser: e.origin.asUser })
        return { text: e.text }
      })
      return sent
    }
    const asked = { ...complete('t1'), answer: 'The bar is in. Should the ? sit left of tools?' }

    test('a reply that asks shows it left of tools; pressed, it sends the /askme prompt as the person and goes', async ($, on) => {
      const sent = sends(on)
      await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      expect(await ui.find({ key: 'askme' })).toBeUndefined()
      await $.turn.complete(asked)
      const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key)
      expect(keys.slice(keys.indexOf('askme'), keys.indexOf('askme') + 3)).toEqual(['askme', 'tools', 'settings'])
      expect((await ui.find({ key: 'askme' }))?.text).toBe('?')
      await ui.press({ key: 'askme' })
      expect(sent).toEqual([{ text: askmeText(''), asUser: true }])
      expect(await ui.find({ key: 'askme' })).toBeUndefined()
      await ui.unmount()
    })

    test('not after a pop-up in the same request, nor for a reply that asks nothing, nor once the person replies', async ($, on) => {
      on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: 'Picked blue' }))
      sends(on)
      await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
      await $.turn.complete(asked)
      expect(await ui.find({ key: 'askme' })).toBeUndefined()
      await $.prompt.submit({ text: 'Next', wait: false, origin: { kind: 'composer' } })
      await $.turn.complete({ ...complete('t2'), answer: 'Done.' })
      expect(await ui.find({ key: 'askme' })).toBeUndefined()
      await $.turn.complete(asked)
      expect(await ui.find({ key: 'askme' })).toBeDefined()
      await $.prompt.submit({ text: 'Left of it', wait: false, origin: { kind: 'composer' } })
      expect(await ui.find({ key: 'askme' })).toBeUndefined()
      await ui.unmount()
    })

    test('while a turn runs it puts /askme in the prompt box, ahead of the draft', async ($, on) => {
      const sent = sends(on)
      const fills: string[] = []
      on('prompt.read', () => ({ value: { text: 'only the first one', cursor: 0 } }))
      on('prompt.fill', (_, e) => {
        fills.push(e.text)
        return { isFilled: true }
      })
      await start($, on, { usd: 0 })
      await $.turn.complete(asked)
      const ui = await $.ui.mount({ ...band(), props: { ...band().props, isWorking: true } })
      await ui.press({ key: 'askme' })
      expect(sent).toEqual([])
      expect(fills).toEqual(['/askme only the first one'])
      await ui.unmount()
    })

    test('a prompt that cannot be sent goes in the box instead', async ($, on) => {
      const fills: string[] = []
      on('prompt.submit', () => ({ drop: 'busy' }))
      on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
      on('prompt.fill', (_, e) => {
        fills.push(e.text)
        return { isFilled: true }
      })
      await start($, on, { usd: 0 })
      await $.turn.complete(asked)
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'askme' })
      expect(fills).toEqual(['/askme'])
      await ui.unmount()
    })

    test('a session that loads on an unanswered question shows it', async ($, on) => {
      await start($, on, { usd: 0 }, {}, [
        { role: 'user', text: 'Add the button', toolUses: [] },
        { role: 'assistant', text: 'Which side of tools?', toolUses: [] },
      ])
      const ui = await $.ui.mount(band())
      expect(await ui.find({ key: 'askme' })).toBeDefined()
      await ui.unmount()
    })
  })

  test('/askme sends the ask-with-choices prompt as the person, with the note after it', async ($, on) => {
    const sent: { text: string; asUser?: true }[] = []
    on('prompt.submit', (_, e) => {
      sent.push({ text: e.text, asUser: e.origin?.kind === 'plugin' ? e.origin.asUser : undefined })
      return { text: e.text }
    })
    await start($, on, { usd: 0 })
    const result = await $.command.run({
      command: 'askme',
      args: 'skip the naming one',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
    expect(result.text).toBeUndefined()
    expect(sent).toEqual([])
    await clock.advance(0)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toContain('AskUserQuestion')
    expect(sent[0]?.text.endsWith('Also: skip the naming one')).toBe(true)
    expect(sent[0]?.asUser).toBe(true)
  })

  test("the tools menu's Handoff shows the brief in a pane with a Copy button, copying nothing by itself", async ($, on) => {
    const brief = '## Goal\nShip aitools\n\n## Next step\nMerge'
    const copies: string[] = []
    on('model.fork', () => ({
      value: { isAnswered: true, text: brief, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    }))
    on('ui.copy', (_, e) => {
      copies.push(e.text)
      return { value: { isCopied: true as const } }
    })
    const { opened } = await start($, on, { usd: 0 })
    const ui = await $.ui.mount(band())
    await ui.press({ key: 'tools' })
    await ui.press({ key: 'handoff' })
    expect(await ui.find({ key: 'handoff' })).toBeUndefined()
    await ui.unmount()
    expect(opened).toEqual(['handoff'])
    expect(copies).toEqual([])

    const pane = await $.ui.mount({ plugin: 'aitools', surface: 'desktop', component: 'Pane', requestId: 'handoff', props: PANE })
    expect(await pane.find({ type: 'Markdown' })).toBeDefined()
    await pane.press({ key: 'copy' })
    await pane.unmount()
    expect(copies).toEqual([brief])
  })

  describe('Task View and Clean View', () => {
    const CHECKLIST = 'mcp__aitools__checklist'
    const PLAN = {
      title: 'Dark mode',
      items: [
        { text: 'Read the theme', status: 'done' },
        { text: 'Add the tokens', status: 'doing', percent: 40 },
        { text: 'Run the checks', status: 'todo' },
      ],
    }

    /** Draws a transcript component as core would beneath the plugin, so a pass-through shows as the engine's. */
    function coreRows(on: On) {
      on('ui.render', { component: 'ToolUse' }, () => ({ type: 'engine' as const, ref: 0 }))
      on('ui.render', { component: 'AssistantMessage' }, () => ({ type: 'engine' as const, ref: 0 }))
    }

    function toolRow(tool: string) {
      return {
        plugin: 'aitools',
        surface: 'desktop' as const,
        component: 'ToolUse' as const,
        props: { tool_use_id: 't-1', tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false },
      }
    }

    function reply(text: string) {
      return { plugin: 'aitools', surface: 'desktop' as const, component: 'AssistantMessage' as const, props: { text, isFirstOfReply: true } }
    }

    async function isRowHidden($: Engine, target: Parameters<Engine['ui']['mount']>[0]): Promise<boolean> {
      const ui = await $.ui.mount(target)
      const isHidden = (await ui.find({ key: 'aitools-hidden' })) !== undefined
      await ui.unmount()

      return isHidden
    }

    async function pickView($: Engine, key: 'task' | 'clean') {
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      await ui.press({ key })
      await ui.unmount()
    }

    test('the 🛠 menu marks each view that is on with ●, and each turns on and off on its own', async ($, on) => {
      await start($, on, { usd: 0 })
      await pickView($, 'task')
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      expect((await ui.find({ key: 'task' }))?.text).toBe('● Task View')
      expect((await ui.find({ key: 'clean' }))?.text).toBe('○ Clean View')
      await ui.press({ key: 'clean' })
      await ui.press({ key: 'tools' })
      expect((await ui.find({ key: 'clean' }))?.text).toBe('● Clean View')
      expect((await ui.find({ key: 'task' }))?.text).toBe('● Task View')
      await ui.press({ key: 'task' })
      await ui.press({ key: 'tools' })
      expect((await ui.find({ key: 'task' }))?.text).toBe('○ Task View')
      expect((await ui.find({ key: 'clean' }))?.text).toBe('● Clean View')
      await ui.unmount()
    })

    test('/taskview and /cleanview toggle the views and say which is on', async ($, on) => {
      const run = (command: string, args = '') =>
        $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
      await start($, on, { usd: 0 })
      expect((await run('taskview')).text).toBe('Task View on.')
      expect((await run('cleanview')).text).toBe('Clean View on.')
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      expect((await ui.find({ key: 'clean' }))?.text).toBe('● Clean View')
      expect((await ui.find({ key: 'task' }))?.text).toBe('● Task View')
      await ui.unmount()
      expect((await run('cleanview')).text).toBe('Clean View off.')
      expect((await run('taskview', 'on')).text).toBe('Task View on.')
      expect((await run('taskview', 'off')).text).toBe('Task View off.')
      expect((await run('taskview', 'bogus')).text).toBe('Usage: /taskview [on|off] (no argument toggles Task View)')
    })

    test('the status line names the views that are on and clears when both are off', async ($, on) => {
      const statuses: (string | undefined)[] = []
      on('ui.status', (_, e) => {
        statuses.push(e.text)
        return { value: undefined }
      })
      await start($, on, { usd: 0 }, { viewMode: 'task' })
      await pickView($, 'clean')
      await pickView($, 'task')
      await pickView($, 'clean')
      expect(statuses).toEqual(['Task View', 'Task View, Clean View', 'Clean View', undefined])
    })

    test('Clean View alone shows no checklist and asks for none; Task View alone hides nothing but its own row', async ($, on) => {
      const contexts: (readonly string[] | undefined)[] = []
      on('prompt.submit', (_, e) => {
        contexts.push(e.context)
        return { text: e.text }
      })
      await start($, on, { usd: 0 })
      await pickView($, 'clean')
      await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
      expect(contexts[0]?.join('')).toContain('Clean View is on: the person sees only your final reply')
      expect(contexts[0]?.join('')).not.toContain(CHECKLIST)
      expect(registered).not.toContain('checklist')
      await $.tool.call({ tool: CHECKLIST, ...PLAN })
      expect(await barText($)).not.toContain('Dark mode')
    })

    test('a saved view comes back in a new session', async ($, on) => {
      await start($, on, { usd: 0 }, { viewMode: 'clean' })
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      expect((await ui.find({ key: 'clean' }))?.text).toBe('● Clean View')
      await ui.unmount()
    })

    test('a view adds the checklist note to each prompt; off adds none', async ($, on) => {
      const contexts: (readonly string[] | undefined)[] = []
      on('prompt.submit', (_, e) => {
        contexts.push(e.context)
        return { text: e.text }
      })
      await start($, on, { usd: 0 })
      await $.prompt.submit({ text: 'before', wait: false, origin: { kind: 'composer' } })
      await pickView($, 'clean')
      await $.prompt.submit({ text: 'after', wait: false, origin: { kind: 'composer' } })
      expect(contexts[0]).toBeUndefined()
      expect(contexts[1]?.[0]).toContain('Clean View is on')
    })

    test('the checklist tool draws the plan above the bar and refuses a malformed one', async ($, on) => {
      await start($, on, { usd: 0 })
      await pickView($, 'task')
      const bad = await $.tool.call({ tool: CHECKLIST, title: '', items: [] })
      expect(bad.deny).toContain('title must be a non-empty string')
      const ok = await $.tool.call({ tool: CHECKLIST, ...PLAN })
      expect(ok.result).toBe('Checklist updated.')
      const text = await barText($)
      expect(text).toContain('Dark mode')
      expect(text).toContain('1 of 3')
      expect(text).toContain('● Add the tokens 40% ▰▰▱▱▱▱')
      expect(text).toContain('○ Run the checks  0% ▱▱▱▱▱▱')
      expect(text).toContain('✓ Read the theme100% ▰▰▰▰▰▰')
    })

    test('the checklist sits below the bar with green, blue and dim marks, its title plain and not bold', async ($, on) => {
      await start($, on, { usd: 0 })
      await pickView($, 'task')
      await $.tool.call({ tool: CHECKLIST, ...PLAN })
      const text = await barText($)
      expect(text.indexOf('AI Tools')).toBeLessThan(text.indexOf('Dark mode'))
      const ui = await $.ui.mount(band())
      const texts = await ui.findAll({ type: 'Text' })
      await ui.unmount()
      const title = texts.find(t => t.text === 'Dark mode')
      expect([title?.props.color, title?.props.bold ?? false]).toEqual([DOING_TEXT, false])
      const marks = texts.filter(t => ['✓ ', '● ', '○ '].includes(t.text))
      expect(marks.map(m => [m.text, m.props.color ?? null, m.props.dimColor ?? false])).toEqual([
        ['✓ ', GREEN, false],
        ['● ', BLUE, false],
        ['○ ', null, true],
      ])
      const doing = texts.find(t => t.text === 'Add the tokens')
      expect([doing?.props.color, doing?.props.bold ?? false, doing?.props.dimColor ?? false]).toEqual([DOING_TEXT, false, false])
      const fills = texts.filter(t => /^▰+$/.test(t.text))
      expect(fills.map(f => [f.text, f.props.color ?? null])).toEqual([
        ['▰▰▰▰▰▰', GREEN],
        ['▰▰', BLUE],
      ])
    })

    test('a finished checklist folds to one line', async ($, on) => {
      await start($, on, { usd: 0 })
      await pickView($, 'task')
      await $.tool.call({ tool: CHECKLIST, ...PLAN, items: PLAN.items.map(i => ({ ...i, status: 'done' })) })
      const text = await barText($)
      expect(text).toContain('✓ Done: Dark mode (3 steps)')
      expect(text).not.toContain('Read the theme')
    })

    test('▾ folds the checklist to its title row and ▸ opens it again; × closes it until the next prompt', async ($, on) => {
      on('prompt.submit', (_, e) => ({ text: e.text }))
      await start($, on, { usd: 0 })
      await pickView($, 'task')
      await $.tool.call({ tool: CHECKLIST, ...PLAN })
      const ui = await $.ui.mount(band())
      expect((await ui.find({ key: 'checklist-fold' }))?.text).toBe('▾')
      // The steps sit in under the title; on the desktop the fold button's own chrome parts it from the title.
      const boxes = await ui.findAll({ type: 'Box' })
      expect(boxes.filter(b => typeof b.props.key === 'string' && b.props.key.startsWith('item-')).map(b => b.props.paddingLeft)).toEqual([2, 2, 2])
      expect(boxes.some(b => b.props.columnGap === 0 && b.text.startsWith('▾Dark mode'))).toBe(true)
      await ui.press({ key: 'checklist-fold' })
      expect((await ui.find({ key: 'checklist-fold' }))?.text).toBe('▸')
      expect(await barText($)).toContain('Dark mode')
      expect(await barText($)).not.toContain('Add the tokens')
      await ui.press({ key: 'checklist-fold' })
      expect(await barText($)).toContain('Add the tokens')
      await ui.press({ key: 'checklist-close' })
      await ui.unmount()
      expect(await barText($)).not.toContain('Dark mode')
      // Claude updating the list in the same request leaves it closed; the person's next prompt brings it back.
      await $.tool.call({ tool: CHECKLIST, ...PLAN })
      expect(await barText($)).not.toContain('Dark mode')
      await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
      await $.tool.call({ tool: CHECKLIST, ...PLAN, title: 'Light mode' })
      expect(await barText($)).toContain('Light mode')
    })

    test('the × at the end of the Done line closes it', async ($, on) => {
      await start($, on, { usd: 0 })
      await pickView($, 'task')
      await $.tool.call({ tool: CHECKLIST, ...PLAN, items: PLAN.items.map(i => ({ ...i, status: 'done' })) })
      const ui = await $.ui.mount(band())
      expect((await ui.find({ key: 'checklist-close' }))?.text).toBe('×')
      await ui.press({ key: 'checklist-close' })
      expect(await ui.find({ text: /Done: Dark mode/ })).toBeUndefined()
      expect(await ui.find({ key: 'checklist-close' })).toBeUndefined()
      await ui.unmount()
    })

    test('Task View hides only the checklist tool row; Clean View hides every tool row', async ($, on) => {
      coreRows(on)
      await start($, on, { usd: 0 })
      await pickView($, 'task')
      expect(await isRowHidden($, toolRow(CHECKLIST))).toBe(true)
      expect(await isRowHidden($, toolRow('Bash'))).toBe(false)
      expect(await isRowHidden($, reply('Let me look.'))).toBe(false)
      await pickView($, 'clean')
      expect(await isRowHidden($, toolRow('Bash'))).toBe(true)
    })

    test("Clean View hides replies until they are part of a finished turn's final answer", async ($, on) => {
      coreRows(on)
      await start($, on, { usd: 0 })
      await pickView($, 'clean')
      expect(await isRowHidden($, reply('Let me read the theme first.'))).toBe(true)
      expect(await isRowHidden($, reply('Dark mode is in.'))).toBe(true)
      await $.turn.complete({ ...complete('t1'), answer: 'Dark mode is in.' })
      expect(await isRowHidden($, reply('Dark mode is in.'))).toBe(false)
      expect(await isRowHidden($, reply('Let me read the theme first.'))).toBe(true)
    })

    test('Clean View shows final replies of turns that ended before the mod loaded', async ($, on) => {
      coreRows(on)
      await start($, on, { usd: 0 }, { viewMode: 'clean' }, [
        { role: 'user', text: 'Add dark mode', toolUses: [] },
        { role: 'assistant', text: 'Let me look.', toolUses: [] },
        { role: 'user', text: '', toolUses: [], toolResults: [] },
        { role: 'assistant', text: 'Dark mode is in.', toolUses: [] },
      ])
      expect(await isRowHidden($, reply('Dark mode is in.'))).toBe(false)
      expect(await isRowHidden($, reply('Let me look.'))).toBe(true)
    })
  })

  describe('Background tasks', () => {
    const run = (on$: Engine, command: string) =>
      on$.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

    /** Answers a spawn as core does beneath the plugin, recording what reached it. */
    function coreSpawn(on: On, seen: { model?: string; prompt: string }[]) {
      let n = 0
      on('agent.spawn', (_, e) => {
        seen.push({ model: e.model, prompt: e.prompt })
        n += 1
        return { model: e.model ?? 'parent', agentId: `agent-${n}` }
      })
    }

    const DOCK = { plugin: 'aitools', surface: 'desktop' as const, component: 'Pane' as const, props: PANE }

    /** The reads `pick` and `picks` make of a mounted pane. */

    async function dockText($: Engine): Promise<string> {
      const pane = await $.ui.mount({ ...DOCK, requestId: 'tasks' })
      const text = (await pane.findAll({ type: 'Text' })).map(t => t.text).join('')
      await pane.unmount()

      return text
    }

    let spawned = 0

    /** Starts a subagent the way the Agent tool would, every field the engine fills given. */
    function spawn($: Engine, description: string, prompt = description) {
      spawned += 1
      return $.agent.spawn({
        tool_use_id: `call-${spawned}`,
        prompt,
        description,
        subagentType: 'general-purpose',
        provider: { plugin: 'engine', tier: 'core' },
        parentModel: 'claude-opus-5-5',
        background: true,
        fork: false,
      })
    }

    test('/subagents opens and closes the Subagents pane; its rows are Showing: and Hide after:', async ($, on) => {
      const panes = await start($, on, { usd: 0 })
      expect((await run($, 'tasks')).text).toBe('Background tasks open.')
      expect(panes.open.has('tasks')).toBe(true)
      const text = await dockText($)
      const order = ['Showing:', 'Hide after:'].map(label => text.indexOf(label))
      expect(order.every(i => i >= 0)).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      expect(text).not.toContain('Set team size:')
      expect(text).not.toContain('Set model:')
      expect((await run($, 'tasks')).text).toBe('Background tasks closed.')
      expect(panes.open.has('tasks')).toBe(false)
    })

    test('the 🛠 menu\'s Tasks only opens the pane, with no circle', async ($, on) => {
      const panes = await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      expect((await ui.find({ key: 'tasks' }))?.text).toBe('Tasks')
      await ui.press({ key: 'tasks' })
      expect(panes.open.has('tasks')).toBe(true)
      await ui.press({ key: 'tools' })
      expect((await ui.find({ key: 'tasks' }))?.text).toBe('Tasks')
      await ui.press({ key: 'tasks' })
      await ui.unmount()
      expect(panes.open.has('tasks')).toBe(true)
    })

    test('the pane adds no note, changes no model and sets no status; a subagent is only asked to report progress', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      const contexts: (readonly string[] | undefined)[] = []
      const statuses: (string | undefined)[] = []
      coreSpawn(on, seen)
      on('prompt.submit', (_, e) => {
        contexts.push(e.context)
        return { text: e.text }
      })
      on('ui.status', (_, e) => {
        statuses.push(e.text)
        return { value: undefined }
      })
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await $.prompt.submit({ text: 'Do it', wait: false, origin: { kind: 'composer' } })
      const started = await spawn($, 'Piece', 'Do a piece')
      expect(contexts).toEqual([undefined])
      expect(started.model).toBe('parent')
      expect(seen[0]?.prompt).toBe(`Do a piece${SUBAGENT_NOTE}`)
      expect(statuses.filter(t => t?.includes('Subagents'))).toEqual([])
      expect(registered).toContain('agent_progress')
    })

    test('saved picks come back, but the dock starts closed', async ($, on) => {
      const panes = await start($, on, { usd: 0 }, { agentShowing: 'subagent', agentHideAfter: 5 })
      expect(panes.opened).toEqual([])
      await run($, 'tasks')
      const ui = await $.ui.mount({ ...DOCK, requestId: 'tasks' })
      expect(await pick(ui, 'showing-subagent')).toBe('[x] Subagents')
      expect(await pick(ui, 'hide-5')).toBe('[x] 5m')
      await ui.unmount()
    })

    test('a subagent reports progress on its line and runs on the model it was given', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      const steps: Step[] = []
      coreSpawn(on, seen)
      await start($, on, { usd: 0 }, {}, [], steps)
      await run($, 'tasks')
      const first = await spawn($, 'Licenses', 'Research licenses')
      expect(first.agentId).toBe('agent-1')
      expect(first.model).toBe('parent')
      expect(seen[0]?.prompt).toContain('mcp__aitools__agent_progress')

      const progress = { doing: 'Reading the city site', percent: 40 }
      await $.tool.call({ tool: 'mcp__aitools__agent_progress', agentId: 'agent-1', ...progress })
      const subagentStep = { turnId: 't9', index: 0, model: 'claude-opus-5-5', effort: 'high' as const, messageCount: 1 }
      for await (const _ of $.turn.step({ ...subagentStep, agentId: 'agent-1' })) {
        // drain
      }
      expect(steps.at(-1)).toEqual({ agentId: 'agent-1', model: 'claude-opus-5-5', effort: 'high' })
      const text = await dockText($)
      const dock = await $.ui.mount({ ...DOCK, requestId: 'tasks' })
      const task = (await dock.findAll({ type: 'Text' })).find(t => t.text.startsWith('Licenses'))
      await dock.unmount()
      expect([task?.props.color, task?.props.bold ?? false]).toEqual([DOING_TEXT, false])
      expect(text).toContain('1 running')
      expect(text).toContain('Licenses · Reading the city site')
      expect(text).toContain(' 40% ▰▰▱▱▱▱')
    })

    test("a subagent's report arriving as a prompt keeps the run; so does the person's next prompt", async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      coreSpawn(on, seen)
      on('prompt.submit', (_, e) => ({ text: e.text }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Licenses', 'a')
      await $.turn.complete({ ...complete('h1', 'agent-1'), answer: 'Found three licenses.' })
      await $.prompt.submit({ text: 'report', wait: false, origin: { kind: 'task-notification' } as never })
      await $.turn.complete({ ...complete('t2'), answer: 'Here is the plan.' })
      const text = await dockText($)
      expect(text).toContain('✓ Subagent Licenses')
      expect(text).toContain('✓ Subagent Licenses 0:00 (just now)')
      await $.prompt.submit({ text: 'next job', wait: false, origin: { kind: 'composer' } })
      expect(await dockText($)).toContain('✓ Subagent Licenses')
    })

    test('a subagent the engine lists as finished is settled even if its finish was missed', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      coreSpawn(on, seen)
      on('agent.list', () => ({ value: [{ id: 'agent-1', description: 'Licenses', type: 'general-purpose', status: 'completed' }] }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Licenses', 'a')
      await $.turn.complete({ ...complete('t2'), answer: 'All done.' })
      expect(await dockText($)).toContain('✓ Subagent Licenses 0:00 (just now)')
    })

    test('subagents started together each keep their line', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      coreSpawn(on, seen)
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      const results = await Promise.all(['A', 'B', 'C', 'D', 'E'].map(name => spawn($, name)))
      expect(results.filter(r => r.agentId !== undefined)).toHaveLength(5)
      const text = await dockText($)
      expect(text).toContain('5 running')
      expect(text.match(/● /g)).toHaveLength(5)
    })

    test('on Default every subagent gets a line: its latest tool call, then ✓ below the running ones once done', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      coreSpawn(on, seen)
      on('tool.call', { tool: 'Read' }, () => ({ result: 'file text' }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Survey the code', 'look around')
      await spawn($, 'Write tests', 'add tests')
      await $.tool.call({ tool: 'Read', file_path: '/repo/src/bar.tsx', agentId: 'agent-1' } as never)
      let text = await dockText($)
      expect(text).toContain('2 running')
      expect(text).toContain('● Subagent Survey the code · Reading bar.tsx')
      expect(text).not.toContain('%')
      await $.turn.complete({ ...complete('s1', 'agent-1'), answer: 'Surveyed.' })
      text = await dockText($)
      expect(text.indexOf('● Subagent Write tests')).toBeLessThan(text.indexOf('✓ Subagent Survey the code'))
      // Default asks the subagent only to report its progress.
      expect(seen.map(s => s.prompt)).toEqual([`look around${SUBAGENT_NOTE}`, `add tests${SUBAGENT_NOTE}`])
    })

    test('with no lines to list, the pane says what will appear, for the Showing pick', async ($, on) => {
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      const pane = await $.ui.mount({ ...DOCK, requestId: 'tasks' })
      expect(await pane.find({ text: 'Background tasks will appear here when started.' })).toBeDefined()
      await pane.press({ key: 'showing-subagent' })
      expect(await pane.find({ text: 'Subagents will appear here when started.' })).toBeDefined()
      await pane.press({ key: 'showing-monitor' })
      expect(await pane.find({ text: 'Monitors will appear here when started.' })).toBeDefined()
      await pane.unmount()
    })

    test('on the desktop the totem stacks a mini Clawd per running subagent; the terminal draws none', async ($, on) => {
      coreSpawn(on, [])
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      const totem = async () => {
        const pane = await $.ui.mount({ ...DOCK, requestId: 'tasks' })
        const art = await pane.find({ type: 'Svg' })
        await pane.unmount()
        return art?.props.alt
      }
      expect(await totem()).toBe('Clawd asleep')
      await spawn($, 'Survey the code', 'look around')
      await spawn($, 'Write tests', 'add tests')
      expect(await totem()).toBe('Clawd with 2 mini Clawds stacked on his head')
      await $.turn.complete({ ...complete('s1', 'agent-1'), answer: 'Surveyed.' })
      expect(await totem()).toBe('Clawd with 1 mini Clawd stacked on his head')
      const terminal = await $.ui.mount({ ...DOCK, surface: 'terminal', requestId: 'tasks' })
      expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
      await terminal.unmount()
    })

    test("a running subagent's time ticks each second; a closed pane still follows its tool calls", async ($, on) => {
      coreSpawn(on, [])
      on('tool.call', { tool: 'Read' }, () => ({ result: 'file text' }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Survey the code', 'look around')
      await clock.advance(3000)
      expect(await dockText($)).toContain('0:03')
      await run($, 'tasks')
      await $.tool.call({ tool: 'Read', file_path: '/repo/src/bar.tsx', agentId: 'agent-1' } as never)
      await run($, 'tasks')
      expect(await dockText($)).toContain('Reading bar.tsx')
    })

    test('a tool agent that reports progress shows a bar; its line still follows its tool calls', async ($, on) => {
      coreSpawn(on, [])
      on('tool.call', { tool: 'Read' }, () => ({ result: 'file text' }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Survey the code', 'look around')
      const reported = await $.tool.call({ tool: 'mcp__aitools__agent_progress', agentId: 'agent-1', doing: 'Mapping the code', percent: 50 })
      expect(reported.result).toBe('Progress noted.')
      let text = await dockText($)
      expect(text).not.toContain('will appear here')
      expect(text).toContain('● Subagent Survey the code · Mapping the code')
      expect(text).toContain(' 50% ▰▰▰▱▱▱')
      await $.tool.call({ tool: 'Read', file_path: '/repo/src/bar.tsx', agentId: 'agent-1' } as never)
      text = await dockText($)
      expect(text).toContain('● Subagent Survey the code · Reading bar.tsx')
      expect(text).toContain(' 50% ▰▰▰▱▱▱')
    })

    test('a running name is half-dim and its activity faint; a finished line is all faint with how long ago', async ($, on) => {
      coreSpawn(on, [])
      on('tool.call', { tool: 'Read' }, () => ({ result: 'file text' }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Survey the code', 'look around')
      await spawn($, 'Write tests', 'add tests')
      await $.tool.call({ tool: 'Read', file_path: '/repo/src/bar.tsx', agentId: 'agent-1' } as never)
      await $.turn.complete({ ...complete('s2', 'agent-2'), answer: 'Written.' })
      await clock.advance(3 * 60_000)
      const pane = await $.ui.mount({ ...DOCK, requestId: 'tasks' })
      const texts = await pane.findAll({ type: 'Text' })
      await pane.unmount()
      const find = (text: string) => texts.find(t => t.text === text)
      expect(find('Survey the code')?.props.color).toBe(DOING_TEXT)
      expect(find(' · Reading bar.tsx')?.props.color).toBe(FAINT_TEXT)
      expect(find('✓ ')?.props.color).toBe(FAINT_TEXT)
      // The type column: dim while running, faint once finished.
      expect(texts.filter(t => t.text === 'Subagent ').map(t => [t.props.dimColor ?? false, t.props.color])).toEqual([
        [true, undefined],
        [false, FAINT_TEXT],
      ])
      expect(find('Write tests')?.props.color).toBe(FAINT_TEXT)
      expect(find(' 0:00 (3m ago)')?.props.color).toBe(FAINT_TEXT)
      expect(find(' 0:00 (3m ago)')).toBeDefined()
    })

    test('Showing and Hide after: their own rows, applied to the lines', async ($, on) => {
      on('prompt.submit', (_, e) => ({ text: e.text }))
      coreSpawn(on, [])
      on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'm1', persistent: true } }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Earlier job')
      await $.turn.complete({ ...complete('s1', 'agent-1'), answer: 'Done.' })
      await clock.advance(6 * 60_000)
      await $.tool.call({ tool: 'Monitor', description: 'Current job', command: 'adb devices', persistent: true } as never)
      const pane = await $.ui.mount({ ...DOCK, requestId: 'tasks' })
      expect(await picks(pane, 'showing-')).toEqual(['showing-all', 'showing-subagent', 'showing-workflow', 'showing-monitor'])
      expect(await picks(pane, 'hide-')).toEqual(['hide-never', 'hide-60', 'hide-15', 'hide-5', 'hide-0'])
      expect(await pick(pane, 'showing-all')).toBe('[x] All')
      expect(await pick(pane, 'hide-never')).toBe('[x] Never')
      expect(await pick(pane, 'hide-0')).toBe('[ ] Immediate')
      expect(await pane.find({ text: 'Earlier job' })).toBeDefined()
      await pane.press({ key: 'showing-monitor' })
      expect(await pane.find({ text: 'Earlier job' })).toBeUndefined()
      expect(await pane.find({ text: 'Current job' })).toBeDefined()
      await pane.press({ key: 'showing-all' })
      await pane.press({ key: 'hide-5' })
      expect(await pane.find({ text: 'Earlier job' })).toBeUndefined()
      await pane.unmount()
    })

    test('saved Showing and Hide after picks come back', async ($, on) => {
      await start($, on, { usd: 0 }, { agentShowing: 'subagent', agentHideAfter: 0 })
      await run($, 'tasks')
      const pane = await $.ui.mount({ ...DOCK, requestId: 'tasks' })
      expect(await pick(pane, 'showing-subagent')).toBe('[x] Subagents')
      expect(await pick(pane, 'hide-0')).toBe('[x] Immediate')
      await pane.unmount()
    })

    test('with the pane closed, a subagent still gets a line, but is not asked to report progress', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      coreSpawn(on, seen)
      await start($, on, { usd: 0 })
      await spawn($, 'Unwatched', 'quietly')
      expect(seen[0]?.prompt).toBe('quietly')
      expect(registered).not.toContain('agent_progress')
      await run($, 'tasks')
      expect(await dockText($)).toContain('● Subagent Unwatched')
    })

    test('a background command gets no line', async ($, on) => {
      on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }))
      await start($, on, { usd: 0 })
      await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start the dev server', run_in_background: true })
      await run($, 'tasks')
      expect(await dockText($)).toContain('Background tasks will appear here when started.')
    })

    test("a notice delivered into a running turn, a subagent's included, ends its task too", async ($, on) => {
      on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'bverhg9ya', persistent: true } }))
      on('prompt.attachment', (_, e) => ({ text: e.text }))
      await start($, on, { usd: 0 })
      await $.tool.call({ tool: 'Monitor', description: 'Wait for PR checks', command: 'gh pr checks 12 --watch', agentId: 'agent-1' } as never)
      await run($, 'tasks')
      expect(await dockText($)).toContain('● Monitor  Wait for PR checks')
      const notice =
        '<task-notification>\n<task-id>bverhg9ya</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<status>completed</status>\n' +
        '<summary>Monitor "Wait for PR checks" completed</summary>\n</task-notification>'
      await $.prompt.attachment({ type: 'queued_command', text: notice, origin: { kind: 'engine' }, agentId: 'agent-1' })
      const text = await dockText($)
      expect(text).toContain('1 done')
      expect(text).toContain('✓ Monitor  Wait for PR checks')
    })

    test('a monitor ends at its closing notice, or once its deadline has passed; TaskStop stops a task', async ($, on) => {
      let next = 0
      on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: `m${++next}`, timeoutMs: 60_000 } }))
      on('tool.call', { tool: 'TaskStop' }, (_, e) => ({ result: { message: 'stopped', task_id: e.task_id ?? '', task_type: 'monitor' } }))
      on('prompt.submit', (_, e) => ({ text: e.text }))
      await start($, on, { usd: 0 })
      const watch = (description: string) => $.tool.call({ tool: 'Monitor', description, command: 'adb devices', timeout_ms: 60_000 })
      await watch('Phone on adb')
      await watch('CI checks')
      await watch('Deploy')
      const closing =
        '<task-notification>\n<task-id>m1</task-id>\n<summary>Monitor event: "Phone on adb"</summary>\n' +
        '<event>[Monitor expired after 1m with no events delivered.]</event>\n</task-notification>'
      await $.prompt.submit({ text: closing, wait: false, origin: { kind: 'task-notification' } as never })
      await $.tool.call({ tool: 'TaskStop', task_id: 'm3' })
      await run($, 'tasks')
      expect(await dockText($)).toContain('1 running · 1 done · 1 stopped')
      await clock.advance(3 * 60_000)
      expect(await dockText($)).toContain('2 done · 1 stopped')
    })

    test("a workflow's agents get lines under its name; an unlisted loop with no workflow started gets none", async ($, on) => {
      on('tool.call', { tool: 'Workflow' }, () => ({ result: 'Workflow started' }))
      on('agent.list', () => ({ value: [] }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await step($, 'fork-1')
      expect(await dockText($)).not.toContain('agent 1')
      const script = "export const meta = { name: 'review-changes', description: 'Review' }"
      await $.tool.call({ tool: 'Workflow', script } as never)
      await step($, 'wf-a')
      await step($, 'wf-b')
      let text = await dockText($)
      expect(text).toContain('● Workflow review-changes · agent 1')
      expect(text).toContain('● Workflow review-changes · agent 2')
      await $.turn.complete({ ...complete('w1', 'wf-a'), reason: 'error' })
      text = await dockText($)
      expect(text).toContain('× Workflow review-changes · agent 1')
      expect(text.indexOf('● Workflow review-changes · agent 2')).toBeLessThan(text.indexOf('× Workflow review-changes · agent 1'))
    })

    test('a subagent the engine no longer lists is settled as finished', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      coreSpawn(on, seen)
      on('agent.list', () => ({ value: [] }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Licenses', 'a')
      await $.turn.complete({ ...complete('t2'), answer: 'All done.' })
      expect(await dockText($)).toContain('✓ Subagent Licenses 0:00 (just now)')
    })

    test('finished lines stay across prompts, the pane closed and opened again', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      coreSpawn(on, seen)
      on('prompt.submit', (_, e) => ({ text: e.text }))
      await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Licenses', 'a')
      await $.turn.complete({ ...complete('h1', 'agent-1'), answer: 'Done.' })
      await $.turn.complete({ ...complete('t2'), answer: 'All done.' })
      await run($, 'tasks')
      await $.prompt.submit({ text: 'something else', wait: false, origin: { kind: 'composer' } })
      await run($, 'tasks')
      expect(await dockText($)).toContain('✓ Subagent Licenses')
    })

    test('the main chat cannot report progress', async ($, on) => {
      await start($, on, { usd: 0 })
      const denied = await $.tool.call({ tool: 'mcp__aitools__agent_progress', doing: 'x', percent: 5 })
      expect(denied.deny).toBe('Only subagents report progress.')
    })

    test('when every subagent is done and Claude replies, the dock adds a finish line under the cards', async ($, on) => {
      const seen: { model?: string; prompt: string }[] = []
      coreSpawn(on, seen)
      on('prompt.submit', (_, e) => ({ text: e.text }))
      const { opened } = await start($, on, { usd: 0 })
      await run($, 'tasks')
      await spawn($, 'Licenses', 'a')
      await spawn($, 'Floor plan', 'b')
      await $.turn.complete({ ...complete('t1'), answer: 'Still working.' })
      expect(opened).toEqual(['tasks'])
      expect(await dockText($)).toContain('2 running')
      await $.turn.complete({ ...complete('h1', 'agent-1'), answer: 'Found three licenses.' })
      await $.turn.complete({ ...complete('h2', 'agent-2'), reason: 'error', answer: '' })
      await $.turn.complete({ ...complete('t2'), answer: 'Here is the plan.' })
      await $.turn.complete({ ...complete('t3'), answer: 'Anything else?' })
      expect(opened).toEqual(['tasks'])
      const text = await dockText($)
      expect(text).toContain('✓ Subagent Licenses')
      expect(text).toContain('× Subagent Floor plan')
      expect(text).toContain('× Subagent Floor plan 0:00 (just now)')
      expect(text).not.toContain('%')
      expect(text).not.toContain('Found three licenses.')
      expect(text).not.toContain('Here is the plan.')
      await $.prompt.submit({ text: 'next job', wait: false, origin: { kind: 'composer' } })
      await spawn($, 'Budget', 'c')
      const after = await dockText($)
      // The earlier lines stay below the new one; the finish line waits for it.
      expect(after.indexOf('● Subagent Budget')).toBeLessThan(after.indexOf('✓ Subagent Licenses'))
      expect(after).toContain('× Subagent Floor plan')
      expect(after).not.toContain('subagents finished')
    })
  })

  function runAitools($: Engine, args: string) {
    return $.command.run({ command: 'aitools', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  }

  async function hasBar($: Engine): Promise<boolean> {
    const ui = await $.ui.mount(band())
    const found = (await ui.find({ key: 'settings' })) !== undefined
    await ui.unmount()

    return found
  }

  function engineBand(on: On) {
    on('ui.render', { component: 'AbovePrompt' }, ($e, e) => $e.ui.resolve(e).Text({ children: 'engine band' }))
  }

  test('/aitools toggles the bar and on/off set it', async ($, on) => {
    engineBand(on)
    await start($, on, { usd: 0 })
    expect(await hasBar($)).toBe(true)
    expect((await runAitools($, '')).text).toBe('aitools bar hidden. Run /aitools to show it.')
    expect(await hasBar($)).toBe(false)
    expect((await runAitools($, 'on')).text).toBe('aitools bar shown.')
    expect(await hasBar($)).toBe(true)
    await runAitools($, 'off')
    expect(await hasBar($)).toBe(false)
  })

  test('/aitools with an unknown argument explains usage', async ($, on) => {
    await start($, on, { usd: 0 })
    expect((await runAitools($, 'bogus')).text).toBe('Usage: /aitools [on|off] (no argument toggles the bar)')
  })

  test('the bar stacks above a band a plugin beneath drew', async ($, on) => {
    engineBand(on)
    await start($, on, { usd: 0 })
    const ui = await $.ui.mount(band())
    expect(await ui.find({ key: 'settings' })).toBeDefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
    await ui.unmount()
  })

  test('a hidden bar stays hidden in a new session', async ($, on) => {
    engineBand(on)
    await start($, on, { usd: 0 }, { isHidden: true })
    expect(await hasBar($)).toBe(false)
  })

  describe('mascot', () => {
    /** What the mascot's drawing says on the desktop bar, and its source. */
    async function mascot($: Engine): Promise<{ alt: unknown; source: unknown }> {
      const ui = await $.ui.mount(band())
      const art = await ui.find({ type: 'Svg' })
      await ui.unmount()

      return { alt: art?.props.alt, source: art?.props.source }
    }
    const pose = async ($: Engine) => (await mascot($)).alt

    /** Starts a session past its greeting, with the person's prompts and a Read tool answered beneath. */
    async function begin($: Engine, on: On, messages: Row[] = []) {
      on('prompt.submit', (_, e) => ({ text: e.text }))
      on('tool.call', { tool: 'Read' }, () => ({ result: 'file text' }))
      on('tool.call', { tool: 'Bash' }, () => ({ result: 'boom', isError: true as const }))
      await start($, on, { usd: 0 }, {}, messages)
    }

    /** The person's prompt and the turn it starts. */
    async function prompt($: Engine, text: string) {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
      await $.turn.start({ text, turnId: 't1' })
    }

    test('a new session starts him waving, then standing', async ($, on) => {
      await begin($, on)
      expect(await pose($)).toBe('Clawd waving')
      await clock.advance(3000)
      expect(await pose($)).toBe('Clawd standing')
    })

    test('a prompt that starts no turn leaves him as he is', async ($, on) => {
      await begin($, on)
      await clock.advance(3000)
      await $.prompt.submit({ text: 'blocked', wait: false, origin: { kind: 'composer' } })
      expect(await pose($)).toBe('Clawd standing')
    })

    test('reading lasts until the last of several read-only calls returns', async ($, on) => {
      let release = () => {}
      const slow = new Promise<void>(resolve => (release = resolve))
      on('tool.call', { tool: 'WebFetch' }, async () => {
        await slow
        return { result: 'page text' }
      })
      await begin($, on)
      await prompt($, 'Look things up')
      const pending = $.tool.call({ tool: 'WebFetch', url: 'https://example.com', prompt: 'x' } as never)
      await clock.settle()
      await $.tool.call({ tool: 'Read', file_path: '/a' } as never)
      expect(await pose($)).toBe('Clawd reading a sheet of paper')
      release()
      await pending
      expect(await pose($)).toBe('Clawd typing on a laptop')
    })

    test('a prompt sets him typing; a read-only tool has him reading, then typing again', async ($, on) => {
      let during: unknown
      on('tool.call', { tool: 'WebFetch' }, async () => {
        during = await pose($)
        return { result: 'page text' }
      })
      await begin($, on)
      await prompt($, 'Fix the bug')
      expect(await pose($)).toBe('Clawd typing on a laptop')
      await $.tool.call({ tool: 'WebFetch', url: 'https://example.com', prompt: 'x' } as never)
      expect(during).toBe('Clawd reading a sheet of paper')
      expect(await pose($)).toBe('Clawd typing on a laptop')
    })

    test('a failed tool startles him for a moment, then he types again', async ($, on) => {
      await begin($, on)
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.tool.call({ tool: 'Bash', command: 'false' } as never)
      expect(await pose($)).toBe('Clawd startled')
      await clock.advance(3000)
      expect(await pose($)).toBe('Clawd typing on a laptop')
    })

    test('a finished answer is celebrated, then he stands', async ($, on) => {
      await begin($, on)
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.turn.complete({ ...complete('t1'), answer: 'Fixed it.' })
      expect(await pose($)).toBe('Clawd celebrating')
      await clock.advance(3000)
      expect(await pose($)).toBe('Clawd standing')
    })

    test('an answer that asks something puzzles him until the person replies', async ($, on) => {
      await begin($, on)
      await $.turn.complete({ ...complete('t1'), answer: 'Which file should I change?' })
      expect(await pose($)).toBe('Clawd looking puzzled')
      await clock.advance(10 * 60_000)
      expect(await pose($)).toBe('Clawd looking puzzled')
      await prompt($, 'bar.tsx')
      expect(await pose($)).toBe('Clawd typing on a laptop')
    })

    test('an interrupted turn startles him, then he stands', async ($, on) => {
      await begin($, on)
      await $.turn.complete({ ...complete('t1'), reason: 'aborted', isAborted: true })
      expect(await pose($)).toBe('Clawd startled')
      await clock.advance(3000)
      expect(await pose($)).toBe('Clawd standing')
    })

    test('puzzled while an AskUserQuestion dialog is open, typing once it is answered', async ($, on) => {
      let during: unknown
      on('tool.call', { tool: 'AskUserQuestion' }, async () => {
        during = await pose($)
        return { result: 'Picked blue' }
      })
      await begin($, on)
      await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
      expect(during).toBe('Clawd looking puzzled')
      expect(await pose($)).toBe('Clawd typing on a laptop')
    })

    test('standing idle for five minutes he falls asleep; a prompt wakes him', async ($, on) => {
      await begin($, on)
      await clock.advance(3000)
      await clock.advance(4 * 60_000)
      expect(await pose($)).toBe('Clawd standing')
      // Checked every 30 seconds, so asleep within half a minute past five.
      await clock.advance(90_000)
      expect(await pose($)).toBe('Clawd asleep')
      await prompt($, 'Wake up')
      expect(await pose($)).toBe('Clawd typing on a laptop')
    })

    test('a change of pose plays its transition, then the source drops it', async ($, on) => {
      await begin($, on)
      await clock.advance(3000)
      await prompt($, 'go')
      const first = await mascot($)
      await clock.advance(2000)
      const settled = await mascot($)
      expect(settled.alt).toBe(first.alt)
      expect(settled.source).not.toBe(first.source)
      expect(String(first.source).length).toBeGreaterThan(String(settled.source).length)
    })

    test("the mod's own checklist tool leaves him as he is", async ($, on) => {
      await begin($, on)
      await clock.advance(3000)
      await $.tool.call({ tool: 'mcp__aitools__checklist', title: 'Plan', items: [{ text: 'One', status: 'doing' }] })
      expect(await pose($)).toBe('Clawd standing')
    })

    test('a question left open before the mod loaded still puzzles him after his greeting', async ($, on) => {
      await begin($, on, [
        { role: 'user', text: 'Add dark mode', toolUses: [] },
        { role: 'assistant', text: 'Should it follow the system setting?', toolUses: [] },
      ])
      await clock.advance(3000)
      expect(await pose($)).toBe('Clawd looking puzzled')
    })
  })

  describe('Notes', () => {
    const FILE = '/p/.claude/notes.md'

    /** A disk holding `files`, by path; a read of `unreadable` fails. */
    function disk(on: On, files: Map<string, string>, unreadable?: string) {
      on('session.root', () => ({ value: '/p' }))
      on('fs.exists', (_, e) => ({ value: files.has(e.path) || e.path === unreadable }))
      on('fs.read', (_, e) => {
        if (e.path === unreadable) throw new Error('EACCES: permission denied')
        return { value: files.get(e.path) ?? '' }
      })
      on('fs.write', (_, e) => {
        files.set(e.path, e.text)
        return { value: undefined }
      })
    }

    const notesPane = (surface: 'terminal' | 'desktop') => ({
      plugin: 'aitools',
      surface,
      component: 'Pane' as const,
      requestId: 'notes',
      props: { ...PANE, title: 'Notes' },
    })

    test("the 🛠 menu's Notes, right after Handoff, opens the note as saved", async ($, on) => {
      const files = new Map([[FILE, 'Buy milk']])
      disk(on, files)
      const panes = await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      const keys = (await ui.findAll({ type: 'Button' })).map(b => b.props.key)
      expect(keys.indexOf('notes')).toBe(keys.indexOf('handoff') + 1)
      await ui.press({ key: 'notes' })
      await ui.unmount()
      expect(panes.open.has('notes')).toBe(true)
      const pane = await $.ui.mount(notesPane('desktop'))
      expect((await pane.find({ type: 'Client' }))?.props.props).toEqual({ text: 'Buy milk', columns: 80 })
      const saved = (await pane.findAll({ type: 'Text' }))[0]
      expect([saved?.text, saved?.props.color]).toEqual(['Note saved to .claude/notes.md in your project.', FAINT_TEXT])
      await pane.unmount()
    })

    test('Copy copies the note as it stands, typing included', async ($, on) => {
      const copies: string[] = []
      on('ui.copy', (_, e) => {
        copies.push(e.text)
        return { value: { isCopied: true as const } }
      })
      disk(on, new Map([[FILE, 'Buy milk']]))
      await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      await ui.press({ key: 'notes' })
      await ui.unmount()
      const pane = await $.ui.mount(notesPane('desktop'))
      await pane.key({ key: '!' })
      await pane.press({ key: 'copy' })
      await pane.unmount()
      expect(copies).toEqual(['Buy milk!'])
    })

    for (const surface of ['terminal', 'desktop'] as const) {
      test(`on the ${surface}, what is typed is saved to .claude/notes.md`, async ($, on) => {
        const files = new Map<string, string>()
        disk(on, files)
        await start($, on, { usd: 0 })
        const ui = await $.ui.mount(band())
        await ui.press({ key: 'tools' })
        await ui.press({ key: 'notes' })
        await ui.unmount()
        const pane = await $.ui.mount(notesPane(surface))
        for (const key of ['h', 'i', 'return', 'there']) {
          await pane.key({ key })
        }
        await pane.key({ key: 'backspace' })
        await pane.unmount()
        expect(files.get(FILE)).toBe('hi\nther')
      })
    }

    test('a note that cannot be read shows why, and nothing writes over it', async ($, on) => {
      const files = new Map<string, string>()
      disk(on, files, FILE)
      await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      await ui.press({ key: 'notes' })
      await ui.unmount()
      const pane = await $.ui.mount(notesPane('desktop'))
      expect(await pane.find({ type: 'Client' })).toBeUndefined()
      expect((await pane.find({ type: 'Text' }))?.text).toContain('Could not read .claude/notes.md')
      await pane.unmount()
      expect(files.has(FILE)).toBe(false)
    })
  })

  describe('features turned off do no work', () => {
    const command = ($: Engine, name: string, args = '') =>
      $.command.run({ command: name, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

    async function toggleOption($: Engine, key: string) {
      const pane = await $.ui.mount(SETTINGS)
      await pane.press({ key })
      await pane.unmount()
    }

    test('no transcript scan while the month, thread tokens and weekly share are all off; turning one on scans', async ($, on) => {
      const off = { monthlyCost: false, threadTokens: false, threadPercent: false }
      await start($, on, { usd: 0 }, { settings: off })
      await $.turn.complete({ ...complete('t1'), answer: 'Done.' })
      await clock.settle()
      expect(scans).toBe(0)
      await toggleOption($, 'monthlyCost')
      await clock.settle()
      expect(scans).toBeGreaterThan(0)
    })

    test('the statusline file is written only once its option is on: at once, then after each measure, in one shell', async ($, on) => {
      const writes: { argv: readonly string[]; stdin?: string }[] = []
      on('process.run', (_, e) => {
        if (e.argv[0] === 'sh') writes.push({ argv: e.argv, stdin: e.init?.stdin })
        return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      })
      on('session.cwd', () => ({ value: '/p' }))
      on('session.root', () => ({ value: '/p' }))
      on('session.model', () => ({ value: 'claude-opus-5-5' }))
      on('session.version', () => ({ value: { version: '2.1.299' } }))
      on('fs.exists', () => ({ value: false }))
      on('session.measure', (_, e) => ({ changed: e.changed }))
      await start($, on, { usd: 0.5 })
      const resetsAt = new Date(NOW + 3_600_000).toISOString()
      const measure = () =>
        $.session.measure({
          context: { tokens: 1000, window: 200_000, percent: 1 },
          rateLimits: [{ kind: 'five_hour', percentUsed: 12, resetsAt }],
          cost: { usd: 0.5 },
          changed: ['rateLimits'],
        })
      await measure()
      expect(writes).toEqual([])
      await toggleOption($, 'statuslineFile')
      expect(writes).toHaveLength(1)
      await measure()
      expect(writes).toHaveLength(2)
      expect(writes[1]?.argv).toEqual(['sh', '-c', STATUSLINE_WRITE, 'sh', '/home/test/.claude/statusline.json'])
      const json = JSON.parse(writes[1]?.stdin ?? '{}')
      expect(writes[1]?.stdin?.startsWith('{\n  "session_id": "session-1",')).toBe(true)
      expect(json).toMatchObject({ session_id: 'session-1', model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }, version: '2.1.299' })
      expect(json.rate_limits).toEqual({ five_hour: { used_percentage: 12, resets_at: Math.floor((NOW + 3_600_000) / 1000) } })
      await toggleOption($, 'statuslineFile')
      await measure()
      expect(writes).toHaveLength(2)
    })

    test('no scan while the bar is hidden; showing it scans', async ($, on) => {
      await start($, on, { usd: 0 }, { isHidden: true })
      await clock.settle()
      expect(scans).toBe(0)
      await command($, 'aitools', 'on')
      await clock.settle()
      expect(scans).toBeGreaterThan(0)
    })

    test('the checklist and progress tools are offered only once their view or the dock is on', async ($, on) => {
      await start($, on, { usd: 0 })
      expect(registered).toEqual([])
      await command($, 'taskview', 'on')
      expect(registered).toEqual(['checklist'])
      await command($, 'tasks')
      expect(registered).toEqual(['checklist', 'agent_progress'])
    })

    test('a saved view offers its tool when the session starts', async ($, on) => {
      await start($, on, { usd: 0 }, { viewMode: 'clean' })
      expect(registered).toEqual(['checklist'])
    })

    test('the mascot follows nothing while his option is off, and starts from where things stand when turned on', async ($, on) => {
      on('prompt.submit', (_, e) => ({ text: e.text }))
      await start($, on, { usd: 0 }, { settings: { mascot: false } }, [
        { role: 'user', text: 'Pick a color', toolUses: [] },
        { role: 'assistant', text: 'Which one do you want?', toolUses: [] },
      ])
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.turn.complete({ ...complete('t1'), answer: 'Which one do you want?' })
      await toggleOption($, 'mascot')
      const ui = await $.ui.mount(band())
      expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Clawd looking puzzled')
      await ui.unmount()
    })
  })

  describe('Branches', () => {
    const BR = { plugin: 'aitools', surface: 'desktop' as const, component: 'Pane' as const, requestId: 'branches', props: PANE }
    const run = (on$: Engine, command: string) =>
      on$.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

    type Tree = { path: string; branch: string; changed: string; ahead: string }
    type Ref = { name: string; sha: string; ahead: number; local: boolean; remote: boolean; unpushed?: number }
    /**
     * A repository checked out in /p on main, with three worktrees (done, with changes, with unpushed commits) and a
     * branch only the remote has, merged long ago.
     */
    type Repo = { calls: string[]; trees: Tree[]; refs: Ref[]; prs: object[]; fetching: Promise<void> | null }

    /** Answers git and gh as that repository would, recording each command; what is removed leaves it. */
    function fakeRepo(on: On): Repo {
      const repo: Repo = {
        calls: [],
        trees: [
          { path: '/p', branch: 'main', changed: '', ahead: '0' },
          { path: '/p/wt/done', branch: 'feat/done', changed: '', ahead: '0' },
          { path: '/p/wt/dirty', branch: 'feat/dirty', changed: ' M a.ts\n?? b.ts\n', ahead: '0' },
          { path: '/p/wt/wip', branch: 'feat/wip', changed: '', ahead: '2' },
        ],
        refs: [
          { name: 'main', sha: 'm', ahead: 0, local: true, remote: true },
          { name: 'feat/done', sha: 'd', ahead: 0, local: true, remote: true },
          { name: 'feat/dirty', sha: 'y', ahead: 0, local: true, remote: true },
          { name: 'feat/wip', sha: 'w', ahead: 2, local: true, remote: false },
          { name: 'old', sha: 'o', ahead: 0, local: false, remote: true },
        ],
        prs: [],
        fetching: null,
      }
      on('session.cwd', () => ({ value: '/p' }))
      on('tool.call', () => ({ result: 'done' }))
      const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
      const at = Math.floor(NOW / 1000) - 3600
      on('process.run', (_, e) => {
        const [cmd, ...args] = e.argv
        const cwd = e.init?.cwd ?? '/p'
        repo.calls.push(`${cmd} ${args.join(' ')}`)
        const tree = repo.trees.find(t => t.path === cwd)
        if (args[0] === 'fetch' && repo.fetching !== null) {
          return repo.fetching.then(() => ok())
        }
        if (cmd === 'gh') {
          return ok(args[0] === 'pr' ? JSON.stringify(repo.prs) : JSON.stringify(repo.refs.map(r => ({ headSha: r.sha, status: 'completed', conclusion: 'success' }))))
        }
        switch (args[0]) {
          case 'rev-parse':
            return ok('/p\n')
          case 'symbolic-ref':
            return ok('origin/main\n')
          case 'worktree':
            if (args[1] === 'list') {
              return ok(repo.trees.map(t => `worktree ${t.path}\nHEAD ${repo.refs.find(r => r.name === t.branch)?.sha}\nbranch refs/heads/${t.branch}\n`).join('\n'))
            }
            if (args[1] === 'remove') {
              repo.trees = repo.trees.filter(t => t.path !== args.at(-1))
            }
            return ok()
          case 'for-each-ref':
            return ok(
              repo.refs
                .flatMap(r => [
                  ...(r.local ? [`refs/heads/${r.name}\t${r.sha}\t${at}\t${r.remote ? `refs/remotes/origin/${r.name}` : ''}\t\t${r.ahead} 0`] : []),
                  ...(r.remote ? [`refs/remotes/origin/${r.name}\t${r.sha}\t${at}\t\t\t${r.ahead} 0`] : []),
                ])
                .join('\n'),
            )
          case 'branch':
            repo.refs = repo.refs.map(r => (r.name === args.at(-1) ? { ...r, local: false } : r))
            return ok()
          case 'push':
            repo.refs = repo.refs.map(r => (r.name === args.at(-1) ? { ...r, remote: false } : r))
            return ok()
          case 'status':
            return ok(tree?.changed ?? '')
          case 'rev-list':
            // The base's own line, or the commits it lacks: feat/wip's two, grown from main.
            return ok(args[1] === '--first-parent' ? 'm\n' : 'w w1\nw1 m\n')
          case 'merge-base':
            return ok('m\n')
          case 'diff':
            return ok(' 2 files changed, 10 insertions(+), 3 deletions(-)\n')
          default:
            return ok()
        }
      })

      return repo
    }

    async function paneText($: Engine): Promise<string> {
      const pane = await $.ui.mount(BR)
      const text = (await pane.findAll({ type: 'Text' })).map(t => t.text).join('')
      await pane.unmount()

      return text
    }

    test('nothing is read while the pane is closed; open, it fetches and reads git and GitHub, and keeps reading', async ($, on) => {
      const repo = fakeRepo(on)
      // The project row looks for a GitHub remote whether the pane is open or not; those reads are its own.
      const rowCalls = new Set(['git rev-parse --show-toplevel', 'git rev-parse --path-format=absolute --git-common-dir', 'git remote -v'])
      const paneCalls = () => repo.calls.filter(c => !rowCalls.has(c))
      await start($, on, { usd: 0 })
      await clock.advance(60_000)
      expect(paneCalls()).toEqual([])
      expect((await run($, 'branches')).text).toBe('Branches open.')
      await clock.settle()
      expect(repo.calls).toContain('git worktree list --porcelain')
      expect(repo.calls).toContain('git fetch --prune --quiet origin')
      expect(repo.calls.some(c => c.startsWith('gh pr list'))).toBe(true)
      const text = await paneText($)
      expect(text).toContain('5 branches · 3 worktrees · 2 done')
      expect(text).toContain('Clean up removes 2 done branches: 1 worktree, 1 local and 2 remote branches.')
      expect(text).toContain('feat/dirty · 2 changed')
      expect(text).toContain('feat/wip · 2 unpushed')
      expect(text).toContain('+10-3')
      const reads = repo.calls.length
      await clock.advance(5 * 60_000)
      expect(repo.calls.length).toBeGreaterThan(reads)
      expect((await run($, 'branches')).text).toBe('Branches closed.')
      const closed = paneCalls().length
      await clock.advance(120_000)
      await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
      await clock.advance(5000)
      expect(paneCalls().length).toBe(closed)
    })

    test('GitHub and a fetch on open and every 5 minutes after; Refresh does both now and restarts the wait', async ($, on) => {
      const repo = fakeRepo(on)
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const prLists = () => repo.calls.filter(c => c.startsWith('gh pr list')).length
      const fetches = () => repo.calls.filter(c => c.startsWith('git fetch')).length
      expect([prLists(), fetches()]).toEqual([1, 1])
      await clock.advance(4 * 60_000 + 50_000)
      expect(prLists()).toBe(1)
      await clock.advance(10_000)
      expect([prLists(), fetches()]).toEqual([2, 2])
      await clock.advance(2 * 60_000)
      const pane = await $.ui.mount(BR)
      const keys = (await pane.findAll({ type: 'Button' })).map(b => b.key)
      expect(keys.slice(keys.indexOf('clean'), keys.indexOf('clean') + 2)).toEqual(['clean', 'refresh'])
      await pane.press({ key: 'refresh' })
      await clock.settle()
      await pane.unmount()
      expect([prLists(), fetches()]).toEqual([3, 3])
      await clock.advance(4 * 60_000 + 50_000)
      expect(prLists()).toBe(3)
      await clock.advance(10_000)
      expect(prLists()).toBe(4)
    })

    test('the open pane reads only every 5 minutes: a tool that changes files waits for the next read', async ($, on) => {
      const repo = fakeRepo(on)
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const lists = () => repo.calls.filter(c => c === 'git worktree list --porcelain').length
      const before = lists()
      await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts' } as never)
      await clock.advance(4 * 60_000)
      expect(lists()).toBe(before)
      await clock.advance(60_000)
      expect(lists()).toBeGreaterThan(before)
    })

    test('the rows show from git before the fetch is in, and are read again once it is', async ($, on) => {
      const repo = fakeRepo(on)
      let fetched = () => {}
      repo.fetching = new Promise(resolve => (fetched = resolve))
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      expect(await paneText($)).toContain('5 branches · 3 worktrees · 2 done')
      const lists = () => repo.calls.filter(c => c === 'git worktree list --porcelain').length
      const before = lists()
      fetched()
      await clock.settle()
      expect(lists()).toBe(before + 1)
    })

    test('each read is a few git commands, whatever the number of branches', async ($, on) => {
      const repo = fakeRepo(on)
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const git = (args: string) => repo.calls.filter(c => c.startsWith(`git ${args}`)).length
      expect(git('rev-list --parents')).toBe(2)
      expect(git('diff-tree')).toBe(1)
      expect(git('log --no-walk')).toBe(2)
      // Only the worktree with changes reads its lines in its own folder.
      expect(git('diff --shortstat')).toBe(2)
      expect(git('merge-base')).toBe(0)
    })

    test('Clean up asks first, then removes only the done branches: worktree, local and remote branch', async ($, on) => {
      const repo = fakeRepo(on)
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const pane = await $.ui.mount(BR)
      expect((await pane.find({ type: 'Button', key: 'clean' }))?.text).toBe('Clean up 2 done')
      await pane.press({ key: 'clean' })
      expect(await pane.find({ text: 'Remove 1 worktree, 1 local and 2 remote branches?' })).toBeDefined()
      expect(repo.calls.some(c => /remove|branch -D|push/.test(c))).toBe(false)
      await pane.press({ key: 'clean-yes' })
      await clock.settle()
      expect((await pane.find({ type: 'Svg' }))?.props.alt).toBe('Clawd sweeping up')
      expect(repo.calls).toContain('git worktree remove /p/wt/done')
      expect(repo.calls).toContain('git branch -D feat/done')
      expect(repo.calls).toContain('git push origin --delete feat/done')
      expect(repo.calls).toContain('git push origin --delete old')
      expect(repo.calls.filter(c => c.includes('dirty') || c.includes('wip')).filter(c => /remove|branch -D|push/.test(c))).toEqual([])
      await clock.advance(3000)
      expect(await pane.find({ text: 'Removed 1 worktree, 1 local branch, 2 remote branches.' })).toBeDefined()
      expect((await pane.find({ type: 'Svg' }))?.props.alt).toBe('Clawd asleep under a tree')
      await pane.unmount()
    })

    test('deleting a row with unpushed commits says what it takes and loses, then forces', async ($, on) => {
      const repo = fakeRepo(on)
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const pane = await $.ui.mount(BR)
      expect(await pane.find({ key: 'delete-main' })).toBeUndefined()
      await pane.press({ key: 'delete-feat/wip' })
      expect(await pane.find({ text: 'Delete feat/wip (worktree and local branch)?' })).toBeDefined()
      expect(await pane.find({ text: 'This loses 2 commits not on the base branch.' })).toBeDefined()
      await pane.press({ key: 'delete-no-feat/wip' })
      expect(await pane.find({ key: 'delete-yes-feat/wip' })).toBeUndefined()
      // × again takes the question back.
      await pane.press({ key: 'delete-feat/wip' })
      await pane.press({ key: 'delete-feat/wip' })
      expect(await pane.find({ key: 'delete-yes-feat/wip' })).toBeUndefined()
      await pane.press({ key: 'delete-feat/wip' })
      await pane.press({ key: 'delete-yes-feat/wip' })
      await clock.advance(3000)
      expect(repo.calls).toContain('git worktree remove --force /p/wt/wip')
      expect(repo.calls).toContain('git branch -D feat/wip')
      expect(repo.calls.some(c => c.startsWith('git push'))).toBe(false)
      await pane.unmount()
    })

    test('the filters: Local or Remote, then Done or Active', async ($, on) => {
      fakeRepo(on)
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const pane = await $.ui.mount(BR)
      const names = async () =>
        (await pane.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^(main|feat\/[a-z]+|old)$/.test(t))
      expect(await picks(pane, 'where-')).toEqual(['where-both', 'where-local', 'where-remote'])
      expect(await picks(pane, 'show-')).toEqual(['show-all', 'show-active', 'show-done'])
      expect(await names()).toEqual(['main', 'feat/dirty', 'feat/wip', 'feat/done', 'old'])
      await pane.press({ key: 'where-remote' })
      expect(await names()).toEqual(['main', 'feat/dirty', 'feat/done', 'old'])
      await pane.press({ key: 'show-done' })
      expect(await names()).toEqual(['feat/done', 'old'])
      await pane.press({ key: 'where-local' })
      expect(await names()).toEqual(['feat/done'])
      expect(await pick(pane, 'where-local')).toBe('[x] Local')
      await pane.unmount()
    })

    test('every row keeps its columns the same width, with or without a delete button, asking or not', async ($, on) => {
      fakeRepo(on)
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const pane = await $.ui.mount(BR)
      await pane.press({ key: 'delete-feat/wip' })
      const cells = await pane.findAll({ type: 'Box' })
      const widths = (key: string) => cells.filter(b => b.props.key === key).map(b => b.props.width)
      // The titles' row too, for the columns it names; then one per branch.
      for (const [key, width] of [['on', 8], ['out', 12], ['age', 4], ['pr', 7], ['ci', 3], ['delete', 3]] as const) {
        expect(widths(key)).toEqual(Array(6).fill(width))
      }
      for (const [key, width] of [['added', 6], ['removed', 6]] as const) {
        expect(widths(key)).toEqual(Array(5).fill(width))
      }
      await pane.unmount()
    })

    test("a done row is all faint, a ✓ included; a PR number opens the PR on GitHub", async ($, on) => {
      const repo = fakeRepo(on)
      const url = 'https://github.com/o/r/pull/12'
      repo.prs = [{ number: 12, url, state: 'MERGED', headRefName: 'feat/done', headRefOid: 'd', statusCheckRollup: [] }]
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const pane = await $.ui.mount(BR)
      const texts = await pane.findAll({ type: 'Text' })
      const row = (name: string) => {
        const from = texts.findIndex(t => t.text === name)
        const to = texts.findIndex((t, i) => i > from && /^(main|feat\/[a-z]+|old)$/.test(t.text))
        return texts.slice(from - 1, to === -1 ? undefined : to - 1)
      }
      const done = row('feat/done')
      expect(done[0]?.text).toBe('✓ ')
      expect(done.filter(t => t.text.trim() !== '').map(t => t.props.color)).toEqual(done.filter(t => t.text.trim() !== '').map(() => FAINT_TEXT))
      expect(row('feat/dirty').find(t => t.text === '+10')?.props.color).toBe(GREEN)
      await pane.press({ key: 'pr-12' })
      await clock.settle()
      expect(repo.calls).toContain(`xdg-open ${url}`)
      await pane.unmount()
    })

    test("a row's name and note are drawn whole, for the layout to cut at the pane's edge, the note first", async ($, on) => {
      const repo = fakeRepo(on)
      repo.trees[3]!.branch = 'feat/a-very-long-branch-name-about-owl-mascot-guest-avatars'
      repo.refs[3]!.name = 'feat/a-very-long-branch-name-about-owl-mascot-guest-avatars'
      await start($, on, { usd: 0 })
      await run($, 'branches')
      await clock.settle()
      const pane = await $.ui.mount(BR)
      const texts = await pane.findAll({ type: 'Text' })
      const long = texts.find(t => t.text.startsWith('feat/a-very-long-branch-name-about-owl-mascot-guest-avatars'))
      expect(long?.props.wrap).toBe('truncate-end')
      const note = texts.find(t => t.text === ' · 2 changed')
      expect(note?.props.wrap).toBe('truncate-end')
      const boxes = await pane.findAll({ type: 'Box' })
      expect(boxes.some(b => b.props.flexShrink === NOTE_SHRINK && b.props.minWidth === 0)).toBe(true)
      await pane.unmount()
    })

    test("the 🛠 menu's Branches opens the pane; with nothing to clean up Clawd naps", async ($, on) => {
      const repo = fakeRepo(on)
      repo.trees = repo.trees.slice(0, 1)
      repo.refs = repo.refs.slice(0, 1)
      const panes = await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tools' })
      expect((await ui.find({ key: 'branches' }))?.text).toBe('Branches')
      await ui.press({ key: 'branches' })
      await ui.unmount()
      expect(panes.open.has('branches')).toBe(true)
      await clock.settle()
      const pane = await $.ui.mount(BR)
      expect((await pane.find({ type: 'Svg' }))?.props.alt).toBe('Clawd asleep under a tree')
      expect(await pane.find({ text: "Nothing to clean up: every branch has work that isn't on main yet." })).toBeDefined()
      await pane.unmount()
    })
  })

  describe('/keepwarm', () => {
    const run = ($: Engine, args: string) =>
      $.command.run({ command: 'keepwarm', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
    const warm = { input_tokens: 4, output_tokens: 2, cache_read_input_tokens: 62_000, cache_creation_input_tokens: 30 }
    type Reply = { isAnswered: true; text: string; usage: typeof warm } | { isAnswered: false; reason: 'api-error'; status: number; error: string; usage: typeof warm }
    /** Answers `$.model.fork` with `reply` (a warm read by default), recording each prompt sent. */
    function forks(on: On, reply: () => Reply = () => ({ isAnswered: true, text: 'warm', usage: warm })) {
      const sent: string[] = []
      on('model.fork', (_, e) => {
        sent.push(e.prompt)
        return { value: reply() as never }
      })
      return sent
    }
    const status = async ($: Engine) => (await run($, 'status')).text ?? ''

    test('pings five minutes before the cache lapses, again 55 minutes after, and ends on time', async ($, on) => {
      const sent = forks(on)
      await start($, on, { usd: 0 }, { settings: { cacheWarmth: false } })
      await step($)
      expect((await run($, '2h')).text).toMatch(/^Keeping the cache warm for 2h0m more, until .+\. Next ping in 55m\./)
      await clock.advance(55 * 60_000 - 1)
      expect(sent).toEqual([])
      await clock.advance(1)
      expect(sent).toEqual(['Reply with the single word: warm'])
      expect(await status($)).toContain('Last ping read 62k tokens, $0.01.')
      // The ping restarted the cache's hour: the next is due 55 minutes after it.
      await clock.advance(55 * 60_000)
      expect(sent).toHaveLength(2)
      // Warm past the window's end now: no third ping, and the window ends at two hours.
      await clock.advance(10 * 60_000)
      expect(sent).toHaveLength(2)
      expect(await status($)).toMatch(/^Keepwarm is off\. \/keepwarm/)
    })

    test('a ping that finds the cache gone stops it, and says why', async ($, on) => {
      const sent = forks(on, () => ({ isAnswered: true, text: 'warm', usage: { ...warm, cache_read_input_tokens: 0, cache_creation_input_tokens: 62_000 } }))
      await start($, on, { usd: 0 })
      await step($)
      await run($, '3h')
      await clock.advance(55 * 60_000)
      expect(sent).toHaveLength(1)
      expect(await status($)).toContain('It stopped early: the ping read 0 and wrote 62k tokens, so the cache had already lapsed.')
      await clock.advance(55 * 60_000)
      expect(sent).toHaveLength(1)
    })

    test('a failed ping stops it too, with the reason', async ($, on) => {
      forks(on, () => ({ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: warm }))
      await start($, on, { usd: 0 })
      await step($)
      await run($, '3h')
      await clock.advance(55 * 60_000)
      expect(await status($)).toContain('It stopped early: the API call failed (529).')
    })

    test('no ping while a turn runs; a cache that outlives keepwarm needs none', async ($, on) => {
      const sent = forks(on)
      await start($, on, { usd: 0 })
      await step($)
      await run($, '30m')
      await clock.advance(60 * 60_000)
      expect(sent).toEqual([])

      await step($)
      await run($, '3h')
      await $.turn.start({ text: 'go', turnId: 't2' })
      await clock.advance(56 * 60_000)
      expect(sent).toEqual([])
    })

    test('a window this session saved comes back after a restart', async ($, on) => {
      forks(on)
      await start($, on, { usd: 0 }, { 'keepWarm:session-1': NOW + 3 * 60 * 60_000 })
      expect(await status($)).toMatch(/^Keeping the cache warm for 3h0m more/)
    })

    test('the bar shows its marker left of tools, right of ?, until /keepwarm off', async ($, on) => {
      forks(on)
      on('prompt.submit', (_, e) => ({ text: e.text }))
      await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      expect(await ui.find({ key: 'keepwarm' })).toBeUndefined()
      await run($, '5h')
      await $.turn.complete({ ...complete('t1'), answer: 'Which one should stay?' })
      const order = (await ui.findAll({})).map(n => n.key).filter(k => k === 'askme' || k === 'keepwarm' || k === 'tools')
      expect(order).toEqual(['askme', 'keepwarm', 'tools'])
      expect(await ui.find({ text: '\u263C' })).toBeDefined()
      expect((await run($, 'off')).text).toMatch(/^Keepwarm stopped/)
      expect(await ui.find({ key: 'keepwarm' })).toBeUndefined()
      await ui.unmount()
    })

    test('refuses a time it cannot read', async ($, on) => {
      await start($, on, { usd: 0 })
      expect((await run($, 'soon')).text).toMatch(/^Keeps the prompt cache warm/)
      expect((await run($, 'help')).text).toContain('/keepwarm 90m')
      expect((await run($, '')).text).toMatch(/^Keeping the cache warm for 6h0m more/)
    })
  })

  describe('project row', () => {
    const GLOBAL = '/home/test/.claude/aitools.json'
    const PROJECT = '/r/.claude/aitools.json'
    type World = {
      files: Map<string, string>
      calls: string[]
      opened: string[]
      remote: string
      branch: string
      listener: string
      /** The branch refs `git for-each-ref` lists. */
      refs: string[]
      spawned: string[][]
      /** Ends the running server child, as its process exiting would. */
      endServer: () => void
    }

    /** A checkout at /r with a GitHub remote, a disk of `files`, a browser, `ss`, `gh` and a server to spawn. */
    function world(on: On, files: Record<string, string> = {}): World {
      const w: World = { files: new Map(Object.entries(files)), calls: [], opened: [], remote: 'git@github.com:pkkid/vowelit.git', branch: 'main', listener: '', refs: [], spawned: [], endServer: () => undefined }
      on('session.cwd', () => ({ value: '/r' }))
      on('fs.exists', (_, e) => ({ value: w.files.has(e.path) }))
      on('fs.read', (_, e) => ({ value: w.files.get(e.path) ?? '' }))
      on('fs.write', (_, e) => {
        w.files.set(e.path, e.text)
        return { value: undefined }
      })
      const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
      on('process.run', (_, e) => {
        const [cmd, ...given] = e.argv
        // `git -C <dir> …` reads another folder: the same answers.
        const args = given[0] === '-C' ? given.slice(2) : given
        w.calls.push(e.argv.join(' '))
        if (cmd === 'git' && args[0] === 'rev-parse') return ok(args[1] === '--show-toplevel' ? '/r\n' : '/r/.git\n')
        if (cmd === 'git' && args[0] === 'remote') return ok(`origin\t${w.remote} (fetch)\norigin\t${w.remote} (push)\n`)
        if (cmd === 'git' && args[0] === 'branch') return ok(`${w.branch}\n`)
        if (cmd === 'git' && args[0] === 'symbolic-ref') return ok('origin/main\n')
        if (cmd === 'git' && args[0] === 'for-each-ref') return ok(w.refs.join('\n'))
        if (cmd === 'gh' && args[1] === 'graphql' && args.includes('login=pkkid')) return ok(JSON.stringify(BOARD_ANSWER))
        if (cmd === 'gh' && args[1] === 'graphql') return ok(JSON.stringify({ data: { repository: { projectsV2: { totalCount: 1, nodes: [{ url: 'https://github.com/users/pkkid/projects/1' }] } } } }))
        if (cmd === 'gh' && args[1]?.includes('/issues/')) return ok(`Issue ${args[1].split('/').at(-1)} title\n`)
        if (cmd === 'xdg-open') {
          w.opened.push(args[0] ?? '')
          return ok()
        }
        if (cmd === 'ss') return ok(w.listener)
        if (cmd === 'readlink') return ok('/r\n')
        return ok()
      })
      on('process.spawn', async function* (_, e) {
        w.spawned.push([...e.argv])
        let end = () => undefined as void
        const ended = new Promise<void>(resolve => {
          end = resolve
        })
        w.endServer = end
        if (e.argv.some(arg => arg.endsWith('serve'))) {
          yield { stream: 'stdout' as const, text: 'building\nLocal preview ready: http://localhost:8000\n' }
          await ended
          return { value: { code: null, signal: 'SIGTERM' } }
        }
        yield { stream: 'stdout' as const, text: 'all 3 tests passed\n' }
        return { value: { code: 0, signal: null } }
      })
      on('ui.scroll', () => ({}))
      return w
    }

    /** The board's items as GitHub answers the Project pane's query: one in progress with a PR, one to do, one done. */
    const BOARD_ANSWER = {
      data: {
        repositoryOwner: {
          projectV2: {
            title: 'Vowelit',
            url: 'https://github.com/users/pkkid/projects/1',
            all: { totalCount: 3 },
            field: { options: [{ name: 'Todo' }, { name: 'In Progress' }, { name: 'Done' }] },
            open: {
              totalCount: 2,
              nodes: [
                { type: 'ISSUE', status: { name: 'In Progress' }, content: { number: 181, title: 'Lobby: show who is ready', url: 'https://github.com/pkkid/vowelit/issues/181', state: 'OPEN', repository: { nameWithOwner: 'pkkid/vowelit' }, closedByPullRequestsReferences: { nodes: [{ number: 183, url: 'https://github.com/pkkid/vowelit/pull/183', state: 'OPEN' }] } } },
                { type: 'DRAFT_ISSUE', status: { name: 'Todo' }, content: { title: 'Idea: daily puzzle' } },
              ],
            },
            done: {
              nodes: [
                { type: 'ISSUE', status: { name: 'Done' }, content: { number: 170, title: 'Admin page', url: 'https://github.com/pkkid/vowelit/issues/170', state: 'CLOSED', repository: { nameWithOwner: 'pkkid/vowelit' }, closedByPullRequestsReferences: { nodes: [] } } },
              ],
            },
          },
        },
      },
    }

    const rowText = async ($: Engine) => {
      const ui = await $.ui.mount(band())
      const keys = (await ui.findAll({})).map(n => n.key).filter((k): k is string => typeof k === 'string' && (k.startsWith('project-') || k.startsWith('tool-')))
      const text = Object.fromEntries(await Promise.all(keys.map(async k => [k, (await ui.find({ key: k }))?.text] as const)))
      await ui.unmount()
      return text
    }
    const say = ($: Engine, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

    test('the settings pane writes the name and board into the project file, keeping its tools; a bad URL says why', async ($, on) => {
      const w = world(on, { [PROJECT]: JSON.stringify({ mine: 'kept', project: { tools: [{ type: 'link', label: 'Docs', url: 'https://x' }] } }) })
      await start($, on, { usd: 0 })
      await clock.settle()
      const pane = await $.ui.mount(SETTINGS)
      expect(await pane.find({ text: "This project's: /r/.claude/aitools.json" })).toBeDefined()
      expect(await pane.find({ text: 'Docs. Edit project.tools in the file.' })).toBeDefined()
      await pane.input({ key: 'project-name', text: 'Vowelit Game', kind: 'submit' })
      await pane.input({ key: 'project-board', text: 'https://github.com/pkkid/vowelit', kind: 'submit' })
      expect(await pane.find({ text: /isn't a GitHub Project's URL/ })).toBeDefined()
      await pane.input({ key: 'project-board', text: 'https://github.com/users/pkkid/projects/1', kind: 'submit' })
      expect(await pane.find({ text: /isn't a GitHub Project's URL/ })).toBeUndefined()
      const file = JSON.parse(w.files.get(PROJECT) ?? '{}')
      expect(file).toEqual({
        mine: 'kept',
        project: { tools: [{ type: 'link', label: 'Docs', url: 'https://x' }], name: 'Vowelit Game', board: 'https://github.com/users/pkkid/projects/1' },
      })
      expect((await rowText($))['project-name']).toBe('Vowelit Game')
      // Off in this repository: the row goes, and the file says so.
      await pane.press({ key: 'project-enabled' })
      expect(JSON.parse(w.files.get(PROJECT) ?? '{}').project.enabled).toBe(false)
      expect(await rowText($)).toEqual({})
      await pane.press({ key: 'project-enabled' })
      expect(JSON.parse(w.files.get(PROJECT) ?? '{}').project.enabled).toBeUndefined()
      expect((await rowText($))['project-name']).toBe('Vowelit Game')
      // The global one hides it in every project, and leaves this project's own as it was.
      await pane.press({ key: 'projectRow' })
      expect(JSON.parse(w.files.get(GLOBAL) ?? '{}').bar.show.projectRow).toBe(false)
      expect(await rowText($)).toEqual({})
      expect(await pane.find({ text: /Show project row is off in every project/ })).toBeDefined()
      expect(await pane.find({ text: 'Saved for vowelit only' })).toBeDefined()
      await pane.unmount()
      expect(w.files.has(GLOBAL)).toBe(true)
    })

    test('outside a GitHub repository there is no row', async ($, on) => {
      const w = world(on)
      w.remote = 'https://gitlab.com/pkkid/vowelit.git'
      await start($, on, { usd: 0 })
      expect(await rowText($)).toEqual({})
    })

    test("the branches besides main show after the board's items, local and remote counted once; pressing it opens their pane", async ($, on) => {
      const w = world(on)
      w.refs = ['refs/heads/main', 'refs/heads/feat/a', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main', 'refs/remotes/origin/feat/a', 'refs/remotes/origin/feat/b']
      const panes = await start($, on, { usd: 0 })
      const ui = await $.ui.mount(band())
      const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('project-'))
      expect(keys).toEqual(['project-name', 'project-board', 'project-branches'])
      expect((await ui.find({ key: 'project-branches' }))?.text).toBe('2 branches')
      await ui.press({ key: 'project-branches' })
      await ui.unmount()
      expect(panes.open.has('branches')).toBe(true)
      // Only main left: no button, and it is read again with the repository every 30 seconds.
      w.refs = ['refs/heads/main', 'refs/remotes/origin/main']
      await clock.advance(30_000)
      expect((await rowText($))['project-branches']).toBeUndefined()
    })

    test('the checklist sits between the bar and the project row', async ($, on) => {
      world(on)
      await start($, on, { usd: 0 }, { viewMode: 'task' })
      await $.tool.call({ tool: 'mcp__aitools__checklist', title: 'Dark mode', items: [{ text: 'Add the tokens', status: 'doing' }] })
      // The whole band's text in order, buttons (the project row's name) included.
      const ui = await $.ui.mount(band())
      const text = (await ui.findAll({}))[0]?.text ?? ''
      await ui.unmount()
      expect(text.indexOf('AI Tools')).toBeLessThan(text.indexOf('Dark mode'))
      expect(text.indexOf('Dark mode')).toBeLessThan(text.indexOf('vowelit'))
    })

    test("the repository's name and the first prompt's issue open in the browser; the board's open items, its pane", async ($, on) => {
      const w = world(on)
      on('prompt.submit', (_, e) => ({ text: e.text }))
      const panes = await start($, on, { usd: 0 })
      await say($, 'Please fix #42 today')
      await say($, 'and #50 too')
      const row = await rowText($)
      expect(row['project-name']).toBe('vowelit')
      expect(row['project-board']).toBe('2 project items')
      expect(row['project-issue']).toBe('#42 Issue 42 title')
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'project-name' })
      await ui.press({ key: 'project-board' })
      await ui.press({ key: 'project-issue' })
      await ui.unmount()
      await clock.settle()
      expect(w.opened).toEqual(['https://github.com/pkkid/vowelit', 'https://github.com/pkkid/vowelit/issues/42'])
      expect(panes.open.has('project')).toBe(true)
    })

    test("the row's count is read every 5 minutes with the pane closed, and not at all once the row is hidden", async ($, on) => {
      const w = world(on)
      const reads = () => w.calls.filter(c => c.includes('login=pkkid')).length
      await start($, on, { usd: 0 })
      expect(reads()).toBe(1)
      await clock.advance(5 * 60_000)
      expect(reads()).toBe(2)
      await $.command.run({ command: 'aitools', args: 'project off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
      await clock.advance(15 * 60_000)
      expect(reads()).toBe(2)
      expect((await rowText($))['project-board']).toBeUndefined()
    })

    test('while background tasks run, the row counts them after the name; pressing it opens their pane', async ($, on) => {
      world(on)
      on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'm1', persistent: true } }))
      on('prompt.submit', (_, e) => ({ text: e.text }))
      const panes = await start($, on, { usd: 0 })
      expect((await rowText($))['project-tasks']).toBeUndefined()
      await $.tool.call({ tool: 'Monitor', description: 'Dev server up', command: 'curl localhost:3000', persistent: true } as never)
      expect((await rowText($))['project-tasks']).toBe('1 bg task')
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'project-tasks' })
      await ui.unmount()
      expect(panes.open.has('tasks')).toBe(true)
      const done = '<task-notification>\n<task-id>m1</task-id>\n<status>completed</status>\n</task-notification>'
      await $.prompt.submit({ text: done, wait: false, origin: { kind: 'task-notification' } as never })
      expect((await rowText($))['project-tasks']).toBeUndefined()
    })

    test('the branch names the issue when the first prompt does not; the prompt wins when both do', async ($, on) => {
      const w = world(on)
      w.branch = 'feat/77-login'
      on('prompt.submit', (_, e) => ({ text: e.text }))
      await start($, on, { usd: 0 })
      expect((await rowText($))['project-issue']).toBe('#77 Issue 77 title')
      await say($, 'Work on #42')
      expect((await rowText($))['project-issue']).toBe('#42 Issue 42 title')
    })

    test("the project's file: its name, no board, and tools on the right", async ($, on) => {
      const w = world(on, {
        [PROJECT]: JSON.stringify({ project: { name: 'Vowelit', board: false, tools: [{ type: 'link', label: 'Docs', url: 'https://docs/{branch}' }, { type: 'command', label: 'Test', run: ['npm', 'test'] }] } }),
      })
      await start($, on, { usd: 0 })
      const row = await rowText($)
      expect(row['project-name']).toBe('Vowelit')
      expect(row['project-board']).toBeUndefined()
      expect(w.calls.some(c => c.includes('graphql'))).toBe(false)
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tool-docs' })
      await ui.press({ key: 'tool-test-run' })
      await clock.settle()
      expect(w.opened).toEqual(['https://docs/main'])
      expect(w.spawned).toEqual([['npm', 'test']])
      expect(await ui.find({ text: '● ' })).toBeDefined()
      await ui.unmount()
      const log = await $.ui.mount({ plugin: 'aitools', surface: 'desktop', component: 'Pane', requestId: 'aitools-log-test', props: { ...PANE, title: 'Test log' } })
      expect((await log.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['$ npm test', 'all 3 tests passed'])
      await log.unmount()
    })

    test('a server: Start runs it, its status follows its output, Stop runs its stop command', async ($, on) => {
      const w = world(on, {
        [PROJECT]: JSON.stringify({ project: { tools: [{ type: 'server', label: 'Server', start: ['{main}/serve', '{checkout}'], stop: ['{main}/stop', '{checkout}'], ready: 'ready: (\\S+)' }] } }),
      })
      await start($, on, { usd: 0 })
      expect(await rowText($)).toMatchObject({ 'tool-server-log': 'Stopped', 'tool-server-start': 'Start Server' })
      const ui = await $.ui.mount(band())
      await ui.press({ key: 'tool-server-start' })
      await clock.settle()
      expect(w.spawned).toEqual([['/r/serve', '/r']])
      expect((await ui.find({ key: 'tool-server-log' }))?.text).toBe('Running main')
      await ui.press({ key: 'tool-server-stop' })
      await clock.settle()
      expect(w.calls).toContain('/r/stop /r')
      w.endServer()
      await clock.settle()
      expect((await ui.find({ key: 'tool-server-start' }))?.text).toBe('Start Server')
      await ui.unmount()
    })

    test('a server started elsewhere shows as running from what listens on its port', async ($, on) => {
      const w = world(on, { [PROJECT]: JSON.stringify({ project: { tools: [{ type: 'server', label: 'Server', start: 'serve', port: 8000 }] } }) })
      w.listener = 'LISTEN 0 511 127.0.0.1:8000 0.0.0.0:* users:(("node",pid=4321,fd=20))'
      w.branch = 'feat/elsewhere'
      await start($, on, { usd: 0 })
      await clock.advance(3000)
      expect(await rowText($)).toMatchObject({ 'tool-server-log': 'Running feat/elsewhere', 'tool-server-stop': 'Stop Server' })
    })

    test('/aitools project off hides the row everywhere, saved to the global file', async ($, on) => {
      const w = world(on)
      await start($, on, { usd: 0 })
      const run = (args: string) => $.command.run({ command: 'aitools', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
      expect((await run('project off')).text).toMatch(/^Project row hidden/)
      expect(await rowText($)).toEqual({})
      expect(JSON.parse(w.files.get(GLOBAL) ?? '{}').bar.show.projectRow).toBe(false)
      expect((await run('project')).text).toBe('Project row shown.')
      expect((await rowText($))['project-name']).toBe('vowelit')
    })

    describe('Project pane', () => {
      const PP = { plugin: 'aitools', surface: 'desktop' as const, component: 'Pane' as const, requestId: 'project', props: { ...PANE, title: 'Project' } }
      const reads = (w: World) => w.calls.filter(c => c.includes('login=pkkid')).length
      const openPane = async ($: Engine) => {
        const ui = await $.ui.mount(band())
        await ui.press({ key: 'tools' })
        await ui.press({ key: 'project' })
        await ui.unmount()
        await clock.settle()
      }
      const paneTexts = async ($: Engine) => {
        const pane = await $.ui.mount(PP)
        const texts = (await pane.findAll({})).map(n => n.text).filter((t): t is string => typeof t === 'string' && t !== '')
        await pane.unmount()
        return texts
      }

      test('the 🛠 menu opens it; one query shows the open items with their status and PR, and Clawd stacking', async ($, on) => {
        const w = world(on)
        const { opened } = await start($, on, { usd: 0 })
        // The project row's count reads the board once; the pane opens on that read.
        expect(reads(w)).toBe(1)
        await openPane($)
        expect(opened).toContain('project')
        expect(reads(w)).toBe(1)
        const pane = await $.ui.mount(PP)
        const texts = (await pane.findAll({})).map(n => n.text).join('|')
        expect(texts).toContain('Vowelit')
        expect(texts).toContain('3 items · updated just now')
        expect(texts).toContain('Lobby: show who is ready')
        expect(texts).toContain('● In Progress')
        expect(texts).toContain('Idea: daily puzzle')
        expect(texts).not.toContain('Admin page')
        expect((await pane.find({ key: 'filter-open' }))?.text).toBe('● Open 2')
        expect((await pane.find({ type: 'Svg' }))?.props.alt).toBe('Clawd stacking task blocks')
        // The id column has room for a five-digit `#12345`, whatever the board's own ids are.
        const ids = (await pane.findAll({ type: 'Box' })).filter(b => b.props.key === 'id').map(b => b.props.width)
        expect(ids.length).toBeGreaterThan(0)
        expect(ids.every(width => width === ID_WIDTH)).toBe(true)
        await pane.press({ key: 'filter-done' })
        await pane.press({ key: 'open' })
        await clock.settle()
        await pane.unmount()
        expect((await paneTexts($)).join('|')).toContain('Admin page')
        expect(w.opened).toEqual(['https://github.com/users/pkkid/projects/1'])
      })

      test('read every 5 minutes while open, from the store when opened again sooner; Refresh reads now', async ($, on) => {
        const w = world(on)
        await start($, on, { usd: 0 })
        await openPane($)
        expect(reads(w)).toBe(1)
        await clock.advance(4 * 60_000 + 50_000)
        expect(reads(w)).toBe(1)
        await clock.advance(10_000)
        expect(reads(w)).toBe(2)
        // Opened again a minute after that read: the stored read shows, and the next is still due 5 minutes after it.
        await clock.advance(60_000)
        await openPane($)
        expect(reads(w)).toBe(2)
        await clock.advance(4 * 60_000)
        expect(reads(w)).toBe(3)
        const pane = await $.ui.mount(PP)
        await pane.press({ key: 'refresh' })
        await clock.settle()
        await pane.unmount()
        expect(reads(w)).toBe(4)
        await clock.advance(4 * 60_000 + 50_000)
        expect(reads(w)).toBe(4)
        await clock.advance(10_000)
        expect(reads(w)).toBe(5)
      })

      test('with no board it says how to name one, and asks GitHub nothing', async ($, on) => {
        const w = world(on, { [PROJECT]: JSON.stringify({ project: { board: false } }) })
        await start($, on, { usd: 0 })
        await openPane($)
        expect(reads(w)).toBe(0)
        const texts = (await paneTexts($)).join('|')
        expect(texts).toContain('This repository has no GitHub Project board')
      })
    })
  })

  describe('aitools.json', () => {
    const GLOBAL = '/home/test/.claude/aitools.json'

    function disk(on: On, files: Record<string, string> = {}) {
      const map = new Map(Object.entries(files))
      on('fs.exists', (_, e) => ({ value: map.has(e.path) }))
      on('fs.read', (_, e) => ({ value: map.get(e.path) ?? '' }))
      on('fs.write', (_, e) => {
        map.set(e.path, e.text)
        return { value: undefined }
      })
      const logs: string[] = []
      on('ui.log', (_, e) => {
        logs.push(e.text)
        return { value: undefined }
      })
      return { map, logs }
    }
    const saved = (map: Map<string, string>) => JSON.parse(map.get(GLOBAL) ?? '{}')

    test("a first run writes every setting, taking the store's over", async ($, on) => {
      const { map } = disk(on)
      await start($, on, { usd: 0 }, { settings: { label: false }, viewMode: 'task', agentHideAfter: 5 })
      const file = saved(map)
      expect(file.bar.show.label).toBe(false)
      expect(file.bar.show.weekly).toBe(true)
      expect(file.view).toEqual({ tasks: true, clean: false })
      expect(file.subagents.hideAfter).toBe(5)
    })

    test('the options write the global file only, keeping what else it holds', async ($, on) => {
      const { map } = disk(on, { [GLOBAL]: JSON.stringify({ mine: 'kept', bar: { show: { label: true } } }) })
      await start($, on, { usd: 0 })
      const pane = await $.ui.mount(SETTINGS)
      await pane.press({ key: 'label' })
      await pane.unmount()
      expect(saved(map).bar.show.label).toBe(false)
      expect(saved(map).mine).toBe('kept')
      expect([...map.keys()]).toEqual([GLOBAL])
    })

    test('a hand edit takes effect within 30 seconds; a broken file leaves the settings as they were', async ($, on) => {
      const { map, logs } = disk(on)
      await start($, on, { usd: 0 })
      expect(await barText($)).toContain('AI Tools')
      map.set(GLOBAL, JSON.stringify({ ...saved(map), bar: { ...saved(map).bar, show: { ...saved(map).bar.show, label: false } } }))
      await clock.advance(30_000)
      expect(await barText($)).not.toContain('AI Tools')
      map.set(GLOBAL, '{ "bar": ')
      await clock.advance(30_000)
      expect(await barText($)).not.toContain('AI Tools')
      expect(logs.some(l => l.includes("isn't valid JSON"))).toBe(true)
    })
  })
})
