/**
 * The AI Tool Settings pane's picture on surfaces that draw SVG (the desktop Code tab): Clawd in a hard hat, cranking
 * a cog round with a wrench.
 *
 * The pruner's grid (24 x 26, three text rows tall): Clawd is the bar's rig moved down DROP rows to stand on the
 * bottom one, the cog up to his right.
 */

import { PANE_PICTURE_HEIGHT } from './mascot'
import { clawd, shade, tf } from './rig'

const LEFT = 3
const W = 24
const H = 26
/** Screen pixels per grid unit: the grid fills PANE_PICTURE_HEIGHT. */
const SCALE = PANE_PICTURE_HEIGHT / H
/** How far Clawd's frame moves down to stand on the bottom row. */
const DROP = 14

const STEEL = '#9A9893'
const HOLE = '#3B3B39'
const GRIP = '#E0524C'

/** CSS pixels the picture takes in the pane. */
export const FOREMAN_WIDTH = Math.round(W * SCALE)
export const FOREMAN_HEIGHT = PANE_PICTURE_HEIGHT

/** The cog's middle, up to his right, where the wrench grips its hub. */
const CX = 20.8
const CY = 11.5

/** How long the cog takes to turn once. */
const TURN_MS = 6000

/** The cog, turning round its hub: eight rounded teeth on a round body, a dark hole in the middle. */
function cog(): string {
  const teeth = Array.from({ length: 8 }, (_, i) => `<rect x="-0.9" y="-5.5" width="1.8" height="1.8" rx="0.3" transform="rotate(${i * 45})" fill="${STEEL}"/>`).join('')
  const turning = tf('rotate', ['0', '360'], TURN_MS, { ease: '0 0 1 1' })

  return `<g transform="translate(${CX} ${CY})"><g>${turning}${teeth}<circle r="4" fill="${STEEL}"/><circle r="1.9" fill="${shade(STEEL, 0.3)}"/><circle r="1.1" fill="${HOLE}"/></g></g>`
}

/** The wrench from his raised hand up to the hub: a red grip, a steel shaft. */
const WRENCH =
  `<path d="M15.9 19.4L19.6 13.2" stroke="${shade(STEEL, 0.25)}" stroke-width="0.8" stroke-linecap="round"/>` +
  `<rect x="15.3" y="18.6" width="1.3" height="2.2" rx="0.55" fill="${GRIP}" transform="rotate(35 15.9 19.7)"/>`

/** Cranking: the cog turns while he leans into the wrench, stepping in place, blinking now and then. */
function cranking(): string {
  const leaning = clawd({ x: -3, hat: true, look: 0.5, lookY: -0.4, liftR: 40, walk: 1000, blink: 3000, move: tf('rotate', ['0 12 12', '4 12 12', '0 12 12'], 1000) })

  return cog() + WRENCH + `<g transform="translate(0 ${DROP})">${leaning}</g>`
}

/** What the picture says, for a reader that cannot see it. */
export const FOREMAN_ALT = 'Clawd in a hard hat, turning a cog with a wrench'

let drawn: string | null = null

/** The drawing, built once: the same source keeps the animation playing across redraws. */
export function foremanSvg(): string {
  drawn ??= `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LEFT} 0 ${W} ${H}" width="${FOREMAN_WIDTH}" height="${FOREMAN_HEIGHT}">${cranking()}</svg>`

  return drawn
}
