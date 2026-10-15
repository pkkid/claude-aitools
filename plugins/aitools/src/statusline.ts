/**
 * The statusline file: the JSON the CLI hands a `statusLine` command, written by the mod on every surface (the desktop
 * runs no status line command), so a program outside Claude (a desktop meter) can read the usage limits from it.
 * Built in the CLI's shape, from the figures the mod has; a field the mod has no figure for is left out.
 */

import type { ContextFill, LimitWindow } from '../types'

/** The file, under the config dir: the one the CLI's status line command is usually pointed at. */
export const STATUSLINE_FILE = 'statusline.json'

/**
 * Writes the file as a CLI status line command does: standard input to a private temp file, then renamed over the
 * file, so a reader never sees half of one and sessions writing at once each land whole. `$1` is the file's path.
 */
export const STATUSLINE_WRITE = 'umask 077; cat > "$1.$$" && mv -f "$1.$$" "$1"'

/** Above this many input tokens the CLI's `exceeds_200k_tokens` is true. */
const LONG_CONTEXT = 200_000

/** What the file is built from. */
export type StatuslineFacts = {
  sessionId: string
  /** The session's transcript, when it is there. */
  transcriptPath?: string
  cwd: string
  projectDir: string
  /** The main loop's model, as the CLI names it: `claude-opus-5-5[1m]`. */
  model: string
  version?: string
  durationMs: number
  costUsd?: number
  context?: ContextFill
  fiveHour?: LimitWindow
  weekly?: LimitWindow
}

/** The transcripts folder's name for a project: its path with everything but letters and digits as `-`. */
export function projectSlug(dir: string): string {
  return dir.replace(/[^a-zA-Z0-9]/g, '-')
}

/** A model's name as the CLI shows it: `claude-opus-5-5[1m]` is `Opus 5.5 (1M context)`; one it cannot read, as given. */
export function modelDisplayName(id: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/i.exec(id)
  if (!match) {
    return id
  }
  const [, family = '', major, minor, oneM] = match
  const name = `${family.charAt(0).toUpperCase()}${family.slice(1)} ${minor === undefined ? major : `${major}.${minor}`}`

  return oneM ? `${name} (1M context)` : name
}

/** A limit window in the CLI's shape: its percent, and its reset in epoch seconds. */
function limit(w: LimitWindow): Record<string, number> {
  const resetsAt = w.resetsAt === undefined ? NaN : Date.parse(w.resetsAt)

  return Number.isNaN(resetsAt) ? { used_percentage: w.percentUsed } : { used_percentage: w.percentUsed, resets_at: Math.floor(resetsAt / 1000) }
}

/** The file's content, its keys in the CLI's order. */
export function statusline(f: StatuslineFacts): Record<string, unknown> {
  const tokens = f.context?.tokens
  const percent = f.context?.percent
  const rateLimits: Record<string, unknown> = {}
  if (f.fiveHour) {
    rateLimits.five_hour = limit(f.fiveHour)
  }
  if (f.weekly) {
    rateLimits.seven_day = limit(f.weekly)
  }

  return {
    session_id: f.sessionId,
    ...(f.transcriptPath === undefined ? {} : { transcript_path: f.transcriptPath }),
    cwd: f.cwd,
    model: { id: f.model, display_name: modelDisplayName(f.model) },
    workspace: { current_dir: f.cwd, project_dir: f.projectDir },
    ...(f.version === undefined ? {} : { version: f.version }),
    cost: { ...(f.costUsd === undefined ? {} : { total_cost_usd: f.costUsd }), total_duration_ms: f.durationMs },
    ...(f.context === undefined
      ? {}
      : {
          context_window: {
            total_input_tokens: tokens ?? 0,
            context_window_size: f.context.window,
            used_percentage: percent ?? null,
            remaining_percentage: percent === undefined ? null : 100 - percent,
          },
        }),
    exceeds_200k_tokens: (tokens ?? 0) > LONG_CONTEXT,
    ...(Object.keys(rateLimits).length === 0 ? {} : { rate_limits: rateLimits }),
  }
}
