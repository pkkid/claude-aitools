import { describe, expect, test } from 'claude-code/testing'

import { ONE_SHOT_MS } from '../src/mascot'
import { REACTION, RULES, isYelling, reactionTo, said, stretches } from '../src/reactions'

/** The reaction each prompt gets, by name; null for none. */
const HEARD: [string, string | null][] = [
  ['good job!', 'compliment'],
  ['Great work on this', 'compliment'],
  ["you're the best", 'compliment'],
  ['Perfect, now add tests', 'compliment'],
  ['this is fucking awesome', 'compliment'],
  ['nice', 'compliment'],
  ['wow, amazing', 'compliment'],
  ['you rock', 'compliment'],
  ['love you', 'love'],
  ['I love you clawd', 'love'],
  ['<3', 'love'],
  ["you're adorable", 'love'],
  ['bad bot', 'scold'],
  ["you're so stupid", 'scold'],
  ['stop it', 'scold'],
  ['wtf', 'swear'],
  ['this damn bug again', 'swear'],
  ['WHY DID YOU DELETE MY FILE', 'yelling'],
  ['FIX THE BUILD NOW', 'yelling'],
  ['take a break', 'rest'],
  ['go take a nap, you deserve it', 'rest'],
  ['do a barrel roll', 'roll'],
  ['high five!', 'highFive'],
  ['we did it!', 'highFive'],
  ['*pats clawd*', 'pat'],
  ['good boy', 'pat'],
  ['lol', 'laugh'],
  ['lmaooo', 'laugh'],
  ['thanks!', 'thanks'],
  ['ty', 'thanks'],
  ['THANK YOU', 'thanks'],
  ['are you sure?', 'sheepish'],
  ["that's wrong", 'sheepish'],
  ['it still doesnt work', 'sheepish'],
  ['you broke the tests', 'sheepish'],
  ['No, that is not it', 'sheepish'],
  ['oops', 'sheepish'],
  ['hi', 'hello'],
  ['hello there', 'hello'],
  ['good morning!', 'hello'],
  ['ok bye!', 'hello'],
  ['good night', 'night'],
  ["I'm done for the day", 'night'],
  ['see you tomorrow', 'night'],
  ['ship it', 'ship'],
  ['lgtm', 'ship'],
  ['dance for me', 'dance'],
  ['yay!', 'dance'],
]

/** Prompts of ordinary work that must not set him off. */
const WORK = [
  'update the README',
  "I'd love you to fix the tests",
  'Great, but the build broke',
  "let's go with option B",
  'refactor the third-party pet project helpers',
  'spin up a server',
  'take a moment to think about the design',
  'take a deep breath and think step by step',
  'remove the useless imports',
  'what is wrong with the build?',
  'Hugging Face model loader',
  'fix the failing test in auth.ts',
]

describe('reactions', () => {
  test('a prompt gets the reaction its phrases name', () => {
    expect(HEARD.map(([text]) => [text, reactionTo(text)?.name ?? null])).toEqual(HEARD)
  })

  test('ordinary work gets none', () => {
    expect(WORK.map(reactionTo)).toEqual(WORK.map(() => null))
  })

  test('slash commands, code, quotes, pasted text and links are not read', () => {
    expect(reactionTo('/tasks')).toBeNull()
    expect(reactionTo('```\nfuck this\n```\nwhat does this log mean')).toBeNull()
    expect(reactionTo('the error says `you suck`, where is it from')).toBeNull()
    expect(reactionTo('> wtf\nwhere is this quote from')).toBeNull()
    expect(said('see https://example.com/lol now')).toBe('see now')
  })

  test('a long prompt is read at its start and end only', () => {
    const middle = Array(30).fill('word').join(' ')
    expect(stretches(`one ${middle} two`)).toHaveLength(2)
    expect(reactionTo(`${middle} thanks ${middle}`)).toBeNull()
    expect(reactionTo(`${middle} thanks`)?.name).toBe('thanks')
    expect(reactionTo(`hi ${middle}`)?.name).toBe('hello')
    // A cut end is not the end of the prompt: a farewell matched only at the end stays quiet in the middle.
    expect(reactionTo(`${Array(11).fill('word').join(' ')} bye ${middle}`)).toBeNull()
  })

  test('yelling is three words or more nearly all in capitals', () => {
    expect(isYelling('STOP DOING THAT')).toBe(true)
    expect(isYelling('README TODO')).toBe(false)
    expect(isYelling('Update the README and TODO')).toBe(false)
  })

  test('every rule names a reaction, and every reaction a pose that plays once or stays put', () => {
    for (const rule of RULES) {
      expect(REACTION[rule.reaction]).toBeDefined()
    }
    for (const r of Object.values(REACTION)) {
      expect(ONE_SHOT_MS[r.pose]).toBeGreaterThan(0)
    }
  })
})
