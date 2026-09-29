import { describe, expect, it } from 'vitest'
import { REST_STATE, type EffectState } from './effects'
import { idleAt, type IdleKind } from './idle'

const KINDS: IdleKind[] = ['hover', 'breathe', 'sway', 'tilt', 'pulse']
const spec = (kind: IdleKind) => ({ kind, amount: 1, period: 3 })

/** How far a state is from rest, over the channels the idle motions use. */
const offset = (s: EffectState) =>
  Math.abs(s.y) * 50 + Math.abs(s.rotX) / 10 + Math.abs(s.rotY) / 10 + Math.abs(s.scale - 1) * 20 + s.flash * 5

describe('idleAt', () => {
  it.each(KINDS)('%s is exactly at rest when the rest starts and ends, and outside it', (kind) => {
    for (const t of [-1, 0, 6, 7]) expect(idleAt(spec(kind), t, 6)).toEqual(REST_STATE)
  })

  it.each(KINDS)('%s eases in and out, so it never adds a jump to the entry or exit', (kind) => {
    expect(offset(idleAt(spec(kind), 0.01, 6))).toBeLessThan(0.01)
    expect(offset(idleAt(spec(kind), 5.99, 6))).toBeLessThan(0.01)
  })

  it.each(KINDS)('%s moves smoothly and visibly in the middle of the rest', (kind) => {
    let prev = idleAt(spec(kind), 0, 6)
    let most = 0
    for (let i = 1; i <= 2400; i++) {
      const next = idleAt(spec(kind), (i / 2400) * 6, 6)
      expect(Math.abs(next.y - prev.y)).toBeLessThan(0.001)
      expect(Math.abs(next.rotX - prev.rotX) + Math.abs(next.rotY - prev.rotY)).toBeLessThan(0.3)
      expect(Math.abs(next.scale - prev.scale)).toBeLessThan(0.005)
      most = Math.max(most, offset(next))
      prev = next
    }
    expect(most).toBeGreaterThan(0.3)
  })

  it('repeats with the period and scales with the amount', () => {
    const a = idleAt({ kind: 'sway', amount: 1, period: 2 }, 2.5, 10)
    const b = idleAt({ kind: 'sway', amount: 1, period: 2 }, 4.5, 10)
    expect(a.rotY).toBeCloseTo(b.rotY)
    expect(idleAt({ kind: 'sway', amount: 2, period: 2 }, 2.5, 10).rotY).toBeCloseTo(2 * a.rotY)
  })

  it('stays still for a rest shorter than nothing', () => {
    expect(idleAt(spec('hover'), 0.5, 0)).toEqual(REST_STATE)
  })
})
