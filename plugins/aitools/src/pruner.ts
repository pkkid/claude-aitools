/**
 * The Worktrees pane's picture on surfaces that draw SVG (the desktop Code tab): Clawd beside a tree. He snips a
 * stray branch off it with shears while the project has worktrees, sweeps up with a broom while some are being
 * removed, and naps under it, all in grey, when there are none but the main checkout.
 *
 * The totem's grid (24 x 26, three text rows tall): Clawd is the bar's rig moved down DROP rows to stand on the
 * bottom one, the tree to his right.
 */

import { PANE_PICTURE_HEIGHT } from './mascot'
import { ASLEEP, anim, clawd, n, pill, shade, tf, zzz } from './rig'

const LEFT = 3
const W = 24
const H = 26
/** Screen pixels per grid unit: the grid fills PANE_PICTURE_HEIGHT. */
const SCALE = PANE_PICTURE_HEIGHT / H
/** How far Clawd's frame moves down to stand on the bottom row. */
const DROP = 14

const BARK = '#8B5A3C'
const LEAF = '#7FB685'
const STEEL = '#9A9893'
const STEEL_LIGHT = '#B9B7B1'
const GRIP = '#E0524C'
const STRAW = '#E8B04B'
const DUST = '#85837D'

/** Asleep, the tree turns greys a little lighter than Clawd's. */
const ASLEEP_BARK = '#4A4A47'
const ASLEEP_LEAF = '#6E6E6A'

/** CSS pixels the picture takes in the pane. */
export const PRUNER_WIDTH = Math.round(W * SCALE)
export const PRUNER_HEIGHT = PANE_PICTURE_HEIGHT

/** What Clawd is doing: snipping while there are worktrees, sweeping while some are removed, napping with none. */
export type PrunerMode = 'pruning' | 'sweeping' | 'napping'

const down = (s: string) => `<g transform="translate(0 ${DROP})">${s}</g>`

/** The tree at the right edge: a trunk to the ground, three rounded clumps of leaves on top. */
function tree(bark: string, leaf: string): string {
  const trunk = pill(24, 11, 1.8, 15, bark, 0.4)
  const canopy =
    `<circle cx="22.2" cy="7" r="3.4" fill="${leaf}"/>` +
    `<circle cx="24.8" cy="8.6" r="2.2" fill="${shade(leaf, 0.08)}"/>` +
    `<circle cx="20.6" cy="9.6" r="2.4" fill="${leaf}"/>`

  return trunk + canopy
}

/** How long one snip takes: the blades close, a leaf falls, they open again. */
const SNIP = 1650

/** Snipping a stray branch off the tree; a leaf drifts down on each snip. */
function pruning(): string {
  const stray = `<path d="M24 17.4Q22.9 16.9 21.7 16" stroke="${BARK}" stroke-width="0.7" stroke-linecap="round" fill="none"/><ellipse cx="21" cy="15.6" rx="0.9" ry="0.5" fill="${LEAF}"/>`
  const blade = (open: number, c: string) =>
    `<g>${tf('rotate', [`${open}`, `${open}`, '0', `${open}`], SNIP, { times: [0, 0.3, 0.45, 1] })}<path d="M0 0L4.2 -3" stroke="${c}" stroke-width="0.55" stroke-linecap="round"/></g>`
  const shears = `<g transform="translate(18 20.3)">${blade(-20, STEEL)}${blade(20, STEEL_LIGHT)}<circle r="0.75" fill="${GRIP}"/></g>`
  const falling =
    `<ellipse cx="21" cy="15.6" rx="0.8" ry="0.45" fill="${LEAF}" opacity="0">` +
    anim('opacity', [0, 0, 1, 1, 0], SNIP, { times: [0, 0.44, 0.46, 0.9, 1] }) +
    tf('translate', ['0 0', '0 0', '0.8 3', '-0.3 6', '0.5 8.6'], SNIP, { times: [0, 0.45, 0.65, 0.85, 1] }) +
    '</ellipse>'
  const holding = clawd({ x: -1, look: 0.5, liftR: 30, blink: 3400 })

  return tree(BARK, LEAF) + stray + falling + down(holding) + shears
}

/** Sweeping with a broom, stepping in place, dust puffing off to the right. */
function sweeping(): string {
  const broom =
    `<g transform="translate(17.3 21.6)"><g>${tf('rotate', ['6', '-8', '6'], 500)}` +
    `<path d="M-1.2 -3.4L2.4 3.2" stroke="${BARK}" stroke-width="0.6" stroke-linecap="round"/><path d="M1.3 3.1L3.6 2.5L4.9 4.4H1.8z" fill="${STRAW}"/></g></g>`
  const puff = (x: number, y: number, begin: number) =>
    `<circle cx="${n(x)}" cy="${n(y)}" r="0.5" fill="${DUST}" opacity="0">${anim('opacity', [0, 0.8, 0], 1000, { begin })}${anim('r', [0.3, 1.1, 1.4], 1000, { begin })}${tf('translate', ['0 0', '1.2 -0.8', '2 -1.6'], 1000, { begin })}</circle>`
  const sweeper = clawd({ x: -2, look: 0.5, walk: 500, liftR: -10, blink: 3000 })

  return tree(BARK, LEAF) + down(sweeper) + broom + puff(23, 25, 0) + puff(24, 24.5, 450)
}

/** Asleep under the tree, he and it in grey. */
function napping(): string {
  const asleep = clawd({ x: -2, color: ASLEEP, sit: true, y: 2, eyes: 'closed', liftL: -55, liftR: -55, breathe: [0.9, 4200] })

  return tree(ASLEEP_BARK, ASLEEP_LEAF) + down(asleep + zzz(16.5, 6.5, ASLEEP))
}

const DRAW: Record<PrunerMode, () => string> = { pruning, sweeping, napping }

const ALT: Record<PrunerMode, string> = {
  pruning: 'Clawd pruning a tree',
  sweeping: 'Clawd sweeping up',
  napping: 'Clawd asleep under a tree',
}

/** What the picture says, for a reader that cannot see it. */
export function prunerAlt(mode: PrunerMode): string {
  return ALT[mode]
}

/** Each drawing built once: the pane redraws on every refresh, and the same source keeps the animation playing. */
const drawn = new Map<PrunerMode, string>()

export function prunerSvg(mode: PrunerMode): string {
  let source = drawn.get(mode)
  if (source === undefined) {
    source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LEFT} 0 ${W} ${H}" width="${PRUNER_WIDTH}" height="${PRUNER_HEIGHT}">${DRAW[mode]()}</svg>`
    drawn.set(mode, source)
  }

  return source
}
