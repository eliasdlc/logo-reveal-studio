import { describe, expect, it } from 'vitest'
import { EFFECTS, EFFECT_IDS, REST_STATE, evaluateEffect, flip, pop, swing, type EffectState } from './effects'

const sample = (f: (t: number) => EffectState, from: number, to: number, fps = 240) =>
  Array.from({ length: Math.round((to - from) * fps) + 1 }, (_, i) => f(from + i / fps))

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

  it('never overshoots', () => {
    for (const s of sample(swing, 0, 1.6)) {
      expect(s.rotY).toBeGreaterThanOrEqual(0)
      expect(s.scale).toBeLessThanOrEqual(1)
    }
  })
})

describe('flip', () => {
  it('starts edge-on and slightly smaller', () => {
    expect(flip(0)).toMatchObject({ rotY: 90, scale: 0.95, opacity: 1 })
  })

  it('overshoots past facing the camera by a few degrees, then settles', () => {
    const minRotY = Math.min(...sample(flip, 0, 1.2).map((s) => s.rotY))
    expect(minRotY).toBeLessThan(-1)
    expect(minRotY).toBeGreaterThan(-10)
  })

  it('never grows past full size', () => {
    for (const s of sample(flip, 0, 1.2)) expect(s.scale).toBeLessThanOrEqual(1)
  })
})

describe('pop', () => {
  it('starts from nothing, tilted', () => {
    expect(pop(0)).toMatchObject({ rotX: 10, rotY: -10, scale: 0, opacity: 0, shine: null })
  })

  it('bounces softly past full size', () => {
    const peak = Math.max(...sample(pop, 0, 0.9).map((s) => s.scale))
    expect(peak).toBeGreaterThan(1.02)
    expect(peak).toBeLessThan(1.15)
  })

  it('sweeps the shine exactly once after settling', () => {
    expect(pop(0.89).shine).toBeNull()
    expect(pop(0.9).shine).toBe(0)
    expect(pop(1.3).shine).toBeCloseTo(0.5)
    expect(pop(1.7).shine).toBe(1)
    expect(pop(1.71).shine).toBeNull()
    const sweep = sample(pop, 0.9, 1.69).map((s) => s.shine!)
    for (let i = 1; i < sweep.length; i++) expect(sweep[i]).toBeGreaterThanOrEqual(sweep[i - 1])
  })
})

describe('every effect', () => {
  it.each(EFFECT_IDS)('%s rests exactly when its entry ends and stays there', (id) => {
    const end = EFFECTS[id].entryDuration
    for (const t of [end + 0.001, end + 1, 6, 100]) expect(evaluateEffect(id, t)).toEqual(REST_STATE)
  })

  it.each(EFFECT_IDS)('%s is deterministic', (id) => {
    expect(evaluateEffect(id, 0.73)).toEqual(evaluateEffect(id, 0.73))
  })

  it.each(EFFECT_IDS)('%s can be stretched to a custom entry duration', (id) => {
    const natural = EFFECTS[id].entryDuration
    expect(evaluateEffect(id, 1, 2 * natural)).toEqual(evaluateEffect(id, 0.5))
    expect(evaluateEffect(id, 2 * natural + 0.01, 2 * natural)).toEqual(REST_STATE)
  })
})
