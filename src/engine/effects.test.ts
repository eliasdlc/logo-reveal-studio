import { describe, expect, it } from 'vitest'
import { EFFECTS, REST_STATE, swing } from './effects'

describe('swing', () => {
  it('starts invisible, turned 40° and at 88% scale', () => {
    expect(swing(0)).toEqual({ rotX: 0, rotY: 40, scale: 0.88, opacity: 0, shine: null })
  })

  it('is fully opaque after 0.4 s while still turning', () => {
    const s = swing(0.4)
    expect(s.opacity).toBe(1)
    expect(s.rotY).toBeGreaterThan(0)
    expect(s.scale).toBeLessThan(1)
  })

  it('fades linearly', () => {
    expect(swing(0.2).opacity).toBeCloseTo(0.5)
  })

  it('rests exactly at 1.6 s and stays there', () => {
    for (const t of [1.6, 2, 6, 100]) expect(swing(t)).toEqual(REST_STATE)
  })

  it('never overshoots', () => {
    for (let t = 0; t <= 1.6; t += 1 / 60) {
      const s = swing(t)
      expect(s.rotY).toBeGreaterThanOrEqual(0)
      expect(s.scale).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic', () => {
    expect(swing(0.73)).toEqual(swing(0.73))
  })

  it('declares its entry duration', () => {
    expect(EFFECTS.swing.entryDuration).toBe(1.6)
  })
})
