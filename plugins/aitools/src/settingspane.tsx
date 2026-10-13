/**
 * The AI Tool Settings pane, which the bar's ⁝ opens: Clawd in a hard hat at the top left, the files the settings are
 * saved in beside him, then two sections. Global Settings holds the bar's display options, saved for every project: the
 * bar's own look a row each, then a row per meter with its options. Project Settings, in a GitHub repository, holds the
 * project file's settings: whether the row shows there, its name and its board, typed into fields and written there.
 */

import type { Elements, RenderChildren } from 'claude-code'

import { parseBoardUrl } from './board'
import { objectAt } from './config'
import type { Json } from './config'
import { FOREMAN_ALT, FOREMAN_HEIGHT, FOREMAN_WIDTH, foremanSvg } from './foreman'
import { BG, DOING_TEXT, FAINT_TEXT, RED, YELLOW } from './palette'
import { TOGGLES } from './settings'
import type { ToggleGroup } from './settings'
import type { GithubRepo, ProjectConfig, Settings, ToggleKey } from '../types'

export const SETTINGS_PANE = 'aitools-settings'
export const SETTINGS_TITLE = 'AI Tool Settings'

/** Global Settings' groups in order, with their headings: the bar's own options first, under none. */
const AI_GROUPS: readonly { group: ToggleGroup; heading?: string }[] = [
  { group: 'look' },
  { group: 'meters', heading: 'Meters' },
]

/** The most options a meter's row has with its example beside them; with more the example goes on the next line. */
const SAME_LINE_OPTIONS = 2

/** What each meter looks like in the bar, beside its row. */
const METER_EXAMPLES: Record<string, string> = {
  '5-hour': '5h 42%, 1h12m',
  Weekly: 'wk 18%, Thu',
  'Burn rate': 'limit ~3:40pm',
  Context: 'ctx 31% 62k/200k',
  Tokens: 'tok 1.3M (+48k)',
  Cache: 'cache 42m, $0.50',
  'Thread cost': 'thread $3.12 (+$0.41) ~2.1% wk',
  Month: 'month $184.20',
}

/** Blank lines above each section. */
const SECTION_GAP = 2

/** The band behind each section's heading: a step up from the pane's own dark background. */
const HEADING_BACKGROUND = BG.bg1

/**
 * Cells the label column takes, so every row's description starts at one edge: room for `● Burn-rate warning` in
 * the desktop's proportional font, which runs narrower than the cells are counted in.
 */
export const LABEL_CELLS = 20

/** A change to the project file's own settings; null takes a key out, so its default applies. */
export type ProjectChange = { name?: string | null; board?: string | false | null; enabled?: boolean }

/** The file with `change` made to its project section: a null name or board removed, `enabled` kept only when off. */
export function withProject(raw: Json, change: ProjectChange): Json {
  const project: Json = { ...objectAt(raw, 'project') }
  const set = (key: string, value: unknown) => {
    if (value === null) delete project[key]
    else project[key] = value
  }
  if (change.name !== undefined) set('name', change.name)
  if (change.board !== undefined) set('board', change.board)
  if (change.enabled !== undefined) set('enabled', change.enabled ? null : false)

  return { ...raw, project }
}

/** A path as the person would write it: under their home folder, `~/…`. */
export function homeRelative(path: string, home: string | undefined): string {
  return home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path
}

/** Why a board URL can't be used, or null when it can: a GitHub Project's address, a view of it included. */
export function boardProblem(url: string): string | null {
  return parseBoardUrl(url) === null
    ? "That isn't a GitHub Project's URL: it looks like https://github.com/users/<you>/projects/1 (or /orgs/<org>/…)."
    : null
}

export type SettingsView = {
  settings: Settings
  /** Where the person's own settings are saved, as they would write it: `~/.claude/aitools.json`. */
  globalFile: string
  /** The session's GitHub repository; null outside one. */
  repo: GithubRepo | null
  /** The project file as read; null when the repository has none yet. */
  project: ProjectConfig | null
  /** The project file the pane writes, as they would write it: the one read, else the checkout's. */
  projectFile: string | null
  /** What the last change to the project file came to: a refused URL, a file that couldn't be written. */
  note: { text: string; isError: boolean } | null
}

export type SettingsActions = {
  toggle(key: ToggleKey): void
  setProject(change: ProjectChange): void
}

/**
 * `Svg` only where the surface draws it (the desktop): Clawd and the Mascot option show there alone. `Input` where the
 * surface draws fields (not mobile); without one a field shows its value.
 */
type El = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & { Input?: Elements['terminal']['Input']; Svg?: Elements['desktop']['Svg'] }

/**
 * An option's button, dim at rest as the bar's own buttons are (a Button's label takes no color, only full strength or
 * dim), at full strength under the pointer; the dot says whether it is on.
 */
function optionButton(el: El, key: string, label: string, isOn: boolean, onPress: () => void) {
  const { Button } = el

  return <Button key={key} label={`${isOn ? '●' : '○'} ${label}`} plain dimColor onPress={onPress} />
}

/**
 * One row: the label column (a button or a word), then a faint line on what it does, wrapping in its own column. Every
 * row's label keeps to its top line, beside the first line of what wraps to its right.
 */
function row(el: El, key: string, label: RenderChildren, hint: string) {
  const { Box, Text } = el

  return (
    <Box key={`row-${key}`} flexDirection="row" alignItems="flex-start">
      <Box width={LABEL_CELLS} flexShrink={0}>
        {label}
      </Box>
      <Box flexShrink={1} minWidth={0}>
        <Text color={FAINT_TEXT}>{hint}</Text>
      </Box>
    </Box>
  )
}

/** A field row: its name in the label column, then the field with a faint line under it. */
function field(el: El, key: string, name: string, input: RenderChildren, hint: string) {
  const { Box, Text } = el

  return (
    <Box key={`row-${key}`} flexDirection="row" alignItems="flex-start">
      <Box width={LABEL_CELLS} flexShrink={0}>
        <Text color={FAINT_TEXT}>{`  ${name}`}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        {input}
        <Text color={FAINT_TEXT}>{hint}</Text>
      </Box>
    </Box>
  )
}

/**
 * A section: its heading on a band of Gruvbox grey across the pane, where its settings are saved beside it (not bold),
 * then its rows a blank line below.
 */
function section(el: El, key: string, heading: string, saved: string, rows: RenderChildren[]) {
  const { Box, Text } = el

  return (
    <Box key={`section-${key}`} flexDirection="column" gap={1}>
      <Box key={`heading-${key}`} flexDirection="row" columnGap={2} backgroundColor={HEADING_BACKGROUND} paddingX={1}>
        <Text bold color={DOING_TEXT}>
          {heading}
        </Text>
        <Box flexShrink={1} minWidth={0}>
          <Text color={FAINT_TEXT}>{saved}</Text>
        </Box>
      </Box>
      {rows}
    </Box>
  )
}

/**
 * The pane: Clawd and the header beside him (what the pane is, and the two files), then Global Settings (a heading per
 * group, an option or a meter a row) and Project Settings (the project file's).
 */
export function renderSettings(el: El, view: SettingsView, on: SettingsActions) {
  const { Box, Text, Input, Svg } = el
  const toggle = (t: (typeof TOGGLES)[number]) =>
    row(el, t.key, optionButton(el, t.key, t.label, view.settings[t.key], () => on.toggle(t.key)), t.hint)

  // A meter's row: its name in the label column, its options beside it, then a faint example of it in the bar (on a
  // line of its own under options too many to share one with it). It shows while any of its options is on.
  const meter = (name: string) => {
    const options = TOGGLES.filter(o => o.meter === name)
    const example = <Text color={FAINT_TEXT}>{METER_EXAMPLES[name] ?? ''}</Text>
    const isLong = options.length > SAME_LINE_OPTIONS

    return (
      <Box key={`meter-${name}`} flexDirection="row" alignItems="flex-start">
        <Box width={LABEL_CELLS} flexShrink={0}>
          <Text color={FAINT_TEXT}>{`  ${name}`}</Text>
        </Box>
        <Box flexDirection={isLong ? 'column' : 'row'} flexShrink={1} minWidth={0}>
          <Box flexDirection="row" columnGap={2} flexShrink={0}>
            {options.map(o => optionButton(el, o.key, o.label, view.settings[o.key], () => on.toggle(o.key)))}
          </Box>
          <Box flexShrink={1} minWidth={0} marginLeft={isLong ? 0 : 2}>
            {example}
          </Box>
        </Box>
      </Box>
    )
  }

  // Each option a row, but a meter's options together on the meter's row, where its first option stood.
  const groups = AI_GROUPS.map(({ group, heading }) => {
    const options = TOGGLES.filter(t => t.group === group && (Svg !== undefined || !t.needsSvg))

    return (
      <Box key={`group-${group}`} flexDirection="column">
        {heading && <Text color={DOING_TEXT}>{heading}</Text>}
        {options.map((t, i) => (t.meter === undefined ? toggle(t) : options.findIndex(o => o.meter === t.meter) === i ? meter(t.meter) : null))}
      </Box>
    )
  })

  // Saved in the project's file: whether the row shows here (the global Show project row must be on too), then its
  // name and board.
  const project: RenderChildren[] = []
  const { repo, note } = view
  if (repo === null) {
    project.push(<Text key="no-repo" color={FAINT_TEXT}>Its settings show in a GitHub repository.</Text>)
  } else {
    const config = view.project
    const isEnabled = config?.isEnabled ?? true
    const board = config?.board
    project.push(
      row(
        el,
        'project-enabled',
        optionButton(el, 'project-enabled', 'Show project row', isEnabled, () => on.setProject({ enabled: !isEnabled })),
        view.settings.projectRow ? `The row in ${repo.name}` : `The row in ${repo.name}; Show project row is off in every project`,
      ),
      field(
        el,
        'project-name',
        'Name',
        Input ? (
          <Input
            key="project-name"
            value={config?.name ?? ''}
            placeholder={repo.name}
            submitLabel="save"
            onSubmit={value => on.setProject({ name: value.trim() || null })}
          />
        ) : (
          <Text color={DOING_TEXT}>{config?.name ?? repo.name}</Text>
        ),
        "In place of the repo's name",
      ),
      row(
        el,
        'project-board-link',
        optionButton(el, 'project-board-link', 'Board', board !== false, () => on.setProject({ board: board === false ? null : false })),
        'Its open items on the row, and the Project pane',
      ),
    )
    if (board !== false) {
      project.push(
        field(
          el,
          'project-board',
          'Board URL',
          Input ? (
            <Input
              key="project-board"
              value={board ?? ''}
              placeholder="https://github.com/users/you/projects/1"
              submitLabel="save"
              onSubmit={value => on.setProject({ board: value.trim() || null })}
            />
          ) : (
            <Text color={DOING_TEXT}>{board ?? 'Looked up'}</Text>
          ),
          'A view of it works too. Enter saves; empty looks it up.',
        ),
      )
    }
    const tools = config?.tools ?? []
    project.push(
      row(
        el,
        'project-tools',
        <Text color={FAINT_TEXT}>{'  Tools'}</Text>,
        `${tools.length === 0 ? 'None yet' : tools.map(t => t.label).join(' · ')}. Edit project.tools in the file.`,
      ),
    )
    for (const [i, problem] of (config?.problems ?? []).entries()) {
      project.push(<Text key={`problem-${i}`} color={YELLOW}>{problem}</Text>)
    }
  }
  if (note) {
    project.push(<Text key="note" color={note.isError ? RED : FAINT_TEXT}>{note.text}</Text>)
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {Svg && (
          <Box key="foreman" flexShrink={0} marginRight={2}>
            <Svg source={foremanSvg()} alt={FOREMAN_ALT} width={FOREMAN_WIDTH} height={FOREMAN_HEIGHT} />
          </Box>
        )}
        <Box flexDirection="column" flexShrink={1}>
          <Text color={DOING_TEXT}>What the AI Tools ribbons show. Changes save right away.</Text>
          <Text color={FAINT_TEXT}>{`Yours, in every project: ${view.globalFile}`}</Text>
          <Text color={FAINT_TEXT}>{view.projectFile === null ? 'Not in a GitHub repository' : `This project's: ${view.projectFile}`}</Text>
        </Box>
      </Box>
      {/* Two blank lines above each section's heading, so the sections stand apart from the header and each other. */}
      <Box flexDirection="column" marginTop={SECTION_GAP} gap={SECTION_GAP}>
        {section(el, 'ai', 'Global Settings', 'May be overridden by project settings', groups)}
        {section(el, 'project', 'Project Settings', repo === null ? 'Saved for each project' : `Saved for ${repo.name} only`, project)}
      </Box>
    </Box>
  )
}
