import { describe, expect, test } from 'claude-code/testing'

import { IDLE_MOMENTS, MASCOT_START, ONE_SHOT_MS, TOOL_POSES, endsWithQuestion, introMs, isQuestionOpenIn, isShipCommand, commandPose, mascotAlt, mascotDrawing, mascotSvg } from '../src/mascot'
import type { MascotPose } from '../types'

const POSES: MascotPose[] = ['idle', 'working', 'reading', 'puzzled', 'sleeping', 'celebrate', 'error', 'wave']
const MOMENTS: MascotPose[] = [
  'editing',
  'command',
  'searching',
  'web',
  'shipping',
  'thinking',
  'listening',
  'stopped',
  'subagent',
  'compacting',
  'waiting',
  'coffee',
  'brow',
  'stretch',
  'yawn',
  'hop',
  'glance',
  'butterfly',
]
const REACTIONS: MascotPose[] = ['blush', 'mad', 'callMe', 'roll', 'bow', 'laugh', 'highFive', 'sheepish', 'dance', 'pat', 'hammock']

describe('mascot drawings', () => {
  test('every pose, and every transition between two, is one SVG well under the 131072-character limit', () => {
    for (const to of [...POSES, ...MOMENTS, ...REACTIONS]) {
      for (const from of [null, ...POSES, ...MOMENTS, ...REACTIONS]) {
        const source = mascotSvg(to, from, 7)
        expect(source).toMatch(/^<svg [^>]*viewBox="3 2 24 10"[^>]*>[\s\S]*<!--7--><\/svg>$/)
        expect(source.length).toBeLessThan(131072)
      }
    }
  })

  test('a transition plays an intro first; the same pose or none plays none', () => {
    expect(introMs('working', 'idle')).toBeGreaterThan(0)
    expect(introMs('sleeping', 'idle')).toBeGreaterThan(introMs('puzzled', 'idle'))
    expect(introMs('idle', null)).toBe(0)
    expect(introMs('idle', 'idle')).toBe(0)
    expect(mascotSvg('working', 'idle', 1).length).toBeGreaterThan(mascotSvg('working', null, 1).length)
  })

  test('each pose says what Clawd is doing', () => {
    expect(POSES.map(mascotAlt)).toEqual([
      'Clawd standing',
      'Clawd typing on a laptop',
      'Clawd reading a sheet of paper',
      'Clawd looking puzzled',
      'Clawd asleep',
      'Clawd celebrating',
      'Clawd startled',
      'Clawd waving',
    ])
    expect(mascotDrawing(MASCOT_START).alt).toBe('Clawd standing')
    expect(MOMENTS.map(mascotAlt)).toEqual([
      'Clawd writing on a page',
      'Clawd running a command',
      'Clawd searching with a magnifying glass',
      'Clawd pointing at a spinning globe',
      'Clawd launching a rocket',
      'Clawd thinking',
      'Clawd catching your prompt',
      'Clawd stopping short',
      'Clawd sending off a mini Clawd',
      'Clawd packing pages into a box',
      'Clawd waiting on you',
      'Clawd sipping a coffee',
      'Clawd wiping his brow',
      'Clawd stretching',
      'Clawd yawning',
      'Clawd hopping',
      'Clawd glancing at the prompt',
      'Clawd watching a butterfly',
    ])
    expect(REACTIONS.map(mascotAlt)).toEqual([
      'Clawd blushing',
      'Clawd getting mad',
      'Clawd saying call me',
      'Clawd doing a barrel roll',
      'Clawd taking a bow',
      'Clawd laughing',
      'Clawd giving a high five',
      'Clawd looking sheepish',
      'Clawd dancing',
      'Clawd getting a head pat',
      'Clawd napping in a hammock',
    ])
  })

  test('thinking gives way with an aha: a lightbulb pops in before the next pose', () => {
    expect(introMs('working', 'thinking')).toBeGreaterThan(introMs('working', 'idle'))
    expect(mascotSvg('working', 'thinking', 1)).toContain('#F2C14E')
  })

  test('the moments play once and give way; the idle ones and the long-turn ones all do', () => {
    for (const pose of ['shipping', 'listening', 'stopped', 'subagent', 'coffee', 'brow', 'yawn', ...IDLE_MOMENTS] as MascotPose[]) {
      expect(ONE_SHOT_MS[pose]).toBeGreaterThan(0)
    }
    for (const pose of ['thinking', 'waiting', 'compacting', ...new Set(Object.values(TOOL_POSES))] as MascotPose[]) {
      expect(ONE_SHOT_MS[pose]).toBeUndefined()
    }
  })
})

describe('commandPose', () => {
  test('searching, reading or at the terminal, by the program run first', () => {
    expect(commandPose('grep -rn mascot src')).toBe('searching')
    expect(commandPose('cd /p && rg -n "Clawd" | head')).toBe('searching')
    expect(commandPose('/usr/bin/find . -name "*.ts"')).toBe('searching')
    expect(commandPose('git grep mascot')).toBe('searching')
    expect(commandPose('cat a.txt')).toBe('reading')
    expect(commandPose('npm test | grep fail')).toBe('command')
    expect(commandPose('git status')).toBe('command')
  })
})

describe('isShipCommand', () => {
  test('a git commit or push, alone or chained, with options before it', () => {
    expect(isShipCommand('git commit -m "Fix"')).toBe(true)
    expect(isShipCommand('git add -A && git commit -m "Fix"')).toBe(true)
    expect(isShipCommand('git -C /repo push origin main')).toBe(true)
    expect(isShipCommand('cd x; git push')).toBe(true)
  })

  test('other git commands, or the words elsewhere', () => {
    expect(isShipCommand('git status')).toBe(false)
    expect(isShipCommand('git log --grep=commit')).toBe(false)
    expect(isShipCommand('echo push')).toBe(false)
    expect(isShipCommand('legit commit')).toBe(false)
  })
})

describe('endsWithQuestion', () => {
  test('a question mark at the end, past closing marks and space', () => {
    expect(endsWithQuestion('Done. What would you like to change?')).toBe(true)
    expect(endsWithQuestion('Want me to **commit it?**\n')).toBe(true)
  })

  test('not a question in the middle, or none at all', () => {
    expect(endsWithQuestion('Is it fast? Yes, it is.')).toBe(false)
    expect(endsWithQuestion('')).toBe(false)
  })
})

describe('isQuestionOpenIn', () => {
  const user = (text: string) => ({ role: 'user' as const, text })
  const assistant = (text: string) => ({ role: 'assistant' as const, text })

  test('the last reply asks and the person has not answered', () => {
    expect(isQuestionOpenIn([user('Help'), assistant('Which file?')])).toBe(true)
    expect(isQuestionOpenIn([user('Help'), assistant('Which file?'), { role: 'user', text: '', toolResults: [] }])).toBe(true)
  })

  test('answered, a statement, or nothing yet', () => {
    expect(isQuestionOpenIn([assistant('Which file?'), user('bar.tsx')])).toBe(false)
    expect(isQuestionOpenIn([user('Help'), assistant('Done.')])).toBe(false)
    expect(isQuestionOpenIn([])).toBe(false)
  })
})
