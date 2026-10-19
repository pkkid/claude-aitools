/**
 * The Background tasks pane's picture on surfaces that draw SVG (the desktop Code tab): Clawd with a mini Clawd stacked on
 * his head for each task running, asleep when none is.
 *
 * A 24 x 26 grid scaled to PANE_PICTURE_HEIGHT, three text rows tall, as every pane picture is.
 * Clawd is the bar's rig moved down DROP rows to stand on the bottom one; each mini Clawd is a 9 x 3 body on four
 * short legs, standing on the head of the one below.
 */

import { PANE_PICTURE_HEIGHT } from './mascot'
import { ASLEEP, INK, O, clawd, n, pill, shade, tf, zzz } from './rig'

const LEFT = 3
const W = 24
const H = 26
/** Screen pixels per grid unit: the grid fills PANE_PICTURE_HEIGHT. */
const SCALE = PANE_PICTURE_HEIGHT / H
/** How far Clawd's frame moves down to stand on the bottom row. */
const DROP = 14
/** The top of Clawd's body, where the stack starts. */
const HEAD = 5 + DROP
/** Clawd steps right to stand centered. */
const X = 2
/** The left edge of a mini Clawd's body, centered over Clawd's. */
const MINI_X = 9.5

/** CSS pixels the picture takes in the pane. */
export const TOTEM_WIDTH = Math.round(W * SCALE)
export const TOTEM_HEIGHT = PANE_PICTURE_HEIGHT
/** Mini Clawds the stack shows at most; with more running it stays full. */
export const TOTEM_MAX = 4

/**
 * The `k`th mini Clawd up the stack: stepping in place, blinking now and then, and (above the first) swaying either
 * way, each a little out of step with the one below.
 */
function mini(k: number): string {
  const y = HEAD - 4 * (k + 1)
  const legs = [1, 3, 5, 7]
    .map((dx, i) => {
      const step = tf('translate', i % 2 ? ['0 0', '0 -0.5', '0 0', '0 0', '0 0'] : ['0 0', '0 0', '0 0', '0 -0.5', '0 0'], 600, { begin: k * 150 })
      return `<g>${step}${pill(MINI_X + dx, y + 2.6, 0.9, 1.4, i === 1 || i === 2 ? shade(O, 0.2) : shade(O, 0.1), 0.4)}</g>`
    })
    .join('')
  const arms = pill(MINI_X - 1, y + 1, 1.3, 0.9, shade(O, 0.1), 0.4) + pill(MINI_X + 8.7, y + 1, 1.3, 0.9, shade(O, 0.1), 0.4)
  const eyes = [2.3, 6.7]
    .map(dx => `<g transform="translate(${n(MINI_X + dx)} ${y + 1.3})"><g>${tf('scale', ['1 1', '1 1', '1 0.15', '1 1'], 3000 + k * 700, { times: [0, 0.94, 0.97, 1], begin: k * 400 })}<rect x="-0.4" y="-0.6" width="0.8" height="1.2" rx="0.4" fill="${INK}"/></g></g>`)
    .join('')
  const sway = k === 0 ? '' : tf('translate', ['0 0', '0.6 0', '0 0', '-0.6 0', '0 0'], 1600, { begin: k * 200 })

  return `<g>${sway}${legs}${arms}${pill(MINI_X, y, 9, 3, O, 0.9)}${eyes}</g>`
}

/** Clawd at the bottom of the stack: asleep (in grey) with no subagent running, else standing and blinking. */
function base(running: number): string {
  const drawn =
    running === 0
      ? clawd({ x: X, color: ASLEEP, sit: true, y: 2, eyes: 'closed', liftL: -55, liftR: -55, breathe: [0.9, 4200] }) + zzz(X + 19.5, 6.5, ASLEEP)
      : clawd({ x: X, blink: 3400, breathe: [0.97, 2400] })

  return `<g transform="translate(0 ${DROP})">${drawn}</g>`
}

/** What the picture says, for a reader that cannot see it. */
export function totemAlt(running: number): string {
  return running === 0 ? 'Clawd asleep' : `Clawd with ${running} mini Clawd${running === 1 ? '' : 's'} stacked on his head`
}

/**
 * The picture for `running` subagents. The source only changes with what is drawn, so the pane's redraws while the
 * count holds keep the animation playing.
 */
export function totemSvg(running: number): string {
  const count = Math.min(TOTEM_MAX, Math.max(0, running))
  let source = drawn.get(count)
  if (source === undefined) {
    source = draw(count)
    drawn.set(count, source)
  }

  return source
}

/** Each drawing built once: there are only TOTEM_MAX + 1 of them, and the pane redraws each second while one runs. */
const drawn = new Map<number, string>()

function draw(count: number): string {
  const stack = Array.from({ length: count }, (_, k) => mini(k)).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LEFT} 0 ${W} ${H}" width="${TOTEM_WIDTH}" height="${TOTEM_HEIGHT}">${base(count)}${stack}</svg>`
}
