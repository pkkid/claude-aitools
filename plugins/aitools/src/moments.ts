/**
 * The bar's newer poses: what Clawd does for each kind of tool (writing, running a command, searching, the web,
 * shipping), the beats of a turn (catching the prompt, thinking, stopping short, sending off a subagent, compacting,
 * waiting on the person, a long turn), and the small moments he plays standing idle.
 *
 * Each is a Pose for mascot.ts to assemble: a rest (where intros start and end), a loop over it, and props; a pose
 * whose Clawd changes through its cycle draws a whole `scene` instead. One-shot poses run one cycle of `cycle` ms.
 */

import type { MascotPose } from '../types'
import { INK, O, R, about, anim, at, clawd, during, keyed, moved, n, pill, shade, tf, tfk } from './rig'
import type { Rig } from './rig'

export type Pose = {
  id: MascotPose
  /** What the drawing says, for a reader that cannot see it. */
  alt: string
  /** Standing still in the pose: where intros start and end. */
  rest: Rig
  /** What moves while the pose plays, over its rest. */
  loop?: Rig
  /** A pose whose Clawd changes through its cycle: drawn whole, in place of rest and loop. */
  scene?: () => string
  props?: () => string
  /** Props drawn over him rather than behind. */
  propsFront?: true
  /** How the props come and go in a transition: the laptop slides up, the rest fade. */
  propMove?: 'slide' | 'fade'
  /** A one-shot's cycle in ms: it plays once, then gives way to the pose underneath. */
  cycle?: number
}

const PAGE = '#F6F0E4'
const LINE = '#C9BDA6'
const BEZEL = '#3B3B39'
const TERM = '#1D2021'
const GREEN = '#7FB685'
const BLUE = '#6CA0DC'
const YELLOW = '#F2C14E'
const AMBER = '#E8B04B'
const RED = '#E0524C'
const STEEL = '#9A9893'
const GLASS = '#7CC4E8'
const SWEAT = '#7CC4E8'
const DUST = '#85837D'
const BOX = '#C8A27A'
const COFFEE = '#6B4429'
const DOTS = '#8E8A80'

/** A puff of dust at (x, y) that swells and fades over [from, to] of each `dur` ms cycle. */
const puff = (x: number, y: number, dur: number, from: number, to: number, r = 0.9) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="0.2" fill="${DUST}" opacity="0">` +
  keyed('opacity', [[0, 0], [from, 0], [from + 0.02, 0.8], [to, 0], [1, 0]], dur) +
  keyed('r', [[0, 0.2], [from, 0.2], [to, r], [1, r]], dur) +
  '</circle>'

/** A drop of sweat, its tip at (0, -s). */
const drop = (s = 0.8) =>
  `<path d="M0 ${-s}Q${n(s * 0.7)} 0 ${n(s * 0.55)} ${n(s * 0.35)}A${n(s * 0.55)} ${n(s * 0.55)} 0 0 1 ${n(-s * 0.55)} ${n(s * 0.35)}Q${n(-s * 0.7)} 0 0 ${-s}z" fill="${SWEAT}"/>`

// ---- working, by tool ----

const EDIT_MS = 3000

/** Lines writing themselves onto a card, a pencil following the one being written. */
function card(): string {
  const page = pill(17.4, 3.6, 6.2, 7.8, PAGE, 0.6)
  const starts = [0.05, 0.32, 0.59]
  const lines = [5.3, 6.9, 8.5]
    .map((y, i) => `<rect x="18.4" y="${y}" width="0" height="0.5" rx="0.25" fill="${LINE}">${keyed('width', [[0, 0], [starts[i]!, 0], [starts[i]! + 0.22, 4.2], [0.92, 4.2], [1, 0]], EDIT_MS)}</rect>`)
    .join('')
  const pencil =
    `<path d="M0 0L-0.2 -0.4H0.2z" fill="${BEZEL}"/><path d="M-0.2 -0.4L-0.45 -1H0.45L0.2 -0.4z" fill="#E8C9A0"/>` +
    pill(-0.45, -3.6, 0.9, 2.7, YELLOW, 0.12) +
    pill(-0.45, -4.3, 0.9, 0.8, '#E8A598', 0.3)
  const path: [number, string][] = [[0, '18.4 5.5'], [0.05, '18.4 5.5'], [0.27, '22.6 5.5'], [0.32, '18.4 7.1'], [0.54, '22.6 7.1'], [0.59, '18.4 8.7'], [0.81, '22.6 8.7'], [0.92, '22.6 8.7'], [1, '18.4 5.5']]
  const writing = moved(tfk('translate', path, EDIT_MS), `<g transform="rotate(35)">${moved(tf('translate', ['0 0', '0 -0.25', '0 0'], 220), pencil)}</g>`)

  return page + lines + writing
}

const COMMAND_MS = 2800

/** A little terminal: a command types out after the prompt, Enter, and its output scrolls in. */
function terminal(): string {
  const C = COMMAND_MS
  const frame = pill(16.8, 3.4, 7.8, 7.2, BEZEL, 0.6) + pill(17.3, 4.2, 6.8, 5.9, TERM, 0.35)
  const lights = [RED, AMBER, GREEN].map((c, i) => `<circle cx="${n(17.6 + i * 0.7)}" cy="3.8" r="0.2" fill="${c}"/>`).join('')
  const chevron = `<path d="M17.8 8.22L18.35 8.67L17.8 9.12" fill="none" stroke="${GREEN}" stroke-width="0.32" stroke-linecap="round" stroke-linejoin="round"/>`
  const typed = `<rect x="18.8" y="8.45" width="0" height="0.45" rx="0.22" fill="${PAGE}">${keyed('width', [[0, 0], [0.05, 0], [0.5, 3.2], [1, 3.2]], C)}</rect>`
  const scrolled = moved(tfk('translate', [[0, '0 0'], [0.6, '0 0'], [0.64, '0 -3.4'], [1, '0 -3.4']], C), chevron + typed)
  const output = during(pill(17.8, 6.3, 4.6, 0.45, GREEN, 0.22) + pill(17.8, 7.2, 3, 0.45, STEEL, 0.22) + chevron, 0.64, 1, C)
  const cursor =
    `<rect x="18.9" y="8.25" width="0.45" height="0.85" fill="${PAGE}">` +
    keyed('opacity', [[0, 1], [0.55, 1], [0.6, 0], [0.7, 1], [0.8, 0], [0.9, 1], [1, 0]], C, { discrete: true }) +
    keyed('x', [[0, 18.9], [0.05, 18.9], [0.5, 22.2], [0.62, 22.2], [0.64, 18.9], [1, 18.9]], C) +
    '</rect>'

  return frame + lights + scrolled + output + cursor
}

/** Typing at the terminal, then a firm press of Enter. */
const TYPING: [number, string][] = [[0, R(0)], [0.1, R(8)], [0.17, R(0)], [0.24, R(8)], [0.31, R(0)], [0.38, R(8)], [0.45, R(0)], [0.56, R(-10)], [0.61, R(22)], [0.68, R(0)], [1, R(0)]]

const SEARCH_MS = 3400

/** Sweeping a magnifying glass over the files on the ground, stepping along with it; one lights up as it passes. */
function searching(): string {
  const files = [17.4, 20, 22.6].map(x => pill(x, 9.2, 1.9, 2.7, PAGE, 0.3) + pill(x + 0.35, 9.8, 1.1, 0.3, LINE, 0.15) + pill(x + 0.35, 10.5, 0.8, 0.3, LINE, 0.15)).join('')
  const found = `<rect x="20" y="9.2" width="1.9" height="2.7" rx="0.3" fill="${O}" opacity="0">${keyed('opacity', [[0, 0], [0.38, 0], [0.48, 0.85], [0.62, 0.85], [0.72, 0], [1, 0]], SEARCH_MS)}</rect>`
  const glass =
    `<path d="M15.2 7.7L16.4 8.5" stroke="${BEZEL}" stroke-width="0.55" stroke-linecap="round"/>` +
    `<circle cx="17.5" cy="9" r="1.35" fill="${GLASS}" fill-opacity="0.35" stroke="${STEEL}" stroke-width="0.45"/>` +
    `<path d="M16.9 8.4Q17.2 8.1 17.7 8.2" stroke="#fff" stroke-opacity="0.7" stroke-width="0.2" fill="none" stroke-linecap="round"/>`
  const seeker = clawd({ x: -4, look: 0.5, lookY: 0.4, liftR: -12, walk: 340, blink: 2600 })
  const along = tfk('translate', [[0, '0 0'], [0.48, '4.2 0'], [0.62, '4.2 0'], [1, '0 0']], SEARCH_MS)

  return files + found + moved(along, seeker + glass)
}

/** A globe on a stand, spinning. */
function globe(): string {
  const land = (dx: number) =>
    `<ellipse cx="${n(19.8 + dx)}" cy="5.6" rx="1.3" ry="0.9" fill="${GREEN}"/><ellipse cx="${n(21.6 + dx)}" cy="7.8" rx="1.1" ry="1.3" fill="${GREEN}"/><ellipse cx="${n(23.4 + dx)}" cy="5.2" rx="0.8" ry="0.6" fill="${GREEN}"/>`
  const spin = tf('translate', ['0 0', '-5.4 0'], 3000, { ease: '0 0 1 1' })
  const meridian = `<ellipse cx="21.2" cy="6.6" rx="2.7" ry="2.7" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="0.2">${anim('rx', [2.7, 0.2, 2.7], 3000, { ease: '0 0 1 1' })}</ellipse>`
  const sphere =
    `<defs><clipPath id="clawd-globe"><circle cx="21.2" cy="6.6" r="2.7"/></clipPath></defs><circle cx="21.2" cy="6.6" r="2.7" fill="${BLUE}"/>` +
    `<g clip-path="url(#clawd-globe)">${moved(spin, land(0) + land(5.4))}${meridian}<path d="M18.5 6.6H23.9" stroke="#fff" stroke-opacity="0.3" stroke-width="0.2"/><circle cx="20.2" cy="5.4" r="1.1" fill="#fff" opacity="0.18"/></g>`
  const stand = `<path d="M18.2 6.6A3 3 0 0 0 21.2 9.6" fill="none" stroke="${STEEL}" stroke-width="0.35"/>` + pill(20.85, 9.5, 0.7, 1.4, STEEL, 0.2) + pill(19.6, 10.8, 3.2, 0.7, STEEL, 0.35)

  return stand + sphere
}

const SHIP_MS = 3400

/** A little rocket shakes on its pad, lifts off in smoke, and he cheers it away. */
function shipping(): string {
  const flame = `<path d="M-0.5 -0.6Q0 1.8 0.5 -0.6z" fill="${AMBER}">${tf('scale', ['1 0.6', '1 1.2', '1 0.7'], 180, { ease: '0 0 1 1' })}</path>`
  const rocket =
    `<path d="M-0.8 -1.5L-1.6 -0.2L-0.8 -0.6zM0.8 -1.5L1.6 -0.2L0.8 -0.6z" fill="${RED}"/>` +
    pill(-0.8, -4.2, 1.6, 3.7, PAGE, 0.75) +
    `<path d="M-0.78 -3.4Q0 -5.6 0.78 -3.4z" fill="${RED}"/><circle cy="-2.5" r="0.45" fill="${BLUE}" stroke="${STEEL}" stroke-width="0.18"/>`
  const flight: [number, string][] = [[0, '21.3 10.9'], [0.3, '21.3 10.9'], [0.62, '21.3 -4'], [1, '21.3 -4']]
  const shaking = moved(tf('translate', ['-0.12 0', '0.12 0', '-0.12 0'], 120), flame + rocket)
  const ship = during(moved(tfk('translate', flight, SHIP_MS, { ease: '0.6 0 0.9 0.6' }), shaking), 0, 0.64, SHIP_MS)
  const pad = pill(19.5, 11.2, 3.6, 0.6, STEEL, 0.3)
  const smoke = puff(20, 11.2, SHIP_MS, 0.28, 0.6, 1.2) + puff(22.6, 11.2, SHIP_MS, 0.3, 0.62, 1.1) + puff(21.3, 11.6, SHIP_MS, 0.26, 0.55, 1.4)
  const watching = clawd({ x: -3, look: 0.5, blink: 2000 })
  const cheering = clawd({ x: -3, eyes: 'happy', liftL: 60, liftR: 60, move: tf('translate', ['0 0', '0 -1.4', '0 0'], 560) })

  return pad + smoke + ship + during(watching, 0, 0.42, SHIP_MS) + during(cheering, 0.42, 1, SHIP_MS)
}

// ---- the beats of a turn ----

/** A thought bubble up to his right, three dots pulsing in it. */
function thought(): string {
  const trail = `<circle cx="17.9" cy="4.7" r="0.35" fill="${PAGE}"/><circle cx="19" cy="3.8" r="0.55" fill="${PAGE}"/>`
  const dots = [21.3, 22.3, 23.3].map((cx, i) => `<circle cx="${cx}" cy="3.9" r="0.38" fill="${DOTS}">${anim('opacity', [0.25, 1, 0.25], 900, { begin: i * 220 })}</circle>`).join('')

  return trail + `<ellipse cx="22.3" cy="3.9" rx="2.7" ry="1.7" fill="${PAGE}"/>` + dots
}

/** The aha as thinking gives way: the bubble holds a lightbulb that pops in, and he throws an arm up. */
export function aha(): { rig: Rig; props: string } {
  const bulb =
    `<circle cx="22.3" cy="3.6" r="1.5" fill="${YELLOW}" opacity="0.35"/><circle cx="22.3" cy="3.5" r="0.85" fill="${YELLOW}"/>` +
    pill(21.9, 4.25, 0.8, 0.55, STEEL, 0.2)
  const pop = about(22.3, 3.8, tf('scale', ['0', '1.25', '1'], 300, { once: true, times: [0, 0.6, 1] }), bulb)
  const props = `<circle cx="17.9" cy="4.7" r="0.35" fill="${PAGE}"/><circle cx="19" cy="3.8" r="0.55" fill="${PAGE}"/><ellipse cx="22.3" cy="3.9" rx="2.7" ry="1.7" fill="${PAGE}"/>` + pop

  return { rig: { eyes: 'happy', liftR: 75 }, props }
}

const LISTEN_MS = 2800

/** The person's prompt flies up from the prompt box; he catches it overhead and takes it in. */
function listening(): string {
  const C = LISTEN_MS
  const note = pill(-1.4, -0.9, 2.8, 1.8, PAGE, 0.4) + pill(-0.9, -0.45, 1.8, 0.3, LINE, 0.15) + pill(-0.9, 0.15, 1.2, 0.3, LINE, 0.15) + `<path d="M-0.6 0.85L-1 1.5L-0.1 0.85z" fill="${PAGE}"/>`
  const flight: [number, string][] = [[0, '25 14'], [0.18, '25 14'], [0.3, '19 3.6'], [0.4, '12.2 3.1'], [0.46, '12 3.5'], [0.7, '12 3.5'], [0.8, '12 6.2'], [1, '12 6.2']]
  const size: [number, string][] = [[0, '0.6'], [0.18, '0.6'], [0.4, '1'], [0.7, '1'], [0.8, '0'], [1, '0']]
  const prompt = moved(tfk('translate', flight, C), moved(tfk('scale', size, C), note))
  const ding = about(12, 3.6, tfk('scale', [[0, '0'], [0.78, '0'], [0.84, '1'], [0.92, '0'], [1, '0']], C), at(12, 3.6, `<path d="M0 -1Q0.1 -0.1 1 0Q0.1 0.1 0 1Q-0.1 0.1 -1 0Q-0.1 -0.1 0 -1z" fill="${YELLOW}"/>`))
  const waiting = clawd({ look: -0.2, lookY: 0.4, blink: 2000 })
  const catching = clawd({ eyes: 'wide', liftL: 75, liftR: 75, move: tfk('translate', [[0, '0 0'], [0.22, '0 0'], [0.3, '0 -0.9'], [0.36, '0 0'], [1, '0 0']], C) })
  const holding = clawd({ eyes: 'happy', liftL: 75, liftR: 75 })
  const taken = clawd({ eyes: 'happy', move: tf('translate', ['0 0', '0 0.4', '0 0'], 400) })

  return during(waiting, 0, 0.22, C) + during(catching, 0.22, 0.4, C) + during(holding, 0.4, 0.78, C) + during(taken, 0.78, 1, C) + prompt + ding
}

const STOP_MS = 2800

/** Interrupted: he skids to a halt, dust flying, hands up, a pause sign beside him. */
function stopped(): string {
  const C = STOP_MS
  const lean = tfk('rotate', [[0, '4 12 12'], [0.2, '10 12 12'], [0.3, '0 12 12'], [1, '0 12 12']], C)
  const skid = moved(tfk('translate', [[0, '3.5 0'], [0.28, '0 0'], [1, '0 0']], C, { ease: '0.1 0.7 0.3 1' }), clawd({ eyes: 'wide', look: -0.4, walk: 160, liftL: 30, liftR: 30, move: lean }))
  const dust = puff(17, 11.5, C, 0.04, 0.32, 0.8) + puff(15.5, 11.6, C, 0.1, 0.38, 1) + puff(14, 11.6, C, 0.16, 0.44, 1.1)
  const halted = clawd({ eyes: 'wide', liftL: 78, liftR: 78, move: tf('rotate', ['-2 12 12', '2 12 12', '-2 12 12'], 300) })
  const still = clawd({ eyes: 'open', liftL: 78, liftR: 78, blink: 1400 })
  const pause = at(21.8, 4.6, pill(-1.2, -1.2, 0.85, 2.4, RED, 0.3) + pill(0.35, -1.2, 0.85, 2.4, RED, 0.3))

  return dust + during(skid, 0, 0.3, C) + during(halted, 0.3, 0.5, C) + during(still, 0.5, 1, C) + during(pause, 0.3, 1, C)
}

const SPAWN_MS = 3600

/** A subagent sent off: a mini Clawd pops out of him, hops down and runs off; he waves it goodbye. */
function subagent(): string {
  const C = SPAWN_MS
  const path: [number, string][] = [[0, '12 9'], [0.12, '12 9'], [0.22, '13 5.2'], [0.3, '16.5 4.6'], [0.42, '19.5 12'], [0.86, '28.5 12'], [1, '28.5 12']]
  const grow: [number, string][] = [[0, '0'], [0.12, '0'], [0.2, '0.42'], [1, '0.42']]
  const mini = moved(tfk('translate', path, C), moved(tfk('scale', grow, C), at(-12, -12, clawd({ look: 0.5, walk: 240 }))))
  const poof = ([[-1, -0.6], [1, -0.7], [0, -1.3]] as const).map(([dx, dy]) => puff(12.5 + dx, 5 + dy, C, 0.14, 0.3, 0.7)).join('')
  const wave: [number, string][] = [[0, R(0)], [0.42, R(0)], [0.48, R(-75)], [0.56, R(-40)], [0.64, R(-75)], [0.72, R(-40)], [0.8, R(0)], [1, R(0)]]
  const parent = clawd({
    moods: [['open', C * 0.42, 0], ['happy', C * 0.42, 0.5], ['open', C * 0.16, 0]],
    armR: tfk('rotate', wave, C),
    move: tfk('translate', [[0, '0 0'], [0.1, '0 0'], [0.14, '0 0.5'], [0.18, '0 -0.4'], [0.22, '0 0'], [1, '0 0']], C),
  })

  return parent + poof + mini
}

const COMPACT_MS = 3800

/** A messy stack of pages squashed flat, then a neat box in its place. */
function pages(): string {
  const C = COMPACT_MS
  const sheets = [4, -6, 8, -3, 6, -8]
    .map((r, i) => {
      const y = 11.2 - i * 0.95
      return `<rect x="${n(17.4 + (i % 2) * 0.4)}" y="${n(y)}" width="4.6" height="0.55" rx="0.2" fill="${PAGE}" transform="rotate(${r} 19.9 ${n(y + 0.27)})"/>`
    })
    .join('')
  const squash = about(19.9, 11.8, tfk('scale', [[0, '1 1'], [0.38, '1 1'], [0.5, '1 0.3'], [1, '1 0.3']], C), sheets)
  const box = pill(18.1, 8.7, 3.6, 3.1, BOX, 0.4) + pill(19.65, 8.7, 0.5, 3.1, shade(BOX, 0.18), 0) + pill(18.1, 8.7, 3.6, 0.6, shade(BOX, 0.08), 0.3)
  const boxed = about(19.9, 11.8, tfk('scale', [[0, '1.3 0.5'], [0.5, '1.3 0.5'], [0.56, '0.9 1.15'], [0.62, '1 1'], [1, '1 1']], C), box)

  return during(squash, 0, 0.52, C) + during(boxed, 0.5, 0.96, C)
}

/** A speech bubble up to his right with a cursor blinking in it: his turn is over, the person's is next. */
function yourTurn(): string {
  const bubble = `<path d="M19.3 6.1L18.4 7.5L20.4 6.4z" fill="${PAGE}"/><ellipse cx="21.6" cy="4.6" rx="2.6" ry="1.7" fill="${PAGE}"/>`
  return bubble + `<rect x="21.35" y="3.8" width="0.5" height="1.6" rx="0.1" fill="${BEZEL}">${anim('opacity', [1, 0], 1000, { discrete: true })}</rect>`
}

const COFFEE_MS = 4200
const SIP: [number, number][] = [[0, 0], [0.38, 0], [0.48, -55], [0.62, -55], [0.72, 0], [1, 0]]

/** A mug in his right hand, steam rising, kept upright as the arm lifts it to sip. */
function mug(): string {
  const arm = tfk('rotate', SIP.map(([t, d]) => [t, R(d)]), COFFEE_MS)
  const upright = tfk('rotate', SIP.map(([t, d]) => [t, n(-d)]), COFFEE_MS)
  const steam = [0, 700]
    .map(begin => `<path d="M${begin ? 0.3 : -0.3} -1.3q0.4 -0.5 0 -1q-0.4 -0.5 0 -1" fill="none" stroke="${PAGE}" stroke-width="0.25" stroke-linecap="round" opacity="0">${anim('opacity', [0, 0.7, 0], 1400, { begin })}${tf('translate', ['0 0.4', '0 -0.6'], 1400, { begin })}</path>`)
    .join('')
  const cup = pill(-0.8, -1.1, 1.6, 2, PAGE, 0.3) + pill(-0.65, -1.1, 1.3, 0.35, COFFEE, 0.15) + `<path d="M0.8 -0.6a0.55 0.55 0 0 1 0 1.1" fill="none" stroke="${PAGE}" stroke-width="0.35"/>` + steam

  return `<g transform="rotate(-15 16.7 7.5)">${moved(arm, at(19.4, 7.6, moved(upright, `<g transform="rotate(15)">${cup}</g>`)))}</g>`
}

const BROW_MS = 3200

/** Sweat beading on his head, then one drop flicked away as he wipes. */
function sweat(): string {
  const beads = [[9, 4.8], [15.4, 4.6]].map(([x, y]) => at(x!, y!, `<g>${keyed('opacity', [[0, 1], [0.4, 1], [0.45, 0], [1, 0]], BROW_MS)}${drop(0.6)}</g>`)).join('')
  const flick =
    `<g transform="translate(17.2 4.8)" opacity="0">` +
    keyed('opacity', [[0, 0], [0.7, 0], [0.72, 1], [0.95, 0], [1, 0]], BROW_MS) +
    moved(tfk('translate', [[0, '0 0'], [0.72, '0 0'], [0.85, '2.2 -1.2'], [0.95, '3.4 2'], [1, '3.4 2']], BROW_MS), drop(0.7)) +
    '</g>'

  return beads + flick
}

// ---- idle moments ----

const STRETCH_MS = 3800

function stretching(): string {
  const C = STRETCH_MS
  const up = (side: 'L' | 'R'): [number, string][] => {
    const p = side === 'L' ? '7.3 7.5' : '16.7 7.5'
    const d = side === 'L' ? 85 : -85
    return [[0, `0 ${p}`], [0.2, `0 ${p}`], [0.35, `${d} ${p}`], [0.65, `${d} ${p}`], [0.8, `0 ${p}`], [1, `0 ${p}`]]
  }
  const rig: Rig = { armL: tfk('rotate', up('L'), C), armR: tfk('rotate', up('R'), C), moods: [['open', C * 0.25, 0], ['closed', C * 0.5, 0], ['happy', C * 0.25, 0]] }
  const tall = tfk('scale', [[0, '1 1'], [0.2, '1 1'], [0.35, '0.95 1.1'], [0.65, '0.95 1.1'], [0.8, '1 1'], [1, '1 1']], C)

  return about(12, 12, tall, clawd(rig))
}

const YAWN_MS = 3800

function yawning(): string {
  const C = YAWN_MS
  const mouth = about(12, 8.6, tfk('scale', [[0, '0'], [0.25, '0'], [0.4, '1'], [0.6, '1'], [0.7, '0'], [1, '0']], C), `<ellipse cx="12" cy="8.6" rx="0.75" ry="0.9" fill="${INK}"/><ellipse cx="12" cy="9" rx="0.45" ry="0.35" fill="#B24A3A"/>`)
  const rig: Rig = { liftL: 20, liftR: 20, moods: [['open', C * 0.22, 0], ['closed', C * 0.5, 0], ['half', C * 0.28, 0]], breathe: [0.93, C / 2] }

  return about(12, 12, tfk('scale', [[0, '1 1'], [0.25, '1 1'], [0.45, '1 1.06'], [0.65, '1 1'], [1, '1 1']], C), clawd(rig)) + mouth
}

const HOP_MS = 2400

function hopping(): string {
  const C = HOP_MS
  const squash = tfk('scale', [[0, '1 1'], [0.15, '1 1'], [0.25, '1.08 0.88'], [0.32, '0.94 1.08'], [0.5, '1 1'], [0.62, '1.1 0.86'], [0.72, '1 1'], [1, '1 1']], C)
  const jump = tfk('translate', [[0, '0 0'], [0.25, '0 0'], [0.42, '0 -2.4'], [0.6, '0 0'], [1, '0 0']], C, { ease: '0.3 0 0.6 1' })

  return moved(jump, about(12, 12, squash, clawd({ eyes: 'happy', liftL: 20, liftR: 20 })))
}

const GLANCE_MS = 4200

/** A small arrow down by his feet, toward the prompt box he is looking at. */
function downArrow(): string {
  const arrow = `<path d="M5 9.4V10.9M4.3 10.3L5 11L5.7 10.3" stroke="${STEEL}" stroke-width="0.35" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  return `<g opacity="0">${keyed('opacity', [[0, 0], [0.38, 0], [0.42, 0.8], [0.68, 0.8], [0.72, 0], [1, 0]], GLANCE_MS)}${moved(tf('translate', ['0 0', '0 0.6', '0 0'], 700), arrow)}</g>`
}

const BUTTERFLY_MS = 5200
const ROUTE: [number, string][] = [[0, '21 4'], [0.15, '22.5 7.5'], [0.3, '17 3.2'], [0.42, '12 2.8'], [0.55, '6 4'], [0.68, '3.5 7.5'], [0.82, '8.5 3'], [1, '21 4']]

/** A butterfly fluttering round him on its route. */
function butterfly(): string {
  const wing = (side: number) =>
    `<g>${tf('scale', ['1 1', '0.2 1', '1 1'], 180)}<ellipse cx="${side * 0.55}" cy="-0.25" rx="0.6" ry="0.5" fill="${YELLOW}"/><ellipse cx="${side * 0.45}" cy="0.4" rx="0.42" ry="0.35" fill="${AMBER}"/></g>`
  return moved(tfk('translate', ROUTE, BUTTERFLY_MS), moved(tf('translate', ['0 0', '0 -0.4', '0 0'], 400), wing(-1) + wing(1) + pill(-0.12, -0.6, 0.24, 1.2, BEZEL, 0.12)))
}

/** His eyes following the butterfly on its route. */
const following = tfk(
  'translate',
  ROUTE.map(([t, p]): [number, string] => {
    const [x, y] = p.split(' ').map(Number)
    return [t, `${n(((x! - 12) / 12) * 0.7)} ${n(((y! - 7) / 5) * 0.5)}`]
  }),
  BUTTERFLY_MS,
)

export const MOMENTS: Pose[] = [
  {
    id: 'editing',
    alt: 'Clawd writing on a page',
    rest: { x: -3, look: 0.5, lookY: 0.2, liftR: 8 },
    loop: { armR: tf('rotate', [R(0), R(8), R(0)], 300), blink: 3200, breathe: [0.97, 1800] },
    props: card,
    propsFront: true,
    propMove: 'fade',
  },
  {
    id: 'command',
    alt: 'Clawd running a command',
    rest: { x: -3.5, look: 0.5, lookY: 0.15, liftR: -10 },
    loop: { armR: tfk('rotate', TYPING, COMMAND_MS), blink: 3000 },
    props: terminal,
    propMove: 'fade',
  },
  {
    id: 'searching',
    alt: 'Clawd searching with a magnifying glass',
    rest: { x: -4, look: 0.5, lookY: 0.4, liftR: -12 },
    scene: searching,
  },
  {
    id: 'web',
    alt: 'Clawd pointing at a spinning globe',
    rest: { x: -3, look: 0.5, lookY: -0.2, liftR: 30 },
    loop: { armR: tf('rotate', [R(0), R(-6), R(0)], 1200), blink: 3400, breathe: [0.96, 2400] },
    props: globe,
    propMove: 'fade',
  },
  { id: 'shipping', alt: 'Clawd launching a rocket', rest: { x: -3, look: 0.5 }, scene: shipping, cycle: SHIP_MS },
  {
    id: 'thinking',
    alt: 'Clawd thinking',
    rest: { look: 0.35, lookY: -0.45 },
    loop: { breathe: [0.96, 2600], blink: 3600, move: tf('rotate', ['-2 12 12', '2 12 12', '-2 12 12'], 2800) },
    props: thought,
    propMove: 'fade',
  },
  { id: 'listening', alt: 'Clawd catching your prompt', rest: {}, scene: listening, cycle: LISTEN_MS },
  { id: 'stopped', alt: 'Clawd stopping short', rest: { eyes: 'wide', liftL: 78, liftR: 78 }, scene: stopped, cycle: STOP_MS },
  { id: 'subagent', alt: 'Clawd sending off a mini Clawd', rest: {}, scene: subagent, cycle: SPAWN_MS },
  {
    id: 'compacting',
    alt: 'Clawd packing pages into a box',
    rest: { x: -3, look: 0.5, liftR: 60 },
    loop: {
      armR: tfk('rotate', [[0, R(0)], [0.3, R(0)], [0.42, R(-30)], [0.5, R(40)], [0.6, R(0)], [1, R(0)]], COMPACT_MS),
      moods: [['open', COMPACT_MS * 0.36, 0.5], ['closed', COMPACT_MS * 0.2, 0], ['happy', COMPACT_MS * 0.44, 0.3]],
      move: tfk('translate', [[0, '0 0'], [0.3, '0 0'], [0.4, '0 -1.3'], [0.5, '0 0.2'], [0.56, '0 0'], [1, '0 0']], COMPACT_MS),
    },
    props: pages,
    propMove: 'fade',
  },
  {
    id: 'waiting',
    alt: 'Clawd waiting on you',
    rest: { liftL: -35, liftR: -35 },
    loop: { tap: 500, blink: 3000, breathe: [0.94, 4000], eyesMove: tfk('translate', [[0, '0 0'], [0.4, '0 0'], [0.46, '-0.3 0.5'], [0.75, '-0.3 0.5'], [0.82, '0 0'], [1, '0 0']], 4000) },
    props: yourTurn,
    propMove: 'fade',
  },
  {
    id: 'coffee',
    alt: 'Clawd sipping a coffee',
    rest: { liftR: 15 },
    loop: { armR: tfk('rotate', SIP.map(([t, d]) => [t, R(d)]), COFFEE_MS), moods: [['open', COFFEE_MS * 0.42, 0.3], ['closed', COFFEE_MS * 0.3, 0], ['happy', COFFEE_MS * 0.28, 0]], breathe: [0.96, 2800] },
    props: mug,
    propsFront: true,
    propMove: 'fade',
    cycle: COFFEE_MS,
  },
  {
    id: 'brow',
    alt: 'Clawd wiping his brow',
    rest: { liftR: 110, armFront: true },
    loop: {
      armR: tfk('rotate', [[0, R(0)], [0.3, R(0)], [0.42, R(-60)], [0.55, R(-35)], [0.62, R(-60)], [0.75, R(0)], [1, R(0)]], BROW_MS),
      moods: [['open', BROW_MS * 0.3, 0], ['closed', BROW_MS * 0.45, 0], ['happy', BROW_MS * 0.25, 0]],
      breathe: [0.94, 1600],
    },
    props: sweat,
    propsFront: true,
    propMove: 'fade',
    cycle: BROW_MS,
  },
  { id: 'stretch', alt: 'Clawd stretching', rest: {}, scene: stretching, cycle: STRETCH_MS },
  { id: 'yawn', alt: 'Clawd yawning', rest: {}, scene: yawning, cycle: YAWN_MS },
  { id: 'hop', alt: 'Clawd hopping', rest: {}, scene: hopping, cycle: HOP_MS },
  {
    id: 'glance',
    alt: 'Clawd glancing at the prompt',
    rest: {},
    loop: {
      blink: 3000,
      eyesMove: tfk('translate', [[0, '0 0'], [0.3, '0 0'], [0.36, '-0.2 0.55'], [0.7, '-0.2 0.55'], [0.76, '0 0'], [1, '0 0']], GLANCE_MS),
      move: tfk('rotate', [[0, '0 12 12'], [0.3, '0 12 12'], [0.38, '-4 12 12'], [0.7, '-4 12 12'], [0.78, '0 12 12'], [1, '0 12 12']], GLANCE_MS),
    },
    props: downArrow,
    propMove: 'fade',
    cycle: GLANCE_MS,
  },
  {
    id: 'butterfly',
    alt: 'Clawd watching a butterfly',
    rest: {},
    loop: {
      eyesMove: following,
      armR: tfk('rotate', [[0, R(0)], [0.32, R(0)], [0.4, R(-95)], [0.48, R(0)], [1, R(0)]], BUTTERFLY_MS),
      move: tfk('translate', [[0, '0 0'], [0.33, '0 0'], [0.4, '0 -1.4'], [0.48, '0 0'], [1, '0 0']], BUTTERFLY_MS),
      blink: 2600,
    },
    props: butterfly,
    propsFront: true,
    propMove: 'fade',
    cycle: BUTTERFLY_MS,
  },
]
