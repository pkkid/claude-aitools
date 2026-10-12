import { describe, expect, test } from 'claude-code/testing'

import {
  commandDot,
  expand,
  isServerUp,
  issueInBranch,
  issueInPrompt,
  issueLabel,
  parseGithubRemote,
  projectFrom,
  serverStatus,
  splitOutput,
} from '../src/project'
import { GREEN, RED, YELLOW } from '../src/palette'

describe('parseGithubRemote', () => {
  test('HTTPS, SSH and ssh:// forms, with or without .git', () => {
    const repo = { owner: 'pkkid', name: 'vowelit' }
    expect(parseGithubRemote('https://github.com/pkkid/vowelit.git')).toEqual(repo)
    expect(parseGithubRemote('https://github.com/pkkid/vowelit')).toEqual(repo)
    expect(parseGithubRemote('https://token@github.com/pkkid/vowelit.git')).toEqual(repo)
    expect(parseGithubRemote('git@github.com:pkkid/vowelit.git')).toEqual(repo)
    expect(parseGithubRemote('ssh://git@github.com/pkkid/vowelit.git')).toEqual(repo)
    expect(parseGithubRemote('https://github.com/pkkid/claude-aitools.git')).toEqual({ owner: 'pkkid', name: 'claude-aitools' })
  })

  test('anything not on github.com is none', () => {
    expect(parseGithubRemote('https://gitlab.com/pkkid/vowelit.git')).toBeNull()
    expect(parseGithubRemote('git@bitbucket.org:pkkid/vowelit.git')).toBeNull()
    expect(parseGithubRemote('/srv/git/vowelit.git')).toBeNull()
  })
})

describe('issueInPrompt', () => {
  test('a #number or an issue URL; the first counts', () => {
    expect(issueInPrompt('Fix #42 then #43')).toBe(42)
    expect(issueInPrompt('See https://github.com/pkkid/vowelit/issues/7 please')).toBe(7)
    expect(issueInPrompt('#9 is next')).toBe(9)
  })

  test('none in the context joined into it, an HTML entity, or no number at all', () => {
    expect(issueInPrompt('<system-reminder>PR #12 is open</system-reminder>Fix the login')).toBeNull()
    expect(issueInPrompt('Use &#123; for a brace')).toBeNull()
    expect(issueInPrompt('Fix the login')).toBeNull()
  })
})

describe('issueInBranch', () => {
  test('a number opening the name or a segment, alone or before a dash', () => {
    expect(issueInBranch('feat/123-login')).toBe(123)
    expect(issueInBranch('123-fix-crash')).toBe(123)
    expect(issueInBranch('issue-45')).toBe(45)
    expect(issueInBranch('fix/gh-46-typo')).toBe(46)
    expect(issueInBranch('feat/47')).toBe(47)
  })

  test('a date, a version or a number inside a word is none', () => {
    expect(issueInBranch('2026-10-10-notes')).toBeNull()
    expect(issueInBranch('release/v2')).toBeNull()
    expect(issueInBranch('feat/login2')).toBeNull()
    expect(issueInBranch('main')).toBeNull()
    expect(issueInBranch('')).toBeNull()
  })
})

describe('expand', () => {
  test('names in braces are replaced; unknown ones are left as written', () => {
    const vars = { checkout: '/w', main: '/m', branch: 'feat/x', repo: 'o/r', owner: 'o', name: 'r', issue: '12', port: '8000' }
    expect(expand('{main}/tools/run.sh {checkout} :{port} #{issue} {nope}', vars)).toBe('/m/tools/run.sh /w :8000 #12 {nope}')
  })
})

describe('projectFrom', () => {
  test('no project section is an empty row, on', () => {
    expect(projectFrom({})).toEqual({ isEnabled: true, tools: [], problems: [] })
  })

  test('name, board and each kind of tool; a string command runs through sh', () => {
    const config = projectFrom({
      project: {
        name: 'Vowelit',
        board: 'https://github.com/users/pkkid/projects/1/views/2',
        tools: [
          { type: 'link', label: 'Docs', url: 'https://example.com/{branch}' },
          { type: 'command', label: 'Test', run: 'npm test' },
          { type: 'server', label: 'Server', start: ['{main}/serve.sh', '{checkout}'], stop: ['{main}/stop.sh'], port: 8000, ready: 'ready: (\\S+)' },
        ],
      },
    })
    expect(config.problems).toEqual([])
    expect(config.name).toBe('Vowelit')
    expect(config.board).toBe('https://github.com/users/pkkid/projects/1/views/2')
    expect(config.tools).toEqual([
      { type: 'link', id: 'docs', label: 'Docs', url: 'https://example.com/{branch}' },
      { type: 'command', id: 'test', label: 'Test', run: ['sh', '-c', 'npm test'] },
      { type: 'server', id: 'server', label: 'Server', start: ['{main}/serve.sh', '{checkout}'], stop: ['{main}/stop.sh'], port: 8000, ready: 'ready: (\\S+)' },
    ])
  })

  test('a tool it cannot use is left out with a line saying why; the rest stay', () => {
    const config = projectFrom({
      project: {
        enabled: false,
        board: 3,
        tools: [{ type: 'link', label: 'No URL' }, { label: 'No type' }, { type: 'server', label: 'Bad', start: 'x', port: 'eighty', ready: '(' }, 'nope', { type: 'link', label: 'Docs', url: 'https://d' }, { type: 'link', label: 'Docs', url: 'https://e' }],
      },
    })
    expect(config.isEnabled).toBe(false)
    expect(config.board).toBeUndefined()
    expect(config.tools.map(t => t.id)).toEqual(['bad', 'docs', 'docs-5'])
    expect(config.problems).toEqual([
      'project.tools[0] ("No URL") needs a "url"',
      'project.tools[1] ("No type"): "type" must be "link", "command" or "server"',
      'project.tools[2] ("Bad"): "port" must be a port number',
      'project.tools[2] ("Bad"): "ready" is not a valid regular expression',
      'project.tools[3] needs a "label"',
      'project.board must be a URL, or false to hide it',
    ])
    expect(projectFrom({ project: { board: false } }).board).toBe(false)
    expect(projectFrom({ project: { tools: {} } }).problems).toEqual(['project.tools must be a list'])
  })
})

describe('tool status', () => {
  test("a server's words and dot by its phase, or by what listens on its port", () => {
    expect(serverStatus(undefined, null)).toEqual({ dot: '○', text: 'Stopped' })
    expect(serverStatus({ phase: 'starting', branch: 'feat/x', detail: '' }, null)).toEqual({ dot: '○', text: 'Starting feat/x…', color: YELLOW })
    expect(serverStatus({ phase: 'ready', branch: 'feat/x', detail: 'http://x' }, null)).toEqual({ dot: '●', text: 'Running feat/x', color: GREEN })
    expect(serverStatus(undefined, { checkout: '/w', label: 'main', pid: 1 })).toEqual({ dot: '●', text: 'Running main', color: GREEN })
    expect(serverStatus({ phase: 'exited', branch: '', detail: 'code 1' }, null)).toEqual({ dot: '○', text: 'Exited (code 1)', color: RED })
    expect(serverStatus({ phase: 'exited', branch: '', detail: 'code 0' }, null)).toEqual({ dot: '○', text: 'Exited (code 0)' })
    expect(serverStatus({ phase: 'exited', branch: '', detail: 'SIGTERM' }, null)).toEqual({ dot: '○', text: 'Exited (SIGTERM)' })
    expect(serverStatus({ phase: 'exited', branch: '', detail: 'SIGKILL' }, null).color).toBe(RED)
    expect(isServerUp(undefined, { checkout: '', label: 'x', pid: null })).toBe(true)
    expect(isServerUp({ phase: 'exited', branch: '', detail: '' }, null)).toBe(false)
  })

  test("a command's dot: none before it ran, yellow running, then green or red", () => {
    expect(commandDot(undefined)).toBeNull()
    expect(commandDot({ phase: 'running', branch: '', detail: '' })?.color).toBe(YELLOW)
    expect(commandDot({ phase: 'passed', branch: '', detail: '' })?.color).toBe(GREEN)
    expect(commandDot({ phase: 'failed', branch: '', detail: '' })?.color).toBe(RED)
  })

  test("the issue's label: its number, then its title cut to fit", () => {
    expect(issueLabel({ number: 12, title: null })).toBe('#12')
    expect(issueLabel({ number: 12, title: 'Login fails' })).toBe('#12 Login fails')
    expect(issueLabel({ number: 12, title: 'x'.repeat(40) })).toBe(`#12 ${'x'.repeat(31)}…`)
  })
})

describe('splitOutput', () => {
  test('whole lines out, the rest kept for the next chunk; colors and redraws taken off', () => {
    expect(splitOutput('', 'one\ntw')).toEqual({ lines: ['one'], rest: 'tw' })
    expect(splitOutput('tw', 'o\n')).toEqual({ lines: ['two'], rest: '' })
    expect(splitOutput('', '\x1b[32mok\x1b[0m\n10%\r50%\r100%\n')).toEqual({ lines: ['ok', '100%'], rest: '' })
  })
})
