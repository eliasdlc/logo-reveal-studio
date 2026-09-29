import { describe, expect, it } from 'vitest'
import { easeArrive } from './easings'
import {
  EFFECTS,
  EFFECT_IDS,
  REST_STATE,
  compose,
  directionFor,
  evaluateEntry,
  evaluateExit,
  opposite,
  pose,
  type EffectId,
  type EffectState,
  type MotionParams,
} from './effects'

const params = (effect: EffectId, patch: Partial<MotionParams> = {}): MotionParams => ({
  intensity: 1,
  direction: EFFECTS[effect].defaultDirection,
  duration: EFFECTS[effect].duration,
  ...patch,
})

const entry = (effect: EffectId, p: number, patch?: Partial<MotionParams>) => evaluateEntry(effect, p, params(effect, patch))

/** Whether the logo can be seen at all in this state. */
function isHidden(s: EffectState): boolean {
  if (s.opacity <= 0 || s.scale <= 0) return true
  if (Math.abs(Math.abs(s.rotX) - 90) < 1e-9 || Math.abs(Math.abs(s.rotY) - 90) < 1e-9) return true
  return s.reveal !== null && s.reveal.progress <= 0
}

/** Numbers that end up on screen (the particle shader fades its dots out by p = 1). */
const channels = (s: EffectState) => ({
  x: s.x,
  y: s.y,
  z: s.z,
  rotX: s.rotX,
  rotY: s.rotY,
  rotZ: s.rotZ,
  scale: s.scale,
  opacity: s.opacity,
  blur: s.blur,
  smear: Math.hypot(s.smearX, s.smearY),
  flash: s.flash,
  reveal: s.reveal ? 1 - s.reveal.progress : 0,
  glow: s.reveal && 'glow' in s.reveal ? s.reveal.glow : 0,
})

/** Largest change of any channel between consecutive samples. */
function maxStep(f: (p: number) => EffectState, steps = 1000): Record<string, number> {
  const worst: Record<string, number> = {}
  let prev = channels(f(0))
  for (let i = 1; i <= steps; i++) {
    const next = channels(f(i / steps))
    for (const [key, value] of Object.entries(next)) {
      worst[key] = Math.max(worst[key] ?? 0, Math.abs(value - prev[key as keyof typeof prev]))
    }
    prev = next
  }
  return worst
}

describe('every entry', () => {
  it.each(EFFECT_IDS)('%s is exactly at rest when it ends and stays there', (id) => {
    for (const p of [1, 1.001, 3]) expect(entry(id, p)).toEqual(REST_STATE)
  })

  it.each(EFFECT_IDS)('%s starts with the logo not visible', (id) => {
    expect(isHidden(entry(id, 0))).toBe(true)
  })

  it.each(EFFECT_IDS)('%s arrives smoothly: nothing jumps between frames, and its last frame is at rest', (id) => {
    const steps = maxStep((p) => entry(id, p))
    // 1000 samples: a smooth curve changes very little per step.
    for (const key of ['x', 'y', 'z', 'scale', 'opacity', 'blur', 'smear', 'flash', 'reveal', 'glow']) {
      expect(steps[key], `${id}.${key}`).toBeLessThan(key === 'z' ? 0.05 : 0.03)
    }
    for (const key of ['rotX', 'rotY', 'rotZ']) expect(steps[key], `${id}.${key}`).toBeLessThan(1.5)
    const almost = channels(entry(id, 0.9995))
    const rest = channels(REST_STATE)
    for (const [key, value] of Object.entries(almost)) {
      expect(Math.abs(value - rest[key as keyof typeof rest]), `${id}.${key}`).toBeLessThan(0.02)
    }
  })

  it.each(EFFECT_IDS)('%s is deterministic', (id) => {
    expect(entry(id, 0.37)).toEqual(entry(id, 0.37))
  })

  it.each(EFFECT_IDS)('%s has a valid default direction', (id) => {
    const { directions, defaultDirection } = EFFECTS[id]
    if (directions) expect(directions).toContain(defaultDirection)
  })
})

describe('every exit', () => {
  it.each(EFFECT_IDS)('%s starts exactly at rest', (id) => {
    expect(evaluateExit(id, 0, params(id))).toEqual(REST_STATE)
  })

  it.each(EFFECT_IDS)('%s ends where the entry (from the opposite side) starts', (id) => {
    const p = params(id)
    expect(evaluateExit(id, 1, p)).toEqual(evaluateEntry(id, 0, { ...p, direction: opposite(p.direction) }))
  })

  it.each(EFFECT_IDS.filter((id) => !EFFECTS[id].exitWarp))('%s is the entry played backwards', (id) => {
    const p = params(id)
    for (const t of [0.2, 0.5, 0.8]) {
      expect(evaluateExit(id, t, p)).toEqual(evaluateEntry(id, 1 - t, { ...p, direction: opposite(p.direction) }))
    }
  })

  it.each(EFFECT_IDS.filter((id) => EFFECTS[id].exitWarp))('%s accelerates away instead of lingering', (id) => {
    const warp = EFFECTS[id].exitWarp!
    // The arrival curve, played backwards through the warp, moves like a cubic ease-in.
    for (const p of [0.25, 0.5, 0.75]) expect(1 - easeArrive(warp(p))).toBeCloseTo(p ** 3, 3)
  })

  it.each(EFFECT_IDS)('%s leaves smoothly', (id) => {
    const steps = maxStep((p) => evaluateExit(id, p, params(id)))
    for (const key of ['x', 'y', 'scale', 'opacity', 'blur', 'flash', 'reveal']) {
      expect(steps[key], `${id}.${key}`).toBeLessThan(0.035)
    }
  })
})

describe('specific effects', () => {
  it('swing keeps its original look: 40°, 88% scale, fading in', () => {
    expect(entry('swing', 0)).toMatchObject({ rotY: 40, scale: 0.88, opacity: 0 })
    expect(entry('swing', 0, { direction: 'left' }).rotY).toBe(-40)
    expect(entry('swing', 0.125).opacity).toBeCloseTo(0.5)
  })

  it('card flip overshoots a few degrees past facing the camera', () => {
    const angles = Array.from({ length: 101 }, (_, i) => entry('flip', i / 100).rotY)
    expect(Math.min(...angles)).toBeLessThan(-1)
    expect(Math.min(...angles)).toBeGreaterThan(-10)
    expect(entry('flip', 0, { direction: 'up' })).toMatchObject({ rotX: -90, rotY: 0 })
  })

  it('pop bounces softly past full size', () => {
    const peak = Math.max(...Array.from({ length: 201 }, (_, i) => entry('pop', i / 200).scale))
    expect(peak).toBeGreaterThan(1.02)
    expect(peak).toBeLessThan(1.15)
  })

  it('slide comes from the opposite side of its direction, with motion blur', () => {
    const start = entry('slide', 0.05, { direction: 'right' })
    expect(start.x).toBeLessThan(0)
    expect(start.smearX).toBeGreaterThan(0)
    expect(entry('slide', 0.05, { direction: 'up' }).y).toBeLessThan(0)
    const out = evaluateExit('slide', 0.95, params('slide', { direction: 'right' }))
    expect(out.x).toBeGreaterThan(0)
  })

  it('rise slides out from behind its own edge', () => {
    expect(entry('rise', 0.5).reveal).toMatchObject({ kind: 'slide', direction: 'up' })
    expect(entry('rise', 0).reveal!.progress).toBe(0)
  })

  it('particles hand over to the real logo at the very end', () => {
    expect(entry('particles', 0.5)).toMatchObject({ opacity: 0, particles: { progress: 0.5 } })
    expect(entry('particles', 0.99).opacity).toBeGreaterThan(0.99)
  })

  it('intensity scales the amount of motion', () => {
    expect(entry('focus', 0, { intensity: 2 }).blur).toBeCloseTo(2 * entry('focus', 0).blur)
    expect(entry('slide', 0.3, { intensity: 0.5 }).x).toBeCloseTo(entry('slide', 0.3).x / 2)
  })
})

describe('directionFor', () => {
  it('keeps a direction the effect supports and falls back otherwise', () => {
    expect(directionFor('slide', 'up')).toBe('up')
    expect(directionFor('swing', 'up')).toBe('right')
    expect(directionFor('focus', 'left')).toBe(EFFECTS.focus.defaultDirection)
  })
})

describe('compose', () => {
  const state = pose({ x: 0.1, rotY: 12, scale: 0.9, opacity: 0.5, blur: 0.03, flash: 0.2 })

  it('has REST_STATE as identity', () => {
    expect(compose(REST_STATE, state)).toEqual(state)
    expect(compose(state, REST_STATE)).toEqual(state)
  })

  it('adds offsets and angles, multiplies scale and opacity', () => {
    const both = compose(state, state)
    expect(both).toMatchObject({ x: 0.2, rotY: 24, opacity: 0.25 })
    expect(both.scale).toBeCloseTo(0.81)
    expect(both.blur).toBeCloseTo(Math.hypot(0.03, 0.03))
    expect(both.flash).toBeCloseTo(0.36)
  })
})
