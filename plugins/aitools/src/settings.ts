import type { Settings, ToggleKey } from '../types'

/** The slice of `$.store` the mod needs; the hooks module passes `$.store` itself. */
export type KeyStore = { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }

/** The AI Tool Settings pane's groups of global options: the bar's own look, then its meters. */
export type ToggleGroup = 'look' | 'meters'

/**
 * Every display option, in the settings pane's order, the meters in the order the bar draws them: its group, label and
 * one line on what it shows. `needsSvg`: an option only surfaces that draw SVG offer (the desktop), since the terminal
 * cannot show it. `meter`: the bar meter the option is part of, named; the settings pane draws a meter's options on one
 * row, the meter showing while any is on.
 */
export const TOGGLES: readonly { key: ToggleKey; group: ToggleGroup; label: string; hint: string; needsSvg?: true; meter?: string }[] = [
  { key: 'mascot', group: 'look', label: 'Show mascot', hint: 'Clawd, acting out what Claude is doing', needsSvg: true },
  { key: 'label', group: 'look', label: 'Show title', hint: 'AI Tools at the start of the bar' },
  { key: 'thresholdColors', group: 'look', label: 'Threshold colors', hint: 'Yellow from 70%, red from 90%; a cache about to go cold' },
  { key: 'projectRow', group: 'look', label: 'Show project row', hint: 'A second row: repo, board, issue and tools, in every project' },
  { key: 'fiveHour', group: 'meters', meter: '5-hour', label: 'Percent', hint: 'Share of the 5-hour limit used' },
  { key: 'fiveHourReset', group: 'meters', meter: '5-hour', label: 'Reset', hint: 'Time until the 5-hour limit resets' },
  { key: 'weekly', group: 'meters', meter: 'Weekly', label: 'Percent', hint: 'Share of the weekly limit used' },
  { key: 'weeklyReset', group: 'meters', meter: 'Weekly', label: 'Reset', hint: 'When the weekly limit resets' },
  { key: 'contextPercent', group: 'meters', meter: 'Context', label: 'Percent', hint: 'How full the context window is' },
  { key: 'contextTokens', group: 'meters', meter: 'Context', label: 'Tokens', hint: 'Context tokens out of the window, as 62k/200k' },
  { key: 'threadTokens', group: 'meters', meter: 'Tokens', label: 'Thread', hint: "This thread's tokens this month, helpers included" },
  { key: 'lastTurnTokens', group: 'meters', meter: 'Tokens', label: 'Last turn', hint: "The last turn's tokens" },
  { key: 'cacheWarmth', group: 'meters', meter: 'Cache', label: 'Time left', hint: 'Minutes until the prompt cache goes cold' },
  { key: 'coldCost', group: 'meters', meter: 'Cache', label: 'Cold cost', hint: 'What a cold cache adds to the next request' },
  { key: 'threadCost', group: 'meters', meter: 'Thread cost', label: 'Thread', hint: "This thread's cost, at API prices" },
  { key: 'lastTurnCost', group: 'meters', meter: 'Thread cost', label: 'Last turn', hint: "The last turn's cost" },
  { key: 'threadPercent', group: 'meters', meter: 'Thread cost', label: 'Weekly share', hint: "This thread's estimated share of the weekly limit" },
  { key: 'monthlyCost', group: 'meters', meter: 'Month', label: 'Cost', hint: "This month's cost on this machine, at API prices" },
  { key: 'burnRate', group: 'meters', meter: 'Burn rate', label: 'Warning', hint: 'When the 5-hour limit runs out at this pace' },
]

export const DEFAULT_SETTINGS: Settings = Object.fromEntries(TOGGLES.map(t => [t.key, true])) as Settings

/** Options that took over an older one's job, by the older one's key: a file with only the old key keeps its pick. */
export const LEGACY_KEYS: Partial<Record<ToggleKey, string>> = { fiveHourReset: 'resets', weeklyReset: 'resets' }

export function normalizeSettings(raw: unknown): Settings {
  const given = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const settings = { ...DEFAULT_SETTINGS }
  for (const { key } of TOGGLES) {
    const legacy = LEGACY_KEYS[key]
    const value = key in given || legacy === undefined ? given[key] : given[legacy]
    if (typeof value === 'boolean') {
      settings[key] = value
    }
  }

  return settings
}

export async function loadSettings(store: KeyStore): Promise<Settings> {
  return normalizeSettings(await store.get('settings'))
}

export async function saveSettings(store: KeyStore, settings: Settings): Promise<void> {
  await store.set('settings', settings)
}

/** Whether `/aitools <args>` hides the bar: no argument toggles, on/show and off/hide set it; null for anything else. */
export function nextHidden(args: string, isHidden: boolean): boolean | null {
  const word = args.trim().toLowerCase()
  if (word === '') {
    return !isHidden
  }
  if (word === 'on' || word === 'show') {
    return false
  }
  if (word === 'off' || word === 'hide') {
    return true
  }

  return null
}
