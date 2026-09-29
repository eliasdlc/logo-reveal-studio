import { describe, expect, it } from 'vitest'
import {
  clamp01,
  cubicBezier,
  easeArrive,
  easeArriveInverse,
  easeInCubic,
  easeInOutCubic,
  easeInOutQuart,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  easeOutElastic,
  easeOutExpo,
  easeOutQuart,
  easeOutQuint,
  easeTravel,
  linear,
  progress,
  smoothstep,
} from './easings'

const curves = {
  linear,
  easeInCubic,
  easeOutCubic,
  easeOutQuart,
  easeOutQuint,
  easeOutExpo,
  easeInOutSine,
  easeInOutCubic,
  easeInOutQuart,
  easeOutBack: easeOutBack(1.2),
  easeOutElastic: easeOutElastic(),
  easeArrive,
  easeArriveInverse,
  easeTravel,
}

const samples = (f: (x: number) => number, n = 200) => Array.from({ length: n + 1 }, (_, i) => f(i / n))

describe('easings', () => {
  it.each(Object.entries(curves))('%s starts at 0 and ends at 1', (_, f) => {
    expect(f(0)).toBeCloseTo(0, 10)
    expect(f(1)).toBeCloseTo(1, 10)
  })

  it.each(['easeOutCubic', 'easeOutQuart', 'easeOutQuint', 'easeOutExpo', 'easeArrive', 'easeTravel'] as const)(
    '%s is monotonic',
    (name) => {
      const values = samples(curves[name])
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] - 1e-9)
    },
  )

  it('easeOutCubic is front-loaded', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
  })

  it('easeOutBack overshoots then settles', () => {
    const peak = Math.max(...samples(easeOutBack(1.2), 100))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.1)
  })

  it('easeOutElastic overshoots softly and settles', () => {
    const f = easeOutElastic()
    const peak = Math.max(...samples(f))
    expect(peak).toBeGreaterThan(1.03)
    expect(peak).toBeLessThan(1.12)
    expect(Math.abs(f(0.95) - 1)).toBeLessThan(0.01)
  })

  it('in-out curves are symmetric', () => {
    for (const f of [easeInOutCubic, easeInOutSine, easeInOutQuart, easeTravel]) {
      expect(f(0.5)).toBeCloseTo(0.5, 4)
      expect(f(0.25)).toBeCloseTo(1 - f(0.75), 4)
    }
  })

  it('easeArrive does most of its travel early, like a motion-design arrival', () => {
    expect(easeArrive(0.25)).toBeGreaterThan(0.75)
    expect(easeArrive(0.9)).toBeGreaterThan(0.99)
  })
})

describe('cubicBezier', () => {
  it('is the identity for a straight line', () => {
    const f = cubicBezier(0, 0, 1, 1)
    for (const x of [0.1, 0.33, 0.5, 0.9]) expect(f(x)).toBeCloseTo(x, 6)
  })

  it('matches CSS "ease"', () => {
    // Reference values from the CSS cubic-bezier(0.25, 0.1, 0.25, 1) timing function.
    const ease = cubicBezier(0.25, 0.1, 0.25, 1)
    expect(ease(0.5)).toBeCloseTo(0.8024, 3)
    expect(ease(0.25)).toBeCloseTo(0.4085, 3)
  })

  it('swapping the control points gives the inverse curve', () => {
    for (const x of [0.05, 0.2, 0.5, 0.8, 0.97]) expect(easeArriveInverse(easeArrive(x))).toBeCloseTo(x, 3)
  })

  it('clamps outside [0, 1]', () => {
    expect(easeArrive(-1)).toBe(0)
    expect(easeArrive(2)).toBe(1)
  })
})

describe('progress', () => {
  it('maps a window to [0, 1] and clamps outside it', () => {
    expect(progress(-1, 0, 2)).toBe(0)
    expect(progress(1, 0, 2)).toBe(0.5)
    expect(progress(5, 0, 2)).toBe(1)
    expect(progress(1.5, 1, 1)).toBe(0.5)
  })

  it('handles zero-length windows', () => {
    expect(progress(0.9, 1, 0)).toBe(0)
    expect(progress(1, 1, 0)).toBe(1)
  })

  it('clamp01', () => {
    expect(clamp01(-0.1)).toBe(0)
    expect(clamp01(1.2)).toBe(1)
    expect(clamp01(0.4)).toBe(0.4)
  })

  it('smoothstep, also inverted', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5)
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(1, 0, 0)).toBe(1)
    expect(smoothstep(1, 0, 1)).toBe(0)
  })
})
