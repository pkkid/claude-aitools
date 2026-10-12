import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { BG, DOING_TEXT } from '../src/palette'
import { SETTINGS_PANE } from '../src/settingspane'

const NOW = new Date(2026, 9, 4, 12, 0).getTime()
const SURFACES = ['terminal', 'desktop'] as const

function band(surface: (typeof SURFACES)[number], over: { hasSurvey?: boolean; bodyColumns?: number } = {}) {
  return {
    plugin: 'aitools',
    surface,
    component: 'AbovePrompt' as const,
    props: {
      hasSurvey: over.hasSurvey ?? false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: over.bodyColumns ?? 160,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  }
}

/** Answers the band as core does when no plugin beneath draws it: its own drawing, by ref. */
function coreBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine' as const, ref: 0 }))
}

/** The AI Tool Settings pane as a docked pane receives it. */
function settingsPane(surface: (typeof SURFACES)[number]) {
  return {
    plugin: 'aitools',
    surface,
    component: 'Pane' as const,
    requestId: SETTINGS_PANE,
    props: { title: 'AI Tool Settings', isFocused: false, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }
}

/** Answers `$.ui.open` and `$.ui.close` as the engine would; returns the ids open now. */
function mockPanes(on: On): Set<string> {
  const open = new Set<string>()
  on('ui.open', (_, e) => {
    open.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))

  return open
}

describe('AbovePrompt band', () => {
  test('⁝ opens the AI Tool Settings pane, whose options change the bar; ⁝ again closes it', async ($, on) => {
    coreBand(on)
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    const open = mockPanes(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(band(surface))
      // The terminal names the menus in words: it paints a bare 🛠 wider than it lays it out.
      expect((await ui.find({ key: 'tools' }))?.text).toBe(surface === 'terminal' ? 'tools' : '🛠')
      expect((await ui.find({ key: 'settings' }))?.text).toBe(surface === 'terminal' ? 'opts' : '⁝')
      expect(await ui.find({ text: /wk/ })).toBeDefined()

      await ui.press({ key: 'settings' })
      expect(open.has(SETTINGS_PANE)).toBe(true)
      // Nothing opens above the bar any more.
      expect(await ui.find({ key: 'weekly' })).toBeUndefined()

      const pane = await $.ui.mount(settingsPane(surface))
      expect((await pane.find({ key: 'weekly' }))?.text).toBe('● Percent')
      await pane.press({ key: 'weekly' })
      expect((await pane.find({ key: 'weekly' }))?.text).toBe('○ Percent')
      // The weekly meter shows while either of its options is on.
      expect(await ui.find({ text: /wk/ })).toBeDefined()
      await pane.press({ key: 'weeklyReset' })
      expect(await ui.find({ text: /wk/ })).toBeUndefined()
      await pane.press({ key: 'weekly' })
      await pane.press({ key: 'weeklyReset' })
      expect(await ui.find({ text: /wk/ })).toBeDefined()
      await pane.unmount()

      await ui.press({ key: 'settings' })
      expect(open.has(SETTINGS_PANE)).toBe(false)
      await ui.unmount()
    }
  })

  test('the pane lists every option under its ribbon and group; Mascot on the desktop only', async ($, on) => {
    coreBand(on)
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    for (const surface of SURFACES) {
      const pane = await $.ui.mount(settingsPane(surface))
      const text = (await pane.findAll({ type: 'Text' })).map(t => t.text)
      for (const heading of ['Global Settings', 'Meters', 'Project Settings']) {
        expect(text).toContain(heading)
      }
      expect((await pane.find({ key: 'label' }))?.text).toBe('● Show title')
      // The global Show project row sits with the bar's own options; outside a repository Project Settings has nothing to
      // save. Each heading says where its settings go.
      expect((await pane.find({ key: 'projectRow' }))?.text).toBe('● Show project row')
      expect(await pane.find({ key: 'project-enabled' })).toBeUndefined()
      expect(text).toContain('May be overridden by project settings')
      expect(text).toContain('Saved for each project')
      expect((await pane.find({ key: 'mascot' })) !== undefined).toBe(surface === 'desktop')
      expect((await pane.find({ type: 'Svg' }))?.props.alt).toBe(surface === 'desktop' ? 'Clawd in a hard hat, turning a cog with a wrench' : undefined)
      // Each meter is one row: its name, then its options beside it.
      const meterRow = await pane.find({ key: 'meter-Context' })
      expect(meterRow?.text).toContain('Context')
      expect((await pane.find({ key: 'meter-Thread cost' }))?.text).toContain('● Weekly share')
      expect(await pane.find({ key: 'meter-Month' })).toBeDefined()
      expect(meterRow?.text).toContain('● Percent')
      expect(meterRow?.text).toContain('● Tokens')
      expect(await pane.find({ key: 'row-contextPercent' })).toBeUndefined()
      // Each section's heading sits on a band of its own.
      expect((await pane.find({ key: 'heading-project' }))?.props.backgroundColor).toBe(BG.bg1)
      await pane.unmount()
    }
  })

  test('the mascot stands at the start of the bar on the desktop only, and Mascot hides him', async ($, on) => {
    coreBand(on)
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    const terminal = await $.ui.mount(band('terminal'))
    expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
    await terminal.unmount()

    const ui = await $.ui.mount(band('desktop'))
    const art = await ui.find({ type: 'Svg' })
    expect(art?.props.alt).toBe('Clawd standing')
    expect(art?.props.width).toBe(48)
    expect(art?.props.height).toBe(20)
    expect(art?.props.isInteractive).toBeUndefined()
    expect(String(art?.props.source)).toMatch(/^<svg [\s\S]*<\/svg>$/)
    const pane = await $.ui.mount(settingsPane('desktop'))
    expect((await pane.find({ key: 'mascot' }))?.text).toBe('● Show mascot')
    await pane.press({ key: 'mascot' })
    expect((await pane.find({ key: 'mascot' }))?.text).toBe('○ Show mascot')
    await pane.unmount()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  })

  test('metric labels stay dim; their values are the half-dim grey', async ($, on) => {
    coreBand(on)
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    const ui = await $.ui.mount(band('desktop'))
    const texts = await ui.findAll({ type: 'Text' })
    await ui.unmount()
    // The month is still loading here: `month …`.
    const label = texts.find(t => t.text === 'month ')
    const value = texts.find(t => t.text.startsWith('…'))
    expect(label?.props.dimColor).toBe(true)
    expect(value?.props.color).toBe(DOING_TEXT)
    expect(value?.props.dimColor).toBeUndefined()
  })

  test('the AI Tools label shows by default', async ($, on) => {
    coreBand(on)
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    const ui = await $.ui.mount(band('desktop'))
    expect(await ui.find({ text: 'AI Tools    ' })).toBeDefined()
    await ui.unmount()
  })

  test('the AI Tools label follows its toggle', async ($, on) => {
    coreBand(on)
    mock.store(on, { settings: { label: false } })
    mock.clock(on, { now: NOW })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount(band('desktop'))
    expect(await ui.find({ text: 'AI Tools    ' })).toBeUndefined()
    await ui.unmount()
  })

  test('⁝ closes the 🛠 menu as it opens the settings pane', async ($, on) => {
    coreBand(on)
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    mockPanes(on)
    const ui = await $.ui.mount(band('desktop'))
    await ui.press({ key: 'tools' })
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
    await ui.press({ key: 'settings' })
    expect(await ui.find({ key: 'handoff' })).toBeUndefined()
    await ui.unmount()
  })

  test('the tools button always shows, even with a saved setting from when it could be hidden', async ($, on) => {
    coreBand(on)
    mock.store(on, { settings: { handoffButton: false } })
    mock.clock(on, { now: NOW })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount(band('desktop'))
    expect(await ui.find({ key: 'tools' })).toBeDefined()
    await ui.unmount()
    const pane = await $.ui.mount(settingsPane('desktop'))
    expect(await pane.find({ text: /Tools menu/ })).toBeUndefined()
    await pane.unmount()
  })

  test('yields to a survey', async ($, on) => {
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    on('ui.render', { component: 'AbovePrompt' }, ($e, e) => {
      const { Text } = $e.ui.resolve(e)

      return Text({ children: 'engine survey' })
    })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(band(surface, { hasSurvey: true }))
      expect(await ui.find({ key: 'settings' })).toBeUndefined()
      expect(await ui.find({ text: 'engine survey' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a narrow bar wraps instead of dropping segments', async ($, on) => {
    coreBand(on)
    mock.store(on, {})
    mock.clock(on, { now: NOW })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount(band(surface, { bodyColumns: 40 }))
      for (const label of ['5h', 'wk', 'ctx', 'cache', 'thread', 'month']) {
        expect(await ui.find({ text: new RegExp(`\\b${label}\\b`) })).toBeDefined()
      }
      expect(await ui.find({ key: 'settings' })).toBeDefined()
      await ui.unmount()
    }
  })
})
