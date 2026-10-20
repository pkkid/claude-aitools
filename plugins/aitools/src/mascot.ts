/**
 * Clawd, the Claude Code mascot, drawn at the start of the bar on surfaces that draw SVG (the desktop Code tab).
 *
 * Flat vector shapes on the 24 x 10 grid the bar shows (the poses' 28 x 12 grid with its edges cut), at 2 screen
 * pixels per unit (48 x 20 px). One rig draws him everywhere: a rounded body, pill arms that turn about the shoulders,
 * pill legs (the inner pair a shade darker, set back), eyes that blink by squashing. Every pose is one SVG with eased
 * SMIL motion; a change of pose draws the new pose's SVG with a short intro first (walking over, sitting down, waking
 * up), then its loop. The bar draws the rig's frame shifted right by CX, so he stands centered; a pose's `x` steps him
 * aside.
 */

import type { MascotPose, MascotState } from '../types'
import type { Row } from './checklist'
import { O, anim, clawd, during, ms, pill, question, swing, tf, zzz } from './rig'
import type { Rig } from './rig'
import { MOMENTS, aha } from './moments'
import type { Pose } from './moments'
import { REACTIONS } from './reactions'

/** The part of the grid shown. */
const LEFT = 3
const TOP = 2
const W = 24
const H = 10
const CX = 2

/** CSS pixels the mascot takes in the bar. */
export const MASCOT_WIDTH = W * 2
export const MASCOT_HEIGHT = H * 2

/** A desktop text row's height in CSS pixels, near enough. */
export const ROW_PX = 19
/** A pane's picture (Clawd at its top left, the header bar to his right) is always this many text rows tall. */
export const PANE_ROWS = 3
/** CSS pixels tall every pane picture is: PANE_ROWS text rows. */
export const PANE_PICTURE_HEIGHT = PANE_ROWS * ROW_PX

const ZZZ = '#8E96B8'
const SCREEN = '#22384F'
const BEZEL = '#3B3B39'
const DECK = '#A8A6A1'
const PAGE = '#F6F0E4'
const PAGE_FOLD = '#CFC4AF'
const PAGE_INK = '#C9BDA6'
const SPARK = '#F2C14E'
const SPARK_DARK = '#E8B04B'
const RED = '#E0524C'
const SWEAT = '#7CC4E8'

// ---- the bar's own props, on the rig's frame ----

/** Four-point stars popping and turning at [x, y, delay ms, colour]. */
function sparkles(spots: [number, number, number, string][]): string {
  const star = (c: string) => `<path d="M0 -1.4Q0.15 -0.15 1.4 0Q0.15 0.15 0 1.4Q-0.15 0.15 -1.4 0Q-0.15 -0.15 0 -1.4z" fill="${c}"/>`
  return spots
    .map(([x, y, d, c]) => `<g transform="translate(${x} ${y})"><g transform="scale(0)">${tf('scale', ['0', '1', '0', '0'], 1000, { begin: d, times: [0, 0.18, 0.5, 1] })}<g>${tf('rotate', ['0', '90'], 1000, { begin: d, ease: '0 0 1 1' })}${star(c)}</g></g></g>`)
    .join('')
}

/** A pulsing red ! beside him and a drop of sweat running off his head. */
function alarm(): string {
  const bang = `<g transform="translate(22.5 4.6)"><g>${tf('scale', ['1', '1.25', '1'], 500)}${pill(-0.45, -2.6, 0.9, 2.6, RED, 0.45)}<circle cy="1.1" r="0.5" fill="${RED}"/></g></g>`
  const drop = `<g transform="translate(17.3 4.2)"><g>${tf('translate', ['0 0', '0.3 1.4', '0.4 2.4'], 1200)}${anim('opacity', [1, 1, 0], 1200)}<path d="M0 -0.9Q0.65 0 0.5 0.35A0.5 0.5 0 0 1 -0.5 0.35Q-0.65 0 0 -0.9z" fill="${SWEAT}"/></g></g>`
  return bang + drop
}

/** Lines of code that type themselves out on the screen one after another, then clear: [x, y, width, colour]. */
function typedLines(rows: [number, number, number, string][], cycle: number): string {
  return rows
    .map(([x, y, w, c], i) => {
      const start = 0.02 + i * 0.16
      return `<rect x="${x}" y="${y}" width="0" height="0.45" rx="0.22" fill="${c}">${anim('width', [0, 0, w, w, 0], cycle, { times: [0, start, start + 0.12, 0.9, 1], ease: '0.3 0 0.7 1' })}</rect>`
    })
    .join('')
}

/** An open laptop to his right: the deck on the ground, the screen leaning back, code typing out on it. */
function laptop(): string {
  const deck = pill(14.5, 10.7, 9.4, 1.2, DECK, 0.4)
  const code = typedLines(
    [
      [-3.7, -6.4, 2.4, '#7FB685'],
      [-3.7, -5.4, 1.6, '#6CA0DC'],
      [-3.7, -4.4, 2.8, '#E8B04B'],
      [-3.7, -3.4, 1.3, O],
      [-3.7, -2.4, 2.1, '#7FB685'],
    ],
    2400,
  )
  const screen = `<g transform="translate(23.2 10.75) skewX(-10)">${pill(-4.6, -7.6, 4.6, 7.6, BEZEL, 0.6)}${pill(-4.1, -7.1, 3.6, 6.4, SCREEN, 0.3)}${code}</g>`

  return deck + screen
}

/** A sheet of paper held up to his right, a folded corner, the line he is reading lit and moving down. */
function paper(): string {
  const sheet = `<path d="M0 0H3.6L5 1.4V8.4Q5 8.8 4.6 8.8H0.4Q0 8.8 0 8.4z" fill="${PAGE}"/><path d="M3.6 0V1.1Q3.6 1.4 3.9 1.4H5z" fill="${PAGE_FOLD}"/>`
  const lines = [1.6, 3, 4.4, 5.8].map((y, i) => pill(0.8, y, i === 3 ? 2 : 3.2, 0.45, PAGE_INK, 0.22)).join('')
  const reading = `<rect x="0.7" y="1.5" width="3.4" height="0.65" rx="0.3" fill="${O}" opacity="0.35">${tf('translate', ['0 0', '0 0', '0 1.4', '0 1.4', '0 2.8', '0 2.8', '0 4.2', '0 4.2'], 4000)}</rect>`

  return `<g transform="translate(17.6 2.6) rotate(6)"><g>${tf('rotate', ['-2', '2', '-2'], 2600)}${sheet}${lines}${reading}</g></g>`
}

// ---- poses ----

/** Glancing right, then left, between long looks ahead. */
const glance = (dur: number, d = 0.5) =>
  tf('translate', ['0 0', '0 0', `${d} 0`, `${d} 0`, '0 0', `${-d} 0`, `${-d} 0`, '0 0'], dur, { times: [0, 0.3, 0.36, 0.5, 0.56, 0.7, 0.76, 1] })

const POSES: Pose[] = [
  {
    id: 'idle',
    alt: 'Clawd standing',
    rest: {},
    loop: { breathe: [0.95, 3400], blink: 4200, eyesMove: glance(8000) },
  },
  {
    id: 'working',
    alt: 'Clawd typing on a laptop',
    rest: { x: -3.5, look: 0.45, liftR: -38 },
    // The right arm taps at the keyboard.
    loop: { armR: swing('R', -12, 300, { ease: '0.2 0 0.4 1' }), breathe: [0.97, 1600], blink: 3600 },
    props: laptop,
    propMove: 'slide',
  },
  {
    id: 'puzzled',
    alt: 'Clawd looking puzzled',
    rest: { eyes: 'squint', liftR: 115, armFront: true },
    // Scratching his head, rocking, now and then looking up wide-eyed.
    loop: {
      armR: swing('R', 14, 400),
      breathe: [0.96, 3000],
      moods: [['squint', 2400], ['open', 900, 0.5], ['squint', 700]],
      move: tf('rotate', ['-3 12 12', '3 12 12', '-3 12 12'], 3000),
    },
    props: () => question(21.5, 5),
    propMove: 'fade',
  },
  {
    id: 'sleeping',
    alt: 'Clawd asleep',
    rest: { sit: true, y: 2, eyes: 'closed', liftL: -55, liftR: -55 },
    loop: { breathe: [0.9, 4200] },
    props: () => zzz(19.5, 6.5),
    propMove: 'fade',
  },
  {
    id: 'celebrate',
    alt: 'Clawd celebrating',
    rest: { eyes: 'happy', liftL: 60, liftR: 60 },
    // Jumping for joy, arms pumping, landing on each beat.
    loop: {
      armL: swing('L', -50, 1000, { hold: 0.4 }),
      armR: swing('R', -50, 1000, { hold: 0.4 }),
      move: tf('translate', ['0 0', '0 0', '0 -2.4', '0 0', '0 0'], 1000, { times: [0, 0.25, 0.5, 0.75, 1], ease: '0.3 0 0.5 1' }),
    },
    props: () =>
      sparkles([
        [5, 5, 0, SPARK],
        [21, 4.5, 250, SPARK],
        [20.5, 9, 500, SPARK_DARK],
        [4.5, 9.2, 750, SPARK],
      ]),
    propMove: 'fade',
  },
  {
    id: 'reading',
    alt: 'Clawd reading a sheet of paper',
    rest: { x: -3, look: 0.5, liftR: 25 },
    // His eyes run down the page with the lit line.
    loop: { breathe: [0.96, 2600], blink: 3000, eyesMove: tf('translate', ['0 -0.3', '0 -0.3', '0 0.4', '0 0.4'], 4000, { times: [0, 0.2, 0.7, 1] }) },
    props: paper,
    propsFront: true,
    propMove: 'fade',
  },
  {
    id: 'error',
    alt: 'Clawd startled',
    rest: { eyes: 'wide', liftL: 60, liftR: 60 },
    // A quick shudder, arms flapping, then a still moment.
    loop: {
      move: tf('translate', ['0 0', '-0.5 0', '0.5 0', '-0.5 0', '0.5 0', '0 0', '0 0'], 1700, { times: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 1] }),
      armL: swing('L', -15, 280),
      armR: swing('R', -15, 280),
    },
    props: alarm,
    propMove: 'fade',
  },
  {
    id: 'wave',
    alt: 'Clawd waving',
    rest: { eyes: 'happy', liftR: 40 },
    loop: { armR: swing('R', 38, 500), breathe: [0.95, 3000], move: tf('rotate', ['0 12 12', '-2 12 12', '0 12 12'], 1000) },
  },
]

const POSE = Object.fromEntries([...POSES, ...MOMENTS, ...REACTIONS].map(p => [p.id, p])) as Record<MascotPose, Pose>

// ---- assembling a pose, with or without a transition into it ----

/**
 * One step of an intro: Clawd as `rig` for `dur` ms, moving over it from `path[0]` to where he stands, with `props`
 * beside him.
 */
type Shot = { rig: Rig; dur: number; path?: string[]; props?: string }

/** The steps played between two poses before the target's own loop starts. */
function introShots(from: Pose, to: Pose): Shot[] {
  const shots: Shot[] = []
  if (from.id === 'sleeping' || from.id === 'hammock') {
    // Jolts awake and hops up.
    shots.push(
      { rig: from.rest, dur: 150 },
      { rig: { ...from.rest, eyes: 'wide', liftL: -20, liftR: -20 }, dur: 260 },
      { rig: { eyes: 'wide', liftL: 40, liftR: 40 }, dur: 340, path: ['0 2', '0 -1.6', '0 0.3', '0 0'] },
    )
  } else if (from.id === 'thinking') {
    // The thought lands: a lightbulb in the bubble, an arm thrown up.
    const { rig, props } = aha()
    shots.push({ rig, dur: 420, props })
  } else {
    shots.push({ rig: from.rest, dur: 140 })
  }
  // Walks over to the laptop or paper, or back to the middle.
  const fromX = from.id === 'sleeping' ? 0 : (from.rest.x ?? 0)
  const toX = to.rest.x ?? 0
  if (toX !== fromX) {
    const dir = Math.sign(toX - fromX)
    shots.push({ rig: { x: toX, look: dir * 0.5, walk: 300 }, dur: Math.abs(toX - fromX) * 130, path: [`${fromX - toX} 0`, '0 0'] })
  }
  if (to.id === 'sleeping' || to.id === 'hammock') {
    // Eyes droop and close, then he sits down.
    shots.push({ rig: { eyes: 'half' }, dur: 450 }, { rig: { eyes: 'closed' }, dur: 450 }, { rig: to.rest, dur: 250, path: ['0 -2', '0 0'] })
  } else {
    shots.push({ rig: { ...to.rest, eyes: 'half' }, dur: 90 })
  }
  // The laptop needs time to slide in or out.
  const needs = from.propMove === 'slide' || to.propMove === 'slide' ? 450 : 0
  const total = shots.reduce((s, { dur }) => s + dur, 0)
  if (total < needs) shots.push({ rig: to.rest, dur: needs - total })

  return shots
}

/** A step shown once, from `start` for `dur` ms. */
function once({ rig, dur, path, props }: Shot, start: number): string {
  const move = path ? tf('translate', path, dur, { begin: start, once: true }) : undefined
  return `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${ms(start)}" dur="${ms(dur)}"/>${clawd({ ...rig, move })}${startingAt(props ?? '', start)}</g>`
}

/** The pose playing: its scene, or its rest with its loop's motion. */
const playing = (pose: Pose) => pose.scene?.() ?? clawd({ ...pose.rest, ...pose.loop })

/** Content whose animations start `at` ms later, so a loop revealed after an intro plays from its own start. */
const startingAt = (content: string, at: number) => (at === 0 ? content : content.replace(/begin="(\d+)ms"/g, (_, b: string) => `begin="${Number(b) + at}ms"`))

/** Props coming in (over the intro) or going out, by slide or fade. */
function moveProps(content: string, move: 'slide' | 'fade', dir: 'in' | 'out', dur: number): string {
  const o = { once: true }
  if (move === 'slide') {
    const steps = dir === 'in' ? ['0 6', '0 0'] : ['0 0', '0 6']
    const hide = dir === 'out' ? `<set attributeName="visibility" to="hidden" begin="${ms(dur)}"/>` : ''
    return `<g transform="translate(0 ${dir === 'in' ? 6 : 0})">${tf('translate', steps, dur, o)}${hide}${content}</g>`
  }

  return `<g opacity="${dir === 'in' ? 0 : 1}">${anim('opacity', dir === 'in' ? [0, 1] : [1, 0], dur, o)}${content}</g>`
}

function svg(content: string, size = 1): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LEFT} ${TOP} ${W} ${H}" width="${W * size}" height="${H * size}"><g transform="translate(${CX} 0)">${content}</g></svg>`
}

/** How long the intro into `to` from `from` plays, in ms; 0 with no pose before. */
export function introMs(to: MascotPose, from: MascotPose | null): number {
  return from === null || from === to ? 0 : introShots(POSE[from], POSE[to]).reduce((s, { dur }) => s + dur, 0)
}

export function mascotAlt(pose: MascotPose): string {
  return POSE[pose].alt
}

/**
 * The pose's SVG, playing the transition from `from` first. `seq` goes in a comment so each change of pose is a new
 * source: the surface then starts the animation over rather than reusing a drawing it already has.
 */
export function mascotSvg(to: MascotPose, from: MascotPose | null, seq: number): string {
  return render(POSE[to], from === null ? undefined : POSE[from]).replace('</svg>', `<!--${seq}--></svg>`)
}

/** A pose's SVG; given `from`, it first plays the transition out of that pose. */
function render(to: Pose, from?: Pose): string {
  if (!from || from.id === to.id) {
    const props = to.props?.() ?? ''
    return svg(to.propsFront ? playing(to) + props : props + playing(to))
  }
  let at = 0
  const intro = introShots(from, to)
    .map(shot => {
      const s = once(shot, at)
      at += shot.dur
      return s
    })
    .join('')
  const loop = `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${ms(at)}"/>${startingAt(playing(to), at)}</g>`
  const out = from.props ? moveProps(from.props(), from.propMove ?? 'fade', 'out', at) : ''
  const into = to.props ? moveProps(startingAt(to.props(), at), to.propMove ?? 'fade', 'in', at) : ''

  const front = (from.propsFront ? out : '') + (to.propsFront ? into : '')
  const back = (from.propsFront ? '' : out) + (to.propsFront ? '' : into)

  return svg(back + intro + loop + front)
}

/** Before anything happens in a session: standing, no pose changed yet. */
export const MASCOT_START: MascotState = { pose: 'idle', rest: 'idle', from: null, change: 0, seq: 0, since: 0 }

/** The drawing for the bar: the pose's SVG (with its transition while one plays) and what it says. */
export function mascotDrawing(m: MascotState): { source: string; alt: string } {
  return { source: mascotSvg(m.pose, m.from, m.seq), alt: mascotAlt(m.pose) }
}

/**
 * Poses that play for a moment, then give way to the pose underneath (MascotState.rest): ms past the intro into them.
 */
export const ONE_SHOT_MS: Partial<Record<MascotPose, number>> = {
  celebrate: 2600,
  error: 2400,
  wave: 2600,
  ...Object.fromEntries([...MOMENTS, ...REACTIONS].filter(p => p.cycle !== undefined).map(p => [p.id, p.cycle])),
}

/** The small moments he plays now and then standing idle, in turn; the yawn comes in his last minute before sleep. */
export const IDLE_MOMENTS: readonly MascotPose[] = ['glance', 'stretch', 'hop', 'butterfly']

/** Standing idle, the first moment comes after this long, and the next this long after the last. */
export const IDLE_MOMENT_MS = 60_000

/** A turn running this long has him sip a coffee now and then; past LONG_TURN_MS * 3 he wipes his brow instead. */
export const LONG_TURN_MS = 3 * 60_000

/** How often a long turn's moment comes, at most. */
export const LONG_TURN_MOMENT_MS = 90_000

/** How long Clawd stands idle before he sits down and falls asleep. */
export const SLEEP_AFTER_MS = 5 * 60_000

/**
 * What Clawd does while a tool of the main chat runs: the pose for its kind of work (a shell command's by commandPose);
 * any other leaves him typing.
 */
export const TOOL_POSES: Readonly<Record<string, MascotPose>> = {
  Read: 'reading',
  NotebookRead: 'reading',
  Grep: 'searching',
  Glob: 'searching',
  WebFetch: 'web',
  WebSearch: 'web',
  Edit: 'editing',
  MultiEdit: 'editing',
  Write: 'editing',
  NotebookEdit: 'editing',
  Bash: 'command',
}

/** Programs a shell command searches with, or reads a file with: Clawd searches or reads rather than typing a command. */
const SEARCH_PROGRAMS: ReadonlySet<string> = new Set(['grep', 'egrep', 'rg', 'ag', 'ack', 'find', 'fd', 'locate'])
const READ_PROGRAMS: ReadonlySet<string> = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat'])

/**
 * What Clawd does while a shell command runs, by the program it runs first (past any `cd` or `export` before it, and
 * before any pipe): searching, reading, or at the terminal.
 */
export function commandPose(command: string): MascotPose {
  const first = command
    .split(/&&|\|\||;/)
    .map(part => part.trim())
    .find(part => part && !/^(?:cd|pushd|export|set)\b/.test(part))
  const program = (first ?? '').split('|')[0]!.trim().split(/\s+/)[0]!.replace(/^.*\//, '')
  if (SEARCH_PROGRAMS.has(program) || /^git\s+grep\b/.test(first ?? '')) {
    return 'searching'
  }
  return READ_PROGRAMS.has(program) ? 'reading' : 'command'
}

/** Whether a shell command commits or pushes with git: Clawd launches a rocket once it succeeds. */
export function isShipCommand(command: string): boolean {
  return /(?:^|[;&|(]\s*|\s)git(?:\s+-\S+(?:\s+\S+)?)*\s+(?:commit|push)\b/.test(command)
}

/** Whether a reply ends by asking the person something: its last words, past closing marks, end in a question mark. */
export function endsWithQuestion(text: string): boolean {
  return /\?[\s*_`"')\]]*$/.test(text)
}

/**
 * Whether the conversation, as the mod finds it on load, ends with a reply that asks something: the last assistant
 * text with no prompt of the person's after it.
 */
export function isQuestionOpenIn(rows: readonly Row[]): boolean {
  for (const row of [...rows].reverse()) {
    if (row.role === 'assistant' && row.text.trim()) {
      return endsWithQuestion(row.text)
    }
    if (row.role === 'user' && row.text.trim() && !row.toolResults?.length) {
      return false
    }
  }

  return false
}
