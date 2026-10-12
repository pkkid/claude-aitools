import { describe, expect, test } from 'claude-code/testing'

import { PERSONAL_DEFAULTS, configText, migrated, parseConfig, personalFrom, withPersonal } from '../src/config'
import { DEFAULT_SETTINGS } from '../src/settings'

describe('parseConfig', () => {
  test('one JSON object, or why not', () => {
    expect(parseConfig('{"view": "task"}')).toEqual({ value: { view: 'task' } })
    expect('error' in parseConfig('{"view": ')).toBe(true)
    expect(parseConfig('[1, 2]')).toEqual({ error: 'the file must hold one JSON object' })
    expect(parseConfig('null')).toEqual({ error: 'the file must hold one JSON object' })
  })

  test('written as two-space JSON with a final newline', () => {
    expect(configText({ bar: { hidden: false } })).toBe('{\n  "bar": {\n    "hidden": false\n  }\n}\n')
  })
})

describe('personalFrom', () => {
  test('an empty file is every default', () => {
    expect(personalFrom({})).toEqual(PERSONAL_DEFAULTS)
  })

  test('each setting from its place, and a wrong value at its default', () => {
    const p = personalFrom({
      bar: { hidden: true, show: { label: false, projectRow: false, mascot: 'yes' } },
      view: 'clean',
      subagents: { team: 8, helpers: 'fast', showing: 'tool', hideAfter: 5 },
    })
    expect(p.isHidden).toBe(true)
    expect(p.settings).toEqual({ ...DEFAULT_SETTINGS, label: false, projectRow: false })
    expect(p.view).toBe('clean')
    expect(p.team).toBe(8)
    expect(p.helpers).toBe('fast')
    expect(p.showing).toBe('tool')
    expect(p.hideAfter).toBe(5)
    expect(personalFrom({ view: 'loud', subagents: { team: 7, hideAfter: 2 } })).toMatchObject({ view: 'off', team: 'default', hideAfter: 'never' })
  })
})

describe('withPersonal', () => {
  test('changes only what it sets; keys it does not know, and the project section, stay', () => {
    const raw = { bar: { show: { label: true, weekly: false }, hidden: false }, project: { name: 'x' }, mine: 1 }
    expect(withPersonal(raw, { settings: { ...DEFAULT_SETTINGS, label: false }, view: 'task' })).toEqual({
      bar: { show: { ...DEFAULT_SETTINGS, label: false }, hidden: false },
      view: 'task',
      project: { name: 'x' },
      mine: 1,
    })
    expect(withPersonal({}, { team: 5 })).toEqual({ subagents: { team: 5 } })
  })
})

describe('migrated', () => {
  test("a file from before the limits' resets were apart gives both its Reset countdowns pick", () => {
    const filled = migrated({ bar: { show: { resets: false } } }, {})
    expect(filled.bar).toMatchObject({ show: { fiveHourReset: false, weeklyReset: false } })
  })

  test("a first run takes the store's settings, and fills the rest with defaults", () => {
    const filled = migrated({}, { settings: { label: false }, isHidden: true, viewMode: 'task', agentTeam: 10 })
    expect(personalFrom(filled)).toEqual({ ...PERSONAL_DEFAULTS, settings: { ...DEFAULT_SETTINGS, label: false }, isHidden: true, view: 'task', team: 10 })
    expect(Object.keys((filled.bar as { show: object }).show)).toHaveLength(Object.keys(DEFAULT_SETTINGS).length)
  })

  test('what the file holds wins; a display option it lacks joins it', () => {
    const { mascot: _, ...rest } = DEFAULT_SETTINGS
    const raw = { bar: { show: { ...rest, label: false }, hidden: false }, view: 'clean' }
    const filled = migrated(raw, { settings: { label: true }, viewMode: 'task' })
    expect(personalFrom(filled).settings).toEqual({ ...DEFAULT_SETTINGS, label: false })
    expect(personalFrom(filled).view).toBe('clean')
  })

  test('a complete file comes back as it was', () => {
    const full = migrated({}, {})
    expect(migrated(full, { viewMode: 'task' })).toEqual(full)
  })
})
