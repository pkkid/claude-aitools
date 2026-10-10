/**
 * aitools.json: the mod's settings as files the person can read and edit.
 *
 * `~/.claude/aitools.json` (under CLAUDE_CONFIG_DIR when set) holds the person's own settings: what the bar shows
 * (the project row among it),
 * the view, the Subagents pane's picks. Everything the mod's own controls change is written here, never to a
 * project's file. `<repo>/.claude/aitools.json` holds only the `project` section (src/project.tsx reads it).
 *
 * Both files are JSON. A write reads the file again first and changes only the keys it sets, so hand edits and keys
 * the mod does not know are kept.
 */

import { DEFAULT_HIDE_AFTER, isHideAfter, isShowing, isTeamPick } from './agentdock'
import { DEFAULT_SETTINGS, normalizeSettings } from './settings'
import type { AgentShowing, HelperMode, HideAfter, Settings, TeamPick, ViewMode } from '../types'

/** The file's name, in the Claude config folder and in a project's `.claude` folder. */
export const CONFIG_FILE = 'aitools.json'

/** A JSON object as read from a file: whatever it holds, typed loosely until normalized. */
export type Json = Record<string, unknown>

/** The person's settings, as the mod uses them. */
export type Personal = {
  settings: Settings
  /** `/aitools off`: the whole bar hidden. */
  isHidden: boolean
  view: ViewMode
  team: TeamPick
  helpers: HelperMode
  showing: AgentShowing
  hideAfter: HideAfter
}

export const PERSONAL_DEFAULTS: Personal = {
  settings: DEFAULT_SETTINGS,
  isHidden: false,
  view: 'off',
  team: 'default',
  helpers: 'same',
  showing: 'all',
  hideAfter: DEFAULT_HIDE_AFTER,
}

/** A file's text as JSON: an object, or why it is not one. */
export function parseConfig(text: string): { value: Json } | { error: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'the file must hold one JSON object' }
  }

  return { value: value as Json }
}

/** The text a config is written as: two-space JSON and a final newline. */
export function configText(raw: Json): string {
  return `${JSON.stringify(raw, null, 2)}\n`
}

/** The object under `key`, or an empty one when there is none. */
export function objectAt(raw: Json, key: string): Json {
  const value = raw[key]
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

/** The person's settings in a global file, each one the file leaves out or gets wrong at its default. */
export function personalFrom(raw: Json): Personal {
  const bar = objectAt(raw, 'bar')
  const subagents = objectAt(raw, 'subagents')
  const view = raw.view

  return {
    settings: normalizeSettings(objectAt(bar, 'show')),
    isHidden: bar.hidden === true,
    view: view === 'task' || view === 'clean' ? view : 'off',
    team: isTeamPick(subagents.team) ? subagents.team : PERSONAL_DEFAULTS.team,
    helpers: subagents.helpers === 'fast' ? 'fast' : 'same',
    showing: isShowing(subagents.showing) ? subagents.showing : PERSONAL_DEFAULTS.showing,
    hideAfter: isHideAfter(subagents.hideAfter) ? subagents.hideAfter : PERSONAL_DEFAULTS.hideAfter,
  }
}

/** Where each setting sits in the file. */
const PATHS: { [K in keyof Personal]: readonly [string, ...string[]] } = {
  settings: ['bar', 'show'],
  isHidden: ['bar', 'hidden'],
  view: ['view'],
  team: ['subagents', 'team'],
  helpers: ['subagents', 'helpers'],
  showing: ['subagents', 'showing'],
  hideAfter: ['subagents', 'hideAfter'],
}

function setAt(raw: Json, path: readonly string[], value: unknown): Json {
  const [key, ...rest] = path
  if (key === undefined) {
    return raw
  }

  return { ...raw, [key]: rest.length === 0 ? value : setAt(objectAt(raw, key), rest, value) }
}

function hasAt(raw: Json, path: readonly string[]): boolean {
  const [key, ...rest] = path
  if (key === undefined || !(key in raw)) {
    return false
  }

  return rest.length === 0 || hasAt(objectAt(raw, key), rest)
}

/** The file with `change` written into it; every other key, the person's own included, kept as it was. */
export function withPersonal(raw: Json, change: Partial<Personal>): Json {
  let next = raw
  for (const key of Object.keys(change) as (keyof Personal)[]) {
    const value = key === 'settings' ? { ...objectAt(objectAt(raw, 'bar'), 'show'), ...change.settings } : change[key]
    next = setAt(next, PATHS[key], value)
  }

  return next
}

/** The settings the mod kept in its store before the file existed, under their old keys. */
export type StoredSettings = Partial<Record<(typeof STORED_KEYS)[number], unknown>>

/** The old store keys the migration reads, and clears once the file holds them. */
export const STORED_KEYS = ['settings', 'isHidden', 'viewMode', 'agentTeam', 'agentHelpers', 'agentShowing', 'agentHideAfter'] as const

/**
 * The file with every setting it lacks filled in: from the store where the mod kept it before, else its default, so
 * the file shows every setting there is. What the file already holds wins.
 */
export function migrated(raw: Json, stored: StoredSettings): Json {
  const old = personalFrom({
    bar: { show: stored.settings, hidden: stored.isHidden },
    view: stored.viewMode,
    subagents: { team: stored.agentTeam, helpers: stored.agentHelpers, showing: stored.agentShowing, hideAfter: stored.agentHideAfter },
  })
  let next = raw
  for (const key of Object.keys(PATHS) as (keyof Personal)[]) {
    if (key === 'settings') {
      // Each display option on its own, so one added in a later version joins a file that has the rest.
      const show = objectAt(objectAt(next, 'bar'), 'show')
      const missing = Object.fromEntries(Object.entries(old.settings).filter(([k]) => !(k in show)))
      if (Object.keys(missing).length > 0) next = setAt(next, PATHS.settings, { ...show, ...missing })
    } else if (!hasAt(next, PATHS[key])) {
      next = setAt(next, PATHS[key], old[key])
    }
  }

  return next
}
