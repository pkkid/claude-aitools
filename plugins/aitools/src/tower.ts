/**
 * The Project pane's picture on surfaces that draw SVG (the desktop Code tab): Clawd beside a tower of task blocks.
 * Blocks drop in and stack while the board has open items, and he throws his arms up as the last lands; with nothing
 * open he sleeps by the finished tower, all in grey; with no board to read he scratches his head at a fallen block.
 *
 * The pruner's grid (24 x 26 pixels, three text rows tall): Clawd is the bar's mascot moved down DROP rows to stand
 * on the bottom one, the tower to his right.
 */

import { O, PANE_PICTURE_HEIGHT, ZZZ, figure, rect, sitting, standing, zzz } from './mascot'
import { cycle } from './pruner'
import type { TowerMode } from '../types'

const LEFT = 3
const W = 24
const H = 26
/** Screen pixels per grid pixel: the grid fills PANE_PICTURE_HEIGHT. */
const SCALE = PANE_PICTURE_HEIGHT / H
/** How far Clawd's frame moves down to stand on the bottom row. */
const DROP = 14

/** The blocks bottom to top: done, done, in progress, to do. */
const BLOCKS = ['#7FB685', '#7FB685', '#E8B04B', '#9A9893'] as const
/** Asleep, Clawd, his Zzz and the tower turn these quiet greys, as the pruner's nap does. */
const ASLEEP = '#5C5C58'
const ASLEEP_BLOCK = '#6E6E6A'
const ASLEEP_EDGE = '#4A4A47'

/** One stacking round: the blocks drop in one after another, then all go and it starts again. */
const ROUND = 4000

/** CSS pixels the picture takes in the pane. */
export const TOWER_WIDTH = Math.round(W * SCALE)
export const TOWER_HEIGHT = PANE_PICTURE_HEIGHT

const ms = (n: number) => `${Math.round(n)}ms`
const dots = (pts: [number, number][], c: string) => pts.map(([x, y]) => rect(x, y, 1, 1, c)).join('')
const down = (s: string) => `<g transform="translate(0 ${DROP})">${s}</g>`

/** The `i`-th block from the bottom, 6 x 3 with a darker bottom edge. */
const block = (i: number, c: string, edge = '#00000040') => rect(19, 23 - i * 3, 6, 3, c) + rect(19, 25 - i * 3, 6, 1, edge)

/** Blocks dropping onto the stack in turn, each falling the last rows into place; all clear before the next round. */
function building(): string {
  const blocks = BLOCKS.map((c, i) => {
    const at = i * 0.18
    const keys = (n: number) => n.toFixed(2)
    return (
      `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;${keys(at)};0.92;0.96" calcMode="discrete" dur="${ms(ROUND)}" repeatCount="indefinite"/>` +
      `<g><animateTransform attributeName="transform" type="translate" values="0 -6;0 -3;0 0;0 0" keyTimes="0;${keys(at + 0.03)};${keys(at + 0.06)};1" calcMode="discrete" dur="${ms(ROUND)}" repeatCount="indefinite"/>${block(i, c)}</g></g>`
    )
  }).join('')
  const clawd = cycle([
    [down(figure(standing({ x: -5, look: 1, lookY: -1 }))), 1400],
    [down(figure(standing({ x: -5, look: 1, lookY: -1, eyes: 'half' }))), 140],
    [down(figure(standing({ x: -5, look: 1, lookY: -1 }))), ROUND - 1400 - 140 - 1100],
    [down(figure(standing({ x: -5, arms: 'up', eyes: 'happy' }))), 1100],
  ])

  return blocks + clawd
}

/** Asleep by the finished tower, he and it in grey. */
function resting(): string {
  const tower = BLOCKS.map((_, i) => block(i, ASLEEP_BLOCK, ASLEEP_EDGE)).join('')
  const asleep = (figure(sitting({ x: -4 })) + `<g transform="translate(-5 0)">${zzz(0)}</g>`).replaceAll(O, ASLEEP).replaceAll(ZZZ, ASLEEP)

  return tower + down(asleep)
}

const QUESTION: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 2], [1, 4]]

/** The tower fallen: one block left standing, one on its side, and Clawd looking at them with a question mark. */
function puzzled(): string {
  const fallen = block(0, BLOCKS[0]) + rect(22, 17, 3, 6, BLOCKS[2]) + rect(24, 17, 1, 6, '#00000040')
  const mark = `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 1" calcMode="discrete" dur="1s" repeatCount="indefinite"/>${dots(
    QUESTION.map(([x, y]) => [14 + x, 11 + y]),
    O,
  )}</g>`
  const clawd = cycle([
    [down(figure(standing({ x: -5, look: 1 }))), 2600],
    [down(figure(standing({ x: -5, look: 1, eyes: 'half' }))), 140],
  ])

  return fallen + mark + clawd
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
    source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LEFT} 0 ${W} ${H}" width="${TOWER_WIDTH}" height="${TOWER_HEIGHT}" shape-rendering="crispEdges">${DRAW[mode]()}</svg>`
    drawn.set(mode, source)
  }

  return source
}
