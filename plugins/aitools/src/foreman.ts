/**
 * The AI Tool Settings pane's picture on surfaces that draw SVG (the desktop Code tab): Clawd in a hard hat, cranking
 * a cog round with a wrench.
 *
 * The pruner's grid (24 x 26 pixels, three text rows tall): Clawd is the bar's mascot moved down DROP rows to stand
 * on the bottom one, the cog up to his right.
 */

import { PANE_PICTURE_HEIGHT, figure, rect, standing } from './mascot'
import { cycle } from './pruner'

const LEFT = 3
const W = 24
const H = 26
/** Screen pixels per grid pixel: the grid fills PANE_PICTURE_HEIGHT. */
const SCALE = PANE_PICTURE_HEIGHT / H
/** How far Clawd's frame moves down to stand on the bottom row. */
const DROP = 14

const STEEL = '#9A9893'
const STEEL_DARK = '#6E6E6A'
const HOLE = '#3B3B39'
const GRIP = '#E0524C'

/** CSS pixels the picture takes in the pane. */
export const FOREMAN_WIDTH = Math.round(W * SCALE)
export const FOREMAN_HEIGHT = PANE_PICTURE_HEIGHT

const dots = (pts: [number, number][], c: string) => pts.map(([x, y]) => rect(x, y, 1, 1, c)).join('')
const down = (s: string) => `<g transform="translate(0 ${DROP})">${s}</g>`

/** The cog's middle, up to his right, where the wrench grips its hub. */
const CX = 20
const CY = 11

/** The cog's round body, a row at a time from the top: each row's half-width either side of the middle. */
const BODY = [2, 3, 4, 4, 4, 4, 4, 3, 2]

/** The cog's eight teeth: one on each side, 3 x 2, and one at each corner, 2 x 2, out past the body. */
const TEETH: [number, number, number, number][] = [
  [-1, -6, 3, 2], [-1, 5, 3, 2], [-6, -1, 2, 3], [5, -1, 2, 3],
  [-5, -5, 2, 2], [4, -5, 2, 2], [-5, 4, 2, 2], [4, 4, 2, 2],
]

/** How long the cog takes to turn once. */
const TURN_MS = 6000

/** The cog, turning round its hub: eight teeth on a round body, a dark hole in the middle. */
function cog(): string {
  const body = BODY.map((half, i) => rect(CX - half, CY - 4 + i, half * 2 + 1, 1, STEEL)).join('')
  const teeth = TEETH.map(([x, y, w, h]) => rect(CX + x, CY + y, w, h, STEEL)).join('')
  const ring = rect(CX - 2, CY - 2, 5, 5, STEEL_DARK) + rect(CX - 1, CY - 1, 3, 3, HOLE)
  const hub = `${CX + 0.5} ${CY + 0.5}`

  return `<g><animateTransform attributeName="transform" type="rotate" from="0 ${hub}" to="360 ${hub}" dur="${TURN_MS}ms" repeatCount="indefinite"/>${teeth}${body}${ring}</g>`
}

/** The wrench from his raised hand up to the hub: a red grip, a steel shaft, its jaw round the hub. */
const WRENCH =
  dots([[17, 20], [17, 19]], GRIP) +
  dots([[18, 18], [18, 17], [19, 16], [19, 15], [19, 14], [20, 13]], STEEL_DARK) +
  dots([[19, 12], [21, 12]], STEEL_DARK)

/** Cranking: the cog turns while he leans into the wrench a step at a time, blinking now and then. */
function cranking(): string {
  const at = (step: 'A' | 'B', eyes: 'open' | 'half' = 'open') =>
    down(figure(standing({ x: -4, arms: 'hold', legs: step, lookY: -1, look: 1, eyes, hat: true })))

  return cog() + WRENCH + cycle([
    [at('A'), 500],
    [at('B'), 500],
    [at('A'), 500],
    [at('B'), 500],
    [at('A'), 500],
    [at('B', 'half'), 160],
    [at('B'), 340],
  ])
}

/** What the picture says, for a reader that cannot see it. */
export const FOREMAN_ALT = 'Clawd in a hard hat, turning a cog with a wrench'

let drawn: string | null = null

/** The drawing, built once: the same source keeps the animation playing across redraws. */
export function foremanSvg(): string {
  drawn ??= `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LEFT} 0 ${W} ${H}" width="${FOREMAN_WIDTH}" height="${FOREMAN_HEIGHT}" shape-rendering="crispEdges">${cranking()}</svg>`

  return drawn
}
