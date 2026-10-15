import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_SETTINGS, TOGGLES, loadSettings, nextHidden, normalizeSettings, saveSettings } from '../src/settings'
import type { KeyStore } from '../src/settings'

function memoryStore(entries: Record<string, unknown> = {}): KeyStore {
  const data = new Map(Object.entries(entries))

  return {
    get: async key => data.get(key),
    set: async (key, value) => void data.set(key, JSON.parse(JSON.stringify(value))),
  }
}

describe('settings', () => {
  test("twenty toggles in the settings pane's groups, the mascot first and offered only where SVG draws, the project row after the bar's own", () => {
    expect(TOGGLES).toHaveLength(20)
    expect(TOGGLES[0]).toMatchObject({ key: 'mascot', group: 'look', label: 'Show mascot', needsSvg: true })
    expect(TOGGLES.filter(t => t.needsSvg)).toHaveLength(1)
    expect(TOGGLES.map(t => t.group)).toEqual([
      'look', 'look', 'look', 'look', 'look', ...Array(15).fill('meters'),
    ])
    expect(TOGGLES[3]).toMatchObject({ key: 'projectRow', group: 'look', label: 'Show project row' })
    expect(TOGGLES[4]).toMatchObject({ key: 'statuslineFile', group: 'look', label: 'Statusline file', isOffByDefault: true })
    expect(TOGGLES.every(t => t.hint.length > 0)).toBe(true)
    // Every meter's options, together and in order; the bar's own look and the project row are options of no meter.
    expect([...new Set(TOGGLES.flatMap(t => (t.meter ? [t.meter] : [])))]).toEqual(['5-hour', 'Weekly', 'Context', 'Tokens', 'Cache', 'Thread cost', 'Month', 'Burn rate'])
    expect(TOGGLES.filter(t => t.meter === 'Context').map(t => t.key)).toEqual(['contextPercent', 'contextTokens'])
  })

  test("the old Reset countdowns pick carries over to both limits' resets", () => {
    expect(normalizeSettings({ resets: false })).toMatchObject({ fiveHourReset: false, weeklyReset: false })
    expect(normalizeSettings({ resets: false, weeklyReset: true })).toMatchObject({ fiveHourReset: false, weeklyReset: true })
  })

  test('all but the statusline file default to on', () => {
    expect(Object.entries(DEFAULT_SETTINGS).filter(([, on]) => !on).map(([key]) => key)).toEqual(['statuslineFile'])
  })

  test('normalize undefined gives defaults', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  test('normalize keeps booleans and drops the rest', () => {
    const s = normalizeSettings({ weekly: false, bogus: 1, fiveHour: 'no' })
    expect(s.weekly).toBe(false)
    expect(s.fiveHour).toBe(true)
    expect(s).not.toHaveProperty('bogus')
  })

  test('load reads the store', async () => {
    const s = await loadSettings(memoryStore({ settings: { burnRate: false } }))
    expect(s.burnRate).toBe(false)
    expect(s.weekly).toBe(true)
  })

  test('save then load round-trips', async () => {
    const store = memoryStore()
    await saveSettings(store, { ...DEFAULT_SETTINGS, monthlyCost: false })
    expect((await loadSettings(store)).monthlyCost).toBe(false)
  })
})

describe('nextHidden', () => {
  test('no argument toggles', () => {
    expect(nextHidden('', false)).toBe(true)
    expect(nextHidden('  ', true)).toBe(false)
  })
  test('on and show reveal', () => {
    expect(nextHidden('on', true)).toBe(false)
    expect(nextHidden('Show', true)).toBe(false)
  })
  test('off and hide conceal', () => {
    expect(nextHidden('off', false)).toBe(true)
    expect(nextHidden(' HIDE ', false)).toBe(true)
  })
  test('anything else is null', () => expect(nextHidden('bogus', false)).toBeNull())
})
