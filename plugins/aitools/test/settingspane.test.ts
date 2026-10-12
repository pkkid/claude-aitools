import { describe, expect, test } from 'claude-code/testing'

import { FOREMAN_HEIGHT, foremanSvg } from '../src/foreman'
import { PANE_PICTURE_HEIGHT } from '../src/mascot'
import { boardProblem, homeRelative, withProject } from '../src/settingspane'

describe('settings pane', () => {
  test("a project change touches only the project's own keys, a null one taken out", () => {
    const raw = { mine: 1, project: { name: 'Old', board: 'https://github.com/users/a/projects/1', tools: [{ type: 'link' }] } }
    expect(withProject(raw, { name: 'New' })).toEqual({ ...raw, project: { ...raw.project, name: 'New' } })
    expect(withProject(raw, { name: null, board: null }).project).toEqual({ tools: [{ type: 'link' }] })
    expect(withProject(raw, { board: false }).project).toMatchObject({ board: false })
    expect(withProject({}, { enabled: false })).toEqual({ project: { enabled: false } })
    // On is the default: the key goes rather than saying so.
    expect(withProject({ project: { enabled: false } }, { enabled: true })).toEqual({ project: {} })
  })

  test("a board URL must be a GitHub Project's, a view of it included", () => {
    expect(boardProblem('https://github.com/users/pkkid/projects/1')).toBeNull()
    expect(boardProblem('https://github.com/orgs/acme/projects/12/views/3')).toBeNull()
    expect(boardProblem('https://github.com/pkkid/vowelit')).toMatch(/isn't a GitHub Project's URL/)
  })

  test('paths under home read from ~', () => {
    expect(homeRelative('/home/me/.claude/aitools.json', '/home/me')).toBe('~/.claude/aitools.json')
    expect(homeRelative('/home/meow/x', '/home/me')).toBe('/home/meow/x')
    expect(homeRelative('/r/.claude/aitools.json', undefined)).toBe('/r/.claude/aitools.json')
  })

  test('Clawd in his hard hat is three rows tall, the cog turning', () => {
    expect(FOREMAN_HEIGHT).toBe(PANE_PICTURE_HEIGHT)
    expect(foremanSvg()).toContain('type="rotate"')
    expect(foremanSvg()).toBe(foremanSvg())
  })
})
