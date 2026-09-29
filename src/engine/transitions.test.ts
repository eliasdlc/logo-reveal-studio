import { describe, expect, it } from 'vitest'
import { REST_STATE, type EffectState } from './effects'
import { FRAME_ASPECT } from './layout'
import { TRANSITIONS, TRANSITION_IDS, evaluateTransition, liquidAt, type TransitionId } from './transitions'

const blends = TRANSITION_IDS.filter((id) => TRANSITIONS[id].evaluate)

const at = (id: TransitionId, p: number) =>
  evaluateTransition(id, p, { direction: TRANSITIONS[id].defaultDirection, duration: TRANSITIONS[id].duration })

/** Visible weight of a layer; the liquid morph blends its two logos itself. */
function weight(state: EffectState, role: 'from' | 'to', id: TransitionId, p: number): number {
  if (TRANSITIONS[id].evaluate && at(id, p).mode === 'liquid') {
    const { mix } = liquidAt(p)
    return role === 'from' ? 1 - mix : mix
  }
  if (Math.abs(Math.abs(state.rotY) - 90) < 1e-9 || Math.abs(Math.abs(state.rotX) - 90) < 1e-9) return 0
  // Pushed out of the frame.
  if (Math.abs(state.x) >= FRAME_ASPECT || Math.abs(state.y) >= 1) return 0
  const reveal = state.reveal
  const shown = !reveal ? 1 : reveal.kind === 'sweep' && reveal.keep === 'ahead' ? 1 - reveal.progress : reveal.progress
  return state.opacity * shown
}

describe('every transition', () => {
  it.each(blends)('%s starts with only the outgoing logo, exactly at rest', (id) => {
    const start = at(id, 0)
    expect(start.from).toEqual(REST_STATE)
    expect(weight(start.to, 'to', id, 0)).toBeCloseTo(0, 10)
  })

  it.each(blends)('%s ends with only the incoming logo, exactly at rest', (id) => {
    const end = at(id, 1)
    expect(end.to).toEqual(REST_STATE)
    expect(weight(end.from, 'from', id, 1)).toBeCloseTo(0, 10)
  })

  it.each(blends)('%s hands over smoothly', (id) => {
    let prev = at(id, 0)
    for (let i = 1; i <= 1000; i++) {
      const p = i / 1000
      const next = at(id, p)
      for (const role of ['from', 'to'] as const) {
        const a = prev[role]
        const b = next[role]
        expect(Math.abs(b.scale - a.scale), `${id} ${role} scale @${p}`).toBeLessThan(0.02)
        expect(Math.abs(b.blur - a.blur), `${id} ${role} blur @${p}`).toBeLessThan(0.02)
        expect(Math.abs(b.x - a.x), `${id} ${role} x @${p}`).toBeLessThan(0.03)
        // A flip swaps layers while both are edge-on, so its opacity may jump invisibly.
        if (id !== 'flip') expect(Math.abs(b.opacity - a.opacity), `${id} ${role} opacity @${p}`).toBeLessThan(0.02)
      }
      prev = next
    }
  })

  it('sequential has no blend of its own', () => {
    expect(() => at('sequential', 0.5)).toThrow()
  })
})

describe('specific transitions', () => {
  it('flip never shows both logos at once', () => {
    for (let i = 0; i <= 100; i++) {
      const { from, to } = at('flip', i / 100)
      expect(from.opacity * to.opacity).toBe(0)
    }
    expect(Math.abs(at('flip', 0.4999).from.rotY)).toBeCloseTo(90, 0)
    expect(Math.abs(at('flip', 0.5).to.rotY)).toBeCloseTo(90, 5)
  })

  it('push moves the outgoing logo out of the frame and brings the next one in from the other side', () => {
    const mid = at('push', 0.5)
    expect(mid.from.x).toBeLessThan(0)
    expect(mid.to.x).toBeGreaterThan(0)
    expect(at('push', 0.9999).from.x).toBeCloseTo(-FRAME_ASPECT, 2)
    expect(Math.abs(mid.from.smearX)).toBeGreaterThan(0.05)
  })

  it('the sweep reveals the next logo behind the line the previous one keeps ahead of it', () => {
    const { from, to } = at('sweep', 0.4)
    expect(from.reveal).toMatchObject({ kind: 'sweep', keep: 'ahead' })
    expect(to.reveal).toMatchObject({ kind: 'sweep', keep: 'behind' })
    expect(from.reveal!.progress).toBe(to.reveal!.progress)
  })

  it('the liquid morph is plain at both ends and melts in the middle', () => {
    expect(liquidAt(0)).toEqual({ mix: 0, blur: 0, goo: 0 })
    expect(liquidAt(1)).toEqual({ mix: 1, blur: 0, goo: 0 })
    const mid = liquidAt(0.5)
    expect(mid.mix).toBeCloseTo(0.5)
    expect(mid.blur).toBeGreaterThan(0.02)
    expect(mid.goo).toBe(1)
    expect(liquidAt(0.001).blur).toBeLessThan(0.001)
  })

  it('the particle morph fades the logos out and in around the flight', () => {
    expect(at('particles', 0.5).from.opacity).toBe(0)
    expect(at('particles', 0.5).to.opacity).toBe(0)
    expect(at('particles', 0.5).mode).toBe('swarm')
  })
})
