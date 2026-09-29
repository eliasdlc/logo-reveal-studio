import { describe, expect, it } from 'vitest'
import { REST_STATE, evaluateEffect } from './effects'
import { EXIT_DURATION, clipLength, clipSegments, clipStateAt, type ClipSpec } from './timeline'

const bare: ClipSpec = { effect: 'swing', duration: 6, lead: 0, tail: 0, exit: false }
const padded: ClipSpec = { ...bare, lead: 1, tail: 1, exit: true }

describe('clipStateAt', () => {
  it('is the effect itself when there is no padding or exit', () => {
    for (const t of [0, 0.5, 1.2, 3, 6]) expect(clipStateAt(bare, t)).toEqual(evaluateEffect('swing', t))
  })

  it('shows only the background during the lead and tail', () => {
    expect(clipStateAt(padded, 0)).toBeNull()
    expect(clipStateAt(padded, 0.99)).toBeNull()
    expect(clipStateAt(padded, 7.01)).toBeNull()
    expect(clipStateAt(padded, 7.99)).toBeNull()
  })

  it('shifts the effect by the lead', () => {
    expect(clipStateAt(padded, 1.5)).toEqual(evaluateEffect('swing', 0.5))
  })

  it('fades and shrinks out at the end', () => {
    expect(clipStateAt(padded, 7 - EXIT_DURATION)).toEqual(REST_STATE)
    const mid = clipStateAt(padded, 7 - EXIT_DURATION / 2)!
    expect(mid.opacity).toBeCloseTo(0.5)
    expect(mid.scale).toBeCloseTo(0.975)
    expect(clipStateAt(padded, 7)).toMatchObject({ opacity: 0, scale: 0.95 })
  })

  it('honours a custom entry duration', () => {
    const slow = { ...bare, entryDuration: 3.2 }
    expect(clipStateAt(slow, 1.6)).toEqual(evaluateEffect('swing', 0.8))
  })
})

describe('clipSegments', () => {
  it('splits a padded clip into its parts', () => {
    expect(clipLength(padded)).toBe(8)
    expect(clipSegments(padded, 1.6).map((s) => [s.kind, s.start, s.end])).toEqual([
      ['empty', 0, 1],
      ['entry', 1, 2.6],
      ['hold', 2.6, 6.5],
      ['exit', 6.5, 7],
      ['empty', 7, 8],
    ])
  })

  it('omits empty parts', () => {
    expect(clipSegments(bare, 1.2).map((s) => s.kind)).toEqual(['entry', 'hold'])
  })
})
