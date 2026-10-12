/**
 * The Gruvbox palette (github.com/morhetz/gruvbox), the mods' source for text colors. Pick from here rather than a
 * named terminal color or a hex of your own: the panes and bars draw on a dark background, so text takes the dark
 * mode's foreground tones and BRIGHT accents. NEUTRAL and FADED are kept for the odd mark that needs less glare.
 *
 * Pictures (Clawd and his props) keep their own colors; this is for text.
 */

/** Dark mode's backgrounds, darkest first. */
export const BG = {
  bg0_h: '#1d2021',
  bg0: '#282828',
  bg0_s: '#32302f',
  bg1: '#3c3836',
  bg2: '#504945',
  bg3: '#665c54',
  bg4: '#7c6f64',
} as const

/** Dark mode's foregrounds, dimmest first; `gray` sits between the backgrounds and these. */
export const FG = {
  gray: '#928374',
  fg4: '#a89984',
  fg3: '#bdae93',
  fg2: '#d5c4a1',
  fg1: '#ebdbb2',
  fg0: '#fbf1c7',
} as const

/** Dark mode's accents: the ones to use for text. */
export const BRIGHT = {
  red: '#fb4934',
  green: '#b8bb26',
  yellow: '#fabd2f',
  blue: '#83a598',
  purple: '#d3869b',
  aqua: '#8ec07c',
  orange: '#fe8019',
} as const

/** The accents' middle shades, shared by both modes. */
export const NEUTRAL = {
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  purple: '#b16286',
  aqua: '#689d6a',
  orange: '#d65d0e',
} as const

/** Light mode's accents, darkest: for text on a light background. */
export const FADED = {
  red: '#9d0006',
  green: '#79740e',
  yellow: '#b57614',
  blue: '#076678',
  purple: '#8f3f71',
  aqua: '#427b58',
  orange: '#af3a03',
} as const

// ---- the roles the mods use, named once ----

export const RED = BRIGHT.red
export const GREEN = BRIGHT.green
export const YELLOW = BRIGHT.yellow
export const BLUE = BRIGHT.blue
/** Text that stands out without glaring: the step in progress, a pane's title. */
export const DOING_TEXT = FG.fg3
/**
 * Faint text, as faint as the bar's dim labels: the desktop draws `dimColor` in a pane nearly as light as DOING_TEXT,
 * so pane text that must read faint uses this instead.
 */
export const FAINT_TEXT = FG.gray
