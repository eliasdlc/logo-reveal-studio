import { describe, expect, it } from 'vitest'
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, easeOutElastic, linear, progress } from './easings'

const curves = {
  linear,
  easeOutCubic,
  easeOutBack: easeOutBack(1.2),
  easeInOutCubic,
  easeOutElastic: easeOutElastic(),
}

describe('easings', () => {
  it.each(Object.entries(curves))('%s starts at 0 and ends at 1', (_, f) => {
    expect(f(0)).toBeCloseTo(0, 10)
    expect(f(1)).toBeCloseTo(1, 10)
  })

  it('easeOutCubic is monotonic and front-loaded', () => {
    let prev = 0
    for (let i = 1; i <= 100; i++) {
      const v = easeOutCubic(i / 100)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
  })

  it('easeOutBack overshoots then settles', () => {
    const f = easeOutBack(1.2)
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => f(i / 100)))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.1)
  })

  it('easeOutElastic overshoots softly and settles', () => {
    const f = easeOutElastic()
    const samples = Array.from({ length: 201 }, (_, i) => f(i / 200))
    const peak = Math.max(...samples)
    expect(peak).toBeGreaterThan(1.03)
    expect(peak).toBeLessThan(1.12)
    expect(Math.abs(f(0.95) - 1)).toBeLessThan(0.01)
  })

  it('easeInOutCubic is symmetric', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75))
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
})
