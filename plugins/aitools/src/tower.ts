/**
 * The Project pane's picture on surfaces that draw SVG (the desktop Code tab): Clawd beside a tower of task blocks.
 * Blocks drop in and stack while the board has open items, and he throws his arms up as the last lands; with nothing
 * open he sleeps by the finished tower, all in grey; with no board to read he scratches his head at a fallen block.
 *
 * The pruner's grid (24 x 26, three text rows tall): Clawd is the bar's rig moved down DROP rows to stand on the
 * bottom one, the tower to his right.
 */

import { PANE_PICTURE_HEIGHT } from './mascot'
import { ASLEEP, anim, clawd, during, pill, question, shade, swing, tf, zzz } from './rig'
import type { TowerMode } from '../types'

const LEFT = 3
const W = 24
const H = 26
/** Screen pixels per grid unit: the grid fills PANE_PICTURE_HEIGHT. */
const SCALE = PANE_PICTURE_HEIGHT / H
/** How far Clawd's frame moves down to stand on the bottom row. */
const DROP = 14
/** Clawd steps left to make room for the tower. */
const X = -2

/** The blocks bottom to top: done, done, in progress, to do. */
const BLOCKS = ['#7FB685', '#7FB685', '#E8B04B', '#9A9893'] as const
/** Asleep, the tower turns a grey a little lighter than Clawd's. */
const ASLEEP_BLOCK = '#6E6E6A'

/** One stacking round: the blocks drop in one after another, then all go and it starts again. */
const ROUND = 4000

/** CSS pixels the picture takes in the pane. */
export const TOWER_WIDTH = Math.round(W * SCALE)
export const TOWER_HEIGHT = PANE_PICTURE_HEIGHT

const down = (s: string) => `<g transform="translate(0 ${DROP})">${s}</g>`

/** The `i`-th block from the bottom: a rounded 4.4 x 3.1 block with a lighter top edge, standing on the one below. */
const block = (i: number, c: string, x = 21.5, y = 22.9 - i * 3.4) =>
  pill(x, y, 4.4, 3.1, c, 0.5) + pill(x + 0.5, y + 0.45, 3.4, 0.35, '#FFFFFF38', 0.17)

/** Blocks dropping onto the stack in turn with a small bounce; all clear before the next round. */
function building(): string {
  const blocks = BLOCKS.map((c, i) => {
    const at = 0.02 + i * 0.18
    const fade = anim('opacity', [0, 0, 1, 1, 0], ROUND, { times: [0, at, at + 0.03, 0.93, 1] })
    const drop = tf('translate', ['0 -8', '0 -8', '0 0.3', '0 0', '0 0'], ROUND, { times: [0, at, at + 0.07, at + 0.1, 1] })
    return `<g opacity="0">${fade}<g>${drop}${block(i, c)}</g></g>`
  }).join('')
  // He watches each block land, then cheers as the last settles.
  const cheer = 1 - 1100 / ROUND
  const watching = clawd({ x: X, look: 0.5, lookY: -0.4, blink: 2600, breathe: [0.97, 2000] })
  const cheering = clawd({ x: X, eyes: 'happy', liftL: 60, liftR: 60, move: tf('translate', ['0 0', '0 -1.2', '0 0'], 500) })

  return blocks + during(down(watching), 0, cheer, ROUND) + during(down(cheering), cheer, 1, ROUND)
}

/** Asleep by the finished tower, he and it in grey. */
function resting(): string {
  const tower = BLOCKS.map((_, i) => block(i, i % 2 ? ASLEEP_BLOCK : shade(ASLEEP_BLOCK, 0.08))).join('')
  const asleep = clawd({ x: X, color: ASLEEP, sit: true, y: 2, eyes: 'closed', liftL: -55, liftR: -55, breathe: [0.9, 4200] })

  return tower + down(asleep + zzz(X + 19.5, 6.5, ASLEEP))
}

/** The tower fallen: one block left standing, one on its side, and Clawd scratching his head with a question mark. */
function puzzled(): string {
  // The fallen block lies on its side, its lighter top edge turned to face him.
  const fallen = block(0, BLOCKS[0]) + pill(17.6, 21.6, 3.1, 4.4, BLOCKS[2], 0.5) + pill(18.05, 22.1, 0.35, 3.4, '#FFFFFF38', 0.17)
  const scratching = clawd({ x: X, look: 0.5, blink: 2800, liftR: 115, armFront: true, armR: swing('R', 14, 400) })

  return fallen + question(18.5, 13) + down(scratching)
}

const DRAW: Record<TowerMode, () => string> = { building, resting, puzzled }

const ALT: Record<TowerMode, string> = {
  building: 'Clawd stacking task blocks',
  resting: 'Clawd asleep by a finished tower',
  puzzled: 'Clawd puzzled by a fallen tower',
}

/** What the picture says, for a reader that cannot see it. */
export function towerAlt(mode: TowerMode): string {
  return ALT[mode]
}

/** Each drawing built once: the pane redraws on every read, and the same source keeps the animation playing. */
const drawn = new Map<TowerMode, string>()

export function towerSvg(mode: TowerMode): string {
  let source = drawn.get(mode)
  if (source === undefined) {
    source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LEFT} 0 ${W} ${H}" width="${TOWER_WIDTH}" height="${TOWER_HEIGHT}">${DRAW[mode]()}</svg>`
    drawn.set(mode, source)
  }

  return source
}
