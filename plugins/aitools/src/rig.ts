/**
 * The drawing kit every Clawd picture is made with: the flat rig that draws Clawd himself, the SMIL helpers that move
 * him, and the small props more than one picture uses (a question mark, rising Zs).
 *
 * The rig's frame is the bar's 28 x 12 grid: body 10 x 5 at (7, 5), arms on its middle row turning about the
 * shoulders, four legs below to row 12. A picture moves him with `x` and `y`, or by wrapping what the rig returns.
 */

export const O = '#D77757' // Claude orange
export const INK = '#141413' // eyes
/** Asleep in a pane, Clawd, his Zzz and what is around him turn this quiet grey, so an idle pane stays calm. */
export const ASLEEP = '#5C5C58'
const ZZZ = '#8E96B8'
const HAT = '#F2C14E'

// ---- drawing helpers ----

/** A colour mixed toward black by `t` (0 to 1): limbs a shade darker than the body, the inner legs darker still. */
export function shade(c: string, t: number): string {
  const v = [1, 3, 5].map(i => Math.round(parseInt(c.slice(i, i + 2), 16) * (1 - t)))
  return '#' + v.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Numbers kept to three places, so the sources stay short. */
export const n = (v: number) => String(+v.toFixed(3))
export const ms = (v: number) => `${Math.round(v)}ms`

/** A rounded rectangle. */
export const pill = (x: number, y: number, w: number, h: number, c: string, r = 0.5) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${c}"/>`

/** The easing every smooth animation uses: slow in, slow out. */
const EASE = '0.45 0 0.55 1'

type Anim = {
  /** Where each value falls in the cycle, 0 to 1; evenly spaced if left out. */
  times?: number[]
  begin?: number
  /** Jump from value to value rather than ease between them. */
  discrete?: boolean
  /** Hold the last value after one run instead of repeating. */
  once?: boolean
  ease?: string
}

/** An animation of `attr` through `values` over `dur` ms, eased and repeating unless told otherwise. */
export function anim(attr: string, values: (string | number)[], dur: number, o: Anim = {}, type?: string): string {
  const times = o.times ?? values.map((_, i) => i / (values.length - 1))
  const keyTimes = `keyTimes="${times.map(n).join(';')}"`
  const calc = o.discrete
    ? 'calcMode="discrete"'
    : `calcMode="spline" keySplines="${Array(values.length - 1).fill(o.ease ?? EASE).join(';')}"`
  const repeat = o.once ? 'fill="freeze"' : 'repeatCount="indefinite"'
  const tag = type ? `animateTransform attributeName="transform" type="${type}"` : `animate attributeName="${attr}"`

  return `<${tag} values="${values.join(';')}" ${keyTimes} ${calc} dur="${ms(dur)}" begin="${ms(o.begin ?? 0)}" ${repeat}/>`
}

/** An animated transform: `type` is translate, rotate or scale. */
export const tf = (type: string, values: string[], dur: number, o: Anim = {}) => anim('transform', values, dur, o, type)

/** Values through a cycle as [time 0 to 1, value] pairs: an animation of `attr`, or of the transform with `type`. */
export function keyed(attr: string, pairs: [number, string | number][], dur: number, o: Anim = {}, type?: string): string {
  return anim(attr, pairs.map(([, v]) => v), dur, { ...o, times: pairs.map(([t]) => t) }, type)
}

/** A transform through a cycle as [time, value] pairs. */
export const tfk = (type: string, pairs: [number, string][], dur: number, o: Anim = {}) => keyed('transform', pairs, dur, o, type)

/** Content placed at (x, y). */
export const at = (x: number, y: number, s: string) => `<g transform="translate(${n(x)} ${n(y)})">${s}</g>`

/** Content moved by an animated transform, nested so it adds to any transform outside rather than replacing it. */
export const moved = (a: string, s: string) => `<g>${a}${s}</g>`

/** Content scaled (or turned) about the point (x, y) by an animated transform. */
export const about = (x: number, y: number, a: string, s: string) => at(x, y, moved(a, at(-x, -y, s)))

/**
 * Content shown for the [from, to] share of each `dur` ms cycle and hidden the rest, for things that come and go
 * with a loop (a set of eyes in one mood, Clawd cheering at the end of a round).
 */
export function during(content: string, from: number, to: number, dur: number): string {
  const values: string[] = []
  const times: number[] = []
  if (from > 0) {
    values.push('hidden')
    times.push(0)
  }
  values.push('visible')
  times.push(from)
  if (to < 0.99999) {
    values.push('hidden')
    times.push(to)
  }

  return `<g visibility="hidden">${anim('visibility', values, dur, { discrete: true, times })}${content}</g>`
}

// ---- the rig ----

export type Eyes = 'open' | 'half' | 'closed' | 'squint' | 'happy' | 'wide'

/**
 * Clawd in one drawing. Static: where he stands (x steps aside, y down), his colour, sitting or walking (ms a stride
 * takes; `tap`, ms a tap of the front right foot takes), eyes and where they look, how far each arm is lifted (degrees
 * up from level; below 0 hangs down), the right arm in front of his body, a hard hat. Moving, as SMIL strings from `tf`: `move` on the whole figure, `armL`/`armR`
 * turning an arm about its shoulder, `eyesMove` on the eyes. `blink` is a blink cycle in ms, `breathe` a squash toward
 * the feet [scale, ms], `moods` eyes that change through a cycle [eyes, ms, look].
 */
export type Rig = {
  x?: number
  y?: number
  color?: string
  sit?: boolean
  walk?: number
  tap?: number
  eyes?: Eyes
  look?: number
  lookY?: number
  liftL?: number
  liftR?: number
  armFront?: boolean
  hat?: boolean
  move?: string
  armL?: string
  armR?: string
  eyesMove?: string
  blink?: number
  breathe?: [number, number]
  moods?: [Eyes, number, number?][]
}

/** The shoulders the arms turn about. */
const SHOULDER_L = 7.3
const SHOULDER_R = 16.7
const SHOULDER_Y = 7.5

/** The right arm turned `deg` about its shoulder, for a value of an arm's animation or a thing held in its hand. */
export const R = (deg: number) => `${n(deg)} ${SHOULDER_R} ${SHOULDER_Y}`

/**
 * Turning the left or right arm `deg` further up (negative: down) and back over `dur` ms; with `hold`, that share of
 * the cycle is spent still at the end.
 */
export const swing = (side: 'L' | 'R', deg: number, dur: number, o: Anim & { hold?: number } = {}) => {
  const p = `${side === 'L' ? SHOULDER_L : SHOULDER_R} ${SHOULDER_Y}`
  const d = side === 'L' ? deg : -deg
  if (!o.hold) return tf('rotate', [`0 ${p}`, `${d} ${p}`, `0 ${p}`], dur, o)
  const turn = (1 - o.hold) / 2
  return tf('rotate', [`0 ${p}`, `${d} ${p}`, `0 ${p}`, `0 ${p}`], dur, { ...o, times: [0, turn, turn * 2, 1] })
}

function eyeShape(kind: Eyes, isLeft: boolean): string {
  const line = (d: string, w = 0.42) =>
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
  const open = `<rect x="-0.5" y="-1" width="1" height="2" rx="0.5" fill="${INK}"/>`
  switch (kind) {
    case 'open':
      return open
    case 'half':
      return `<rect x="-0.5" y="0" width="1" height="1" rx="0.45" fill="${INK}"/>`
    case 'closed':
      return line('M-0.75 0.45Q0 1.05 0.75 0.45')
    case 'happy':
      return line('M-0.85 0.55Q0 -0.75 0.85 0.55', 0.48)
    case 'wide':
      return `<circle r="1.05" fill="${INK}"/><circle cx="0.3" cy="-0.3" r="0.32" fill="#fff"/>`
    case 'squint':
      return isLeft ? open : line('M-0.8 0.3L0.8 -0.1', 0.48)
  }
}

function eyes(r: Rig): string {
  if (r.moods) {
    const total = r.moods.reduce((s, [, d]) => s + d, 0)
    let at = 0
    return r.moods
      .map(([kind, d, look]) => {
        const set = eyes({ ...r, moods: undefined, eyes: kind, look: look ?? 0 })
        const shown = during(set, at / total, (at + d) / total, total)
        at += d
        return shown
      })
      .join('')
  }
  const kind = r.eyes ?? 'open'
  const one = (cx: number, isLeft: boolean) => {
    const blink = r.blink && kind === 'open' ? tf('scale', ['1 1', '1 1', '1 0.12', '1 1'], r.blink, { times: [0, 0.94, 0.97, 1] }) : ''
    return `<g transform="translate(${n(cx)} 7)"><g>${blink}${eyeShape(kind, isLeft)}</g></g>`
  }
  const dx = r.look ?? 0

  return `<g transform="translate(0 ${r.lookY ?? 0})"><g>${r.eyesMove ?? ''}${one(9.5 + dx, true)}${one(14.5 + dx, false)}</g></g>`
}

/** Clawd drawn by the rig: body 10 x 5 at (7, 5), arms on its middle row, four legs below to row 12. */
export function clawd(r: Rig = {}): string {
  const c = r.color ?? O
  const limb = shade(c, 0.1)
  const back = shade(c, 0.2)
  let fig = ''

  if (!r.sit) {
    // Mid-stride, the outer pair and the inner pair lift in turn.
    fig += ([[8, false], [10, true], [13, true], [15, false]] as const)
      .map(([x, inner]) => {
        const lift = inner ? ['0 0', '0 -0.7', '0 0', '0 0', '0 0'] : ['0 0', '0 0', '0 0', '0 -0.7', '0 0']
        const step = r.walk ? tf('translate', lift, r.walk) : r.tap && x === 15 ? tf('translate', ['0 0', '0 -0.8', '0 0'], r.tap) : ''
        return `<g>${step}${pill(x, 9.3, 1.05, 2.7, inner ? back : limb)}</g>`
      })
      .join('')
  }

  const arm = (side: 'L' | 'R') => {
    const lift = (side === 'L' ? r.liftL : r.liftR) ?? 0
    const px = side === 'L' ? SHOULDER_L : SHOULDER_R
    const shape = pill(side === 'L' ? px - 2.5 : px - 0.1, 6.95, 2.6, 1.1, limb, 0.55)
    return `<g transform="rotate(${side === 'L' ? lift : -lift} ${px} ${SHOULDER_Y})"><g>${(side === 'L' ? r.armL : r.armR) ?? ''}${shape}</g></g>`
  }
  const body = pill(7, 5, 10, 5, c, 1.15) + `<path d="M8.15 5.55h7.7" stroke="#fff" stroke-opacity="0.22" stroke-width="0.4" stroke-linecap="round"/>`
  // A hard hat on top: its dome, a ridge down the middle, a brim wider than he is.
  const hat = r.hat
    ? `<path d="M8.6 4.6Q8.6 2.2 12 2.2Q15.4 2.2 15.4 4.6z" fill="${HAT}"/><path d="M12 2.25V4.55" stroke="${shade(HAT, 0.22)}" stroke-width="0.9"/>` +
      pill(6.3, 4.35, 11.4, 0.75, shade(HAT, 0.08), 0.37)
    : ''
  fig += arm('L') + (r.armFront ? '' : arm('R')) + body + eyes(r) + hat + (r.armFront ? arm('R') : '')

  if (r.breathe) {
    const [k, dur] = r.breathe
    const feet = r.sit ? 10 : 12
    fig = `<g transform="translate(0 ${feet})"><g>${tf('scale', ['1 1', `1 ${k}`, '1 1'], dur)}<g transform="translate(0 -${feet})">${fig}</g></g></g>`
  }

  return `<g transform="translate(${n(r.x ?? 0)} ${n(r.y ?? 0)})"><g>${r.move ?? ''}${fig}</g></g>`
}

// ---- props more than one picture uses, on the rig's frame ----

const QUESTION = 'M-1 -1.2Q-1 -2.6 0.1 -2.6Q1.3 -2.6 1.3 -1.5Q1.3 -0.8 0.4 -0.3Q0 -0.05 0 0.6'

/** A question mark bobbing and rocking, centred on (x, y). */
export function question(x: number, y: number): string {
  const mark = `<path d="${QUESTION}" fill="none" stroke="${O}" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round"/><circle cy="1.9" r="0.45" fill="${O}"/>`
  return `<g transform="translate(${x} ${y})"><g>${tf('translate', ['0 0', '0 -0.6', '0 0'], 1600)}<g>${tf('rotate', ['-8', '8', '-8'], 2400)}${mark}</g></g></g>`
}

/** Three Zs rising from (x, y), drifting right, growing and fading in turn. */
export function zzz(x: number, y: number, color = ZZZ): string {
  const z = `<path d="M-0.9 -0.9H0.9L-0.9 0.9H0.9" fill="none" stroke="${color}" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round"/>`
  return [0, 900, 1800]
    .map(begin => `<g transform="translate(${x} ${y})" opacity="0">${anim('opacity', [0, 0.95, 0.7, 0], 2700, { begin, times: [0, 0.2, 0.7, 1] })}<g>${tf('translate', ['0 0', '1 -1.3', '2.2 -2.5', '3.2 -3.6'], 2700, { begin })}<g>${tf('scale', ['0.5', '0.8', '1', '1.1'], 2700, { begin })}${z}</g></g></g>`)
    .join('')
}
