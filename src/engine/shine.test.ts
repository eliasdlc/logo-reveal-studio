import { describe, expect, it } from 'vitest'
import { shineAt, shineReach, type ShineSpec } from './shine'

const spec: ShineSpec = { delay: 0.2, duration: 1, interval: 0, angle: 45, width: 0.2, intensity: 0.6, style: 'glint' }

describe('shineAt', () => {
  it('sweeps once, starting `delay` seconds after the logo arrives', () => {
    expect(shineAt(spec, 0.1, 5)).toBeNull()
    expect(shineAt(spec, 0.2, 5)).toMatchObject({ position: 0, angle: 45, width: 0.2, intensity: 0.6, style: 'glint' })
    expect(shineAt(spec, 0.7, 5)!.position).toBeCloseTo(0.5)
    expect(shineAt(spec, 1.2, 5)!.position).toBe(1)
    expect(shineAt(spec, 1.21, 5)).toBeNull()
    expect(shineAt(spec, 4, 5)).toBeNull()
  })

  it('moves steadily forward', () => {
    let prev = -1
    for (let t = 0.2; t <= 1.2; t += 0.01) {
      const position = shineAt(spec, t, 5)!.position
      expect(position).toBeGreaterThanOrEqual(prev)
      prev = position
    }
  })

  it('can start during the entry', () => {
    expect(shineAt({ ...spec, delay: -0.5 }, -0.5, 5)!.position).toBe(0)
  })

  it('repeats every `interval` seconds while the logo is at rest', () => {
    const repeating = { ...spec, interval: 2 }
    expect(shineAt(repeating, 2.7, 5)!.position).toBeCloseTo(0.5)
    expect(shineAt(repeating, 1.5, 5)).toBeNull()
    // A repeat that wouldn't finish before the logo leaves doesn't start.
    expect(shineAt(repeating, 4.3, 5)).toBeNull()
  })

  it('always plays the first sweep, even if the logo leaves before it ends', () => {
    expect(shineAt(spec, 0.9, 0.5)).not.toBeNull()
  })

  it('never overlaps sweeps: the period is at least one sweep long', () => {
    const fast = { ...spec, interval: 0.1 }
    expect(shineAt(fast, 0.2 + 1.5, 10)!.position).toBeCloseTo(0.5)
  })
})

describe('shineReach', () => {
  it('starts and ends the band clear of the logo', () => {
    // Horizontal travel across a 3:1 logo: half its width plus three band widths.
    expect(shineReach(0, 0.2, 3)).toBeCloseTo(1.5 + 0.6)
    expect(shineReach(90, 0.2, 3)).toBeCloseTo(0.5 + 0.6)
    expect(shineReach(45, 0.1, 1)).toBeCloseTo(Math.SQRT1_2 + 0.3)
  })
})
