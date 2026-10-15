import { describe, expect, test } from 'claude-code/testing'

import { modelDisplayName, projectSlug, statusline } from '../src/statusline'
import type { StatuslineFacts } from '../src/statusline'

const FACTS: StatuslineFacts = {
  sessionId: 'abc',
  transcriptPath: '/home/me/.claude/projects/-home-me/abc.jsonl',
  cwd: '/home/me/src',
  projectDir: '/home/me',
  model: 'claude-opus-5-5[1m]',
  version: '2.1.299',
  durationMs: 6760,
  costUsd: 0.15,
  context: { tokens: 43714, window: 1_000_000, percent: 4 },
  fiveHour: { percentUsed: 12, resetsAt: '2026-10-15T19:10:00.000Z' },
  weekly: { percentUsed: 82.5, resetsAt: '2026-10-17T08:00:00.000Z' },
}

describe('statusline', () => {
  test("the CLI status line's shape, its keys in its order, resets in epoch seconds", () => {
    const json = statusline(FACTS)
    expect(Object.keys(json)).toEqual([
      'session_id', 'transcript_path', 'cwd', 'model', 'workspace', 'version', 'cost', 'context_window', 'exceeds_200k_tokens', 'rate_limits',
    ])
    expect(json).toEqual({
      session_id: 'abc',
      transcript_path: '/home/me/.claude/projects/-home-me/abc.jsonl',
      cwd: '/home/me/src',
      model: { id: 'claude-opus-5-5[1m]', display_name: 'Opus 5.5 (1M context)' },
      workspace: { current_dir: '/home/me/src', project_dir: '/home/me' },
      version: '2.1.299',
      cost: { total_cost_usd: 0.15, total_duration_ms: 6760 },
      context_window: { total_input_tokens: 43714, context_window_size: 1_000_000, used_percentage: 4, remaining_percentage: 96 },
      exceeds_200k_tokens: false,
      rate_limits: {
        five_hour: { used_percentage: 12, resets_at: Date.parse('2026-10-15T19:10:00.000Z') / 1000 },
        seven_day: { used_percentage: 82.5, resets_at: Date.parse('2026-10-17T08:00:00.000Z') / 1000 },
      },
    })
  })

  test('figures the mod has none of are left out, never made up', () => {
    const json = statusline({ ...FACTS, transcriptPath: undefined, version: undefined, costUsd: undefined, context: undefined, fiveHour: undefined, weekly: undefined })
    expect(json).not.toHaveProperty('transcript_path')
    expect(json).not.toHaveProperty('version')
    expect(json).not.toHaveProperty('context_window')
    expect(json).not.toHaveProperty('rate_limits')
    expect(json.cost).toEqual({ total_duration_ms: 6760 })
  })

  test('one limit window alone, a reset it has none of left out', () => {
    expect(statusline({ ...FACTS, fiveHour: { percentUsed: 3 }, weekly: undefined }).rate_limits).toEqual({ five_hour: { used_percentage: 3 } })
  })

  test('a context before its first reading has no percentages', () => {
    expect(statusline({ ...FACTS, context: { window: 200_000 } }).context_window).toEqual({
      total_input_tokens: 0, context_window_size: 200_000, used_percentage: null, remaining_percentage: null,
    })
  })

  test('past 200k input tokens', () => {
    expect(statusline({ ...FACTS, context: { tokens: 200_001, window: 1_000_000, percent: 20 } }).exceeds_200k_tokens).toBe(true)
  })
})

describe('modelDisplayName', () => {
  test("the CLI's names", () => {
    expect(modelDisplayName('claude-opus-5-5[1m]')).toBe('Opus 5.5 (1M context)')
    expect(modelDisplayName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
    expect(modelDisplayName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelDisplayName('claude-opus-4-20250514')).toBe('Opus 4')
  })

  test('one it cannot read, as given', () => {
    expect(modelDisplayName('opus')).toBe('opus')
  })
})

describe('projectSlug', () => {
  test('everything but letters and digits as a hyphen', () => {
    expect(projectSlug('/home/me/Projects/claude-aitools')).toBe('-home-me-Projects-claude-aitools')
    expect(projectSlug('/home/me/a.b_c')).toBe('-home-me-a-b-c')
  })
})
