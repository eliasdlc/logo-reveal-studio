import { describe, expect, it } from 'vitest'
import { EFFECTS } from '../engine/effects'
import { TRANSITIONS } from '../engine/transitions'
import {
  DEFAULT_ANIMATION,
  DEFAULT_SEQUENCE,
  patchAnimation,
  resolveAnimation,
  resolveTransition,
  transitionDuration,
} from './animation'

describe('patchAnimation', () => {
  it('updates only the given fields of each section', () => {
    const next = patchAnimation(DEFAULT_ANIMATION, { entry: { effect: 'rise' }, hold: 1, shine: { angle: 90 } })
    expect(next.entry).toEqual({ ...DEFAULT_ANIMATION.entry, effect: 'rise' })
    expect(next.hold).toBe(1)
    expect(next.shine).toEqual({ ...DEFAULT_ANIMATION.shine, angle: 90 })
    expect(next.exit).toEqual(DEFAULT_ANIMATION.exit)
    expect(DEFAULT_ANIMATION.hold).toBe(2.5)
  })
})

describe('resolveAnimation', () => {
  it('uses each effect’s natural length unless a duration is set', () => {
    const resolved = resolveAnimation(DEFAULT_ANIMATION)
    expect(resolved.entry.duration).toBe(EFFECTS[DEFAULT_ANIMATION.entry.effect].duration)
    const custom = resolveAnimation(patchAnimation(DEFAULT_ANIMATION, { entry: { duration: 0.7 } }))
    expect(custom.entry.duration).toBe(0.7)
  })

  it('drops what is switched off', () => {
    const off = resolveAnimation(
      patchAnimation(DEFAULT_ANIMATION, { exit: { enabled: false }, shine: { enabled: false }, drift: { kind: 'none' } }),
    )
    expect(off.exit).toBeNull()
    expect(off.shine).toBeNull()
    expect(off.drift).toBeNull()
  })

  it('keeps the shine and drift settings when on', () => {
    const on = resolveAnimation(DEFAULT_ANIMATION)
    expect(on.shine).toMatchObject({ angle: DEFAULT_ANIMATION.shine.angle, style: DEFAULT_ANIMATION.shine.style })
    expect(on.drift).toEqual({ kind: 'zoom-in', amount: 1 })
  })

  it('falls back to the effect’s default direction when the chosen one does not apply', () => {
    const swing = resolveAnimation(patchAnimation(DEFAULT_ANIMATION, { entry: { effect: 'swing', direction: 'up' } }))
    expect(swing.entry.direction).toBe('right')
  })
})

describe('resolveTransition', () => {
  it('uses the natural length and a valid direction', () => {
    const spec = resolveTransition({ ...DEFAULT_SEQUENCE, transition: 'push', direction: 'up' })
    expect(spec).toEqual({ kind: 'push', duration: TRANSITIONS.push.duration, direction: 'up' })
    expect(resolveTransition({ ...DEFAULT_SEQUENCE, transition: 'liquid', direction: 'up' }).direction).toBe(
      TRANSITIONS.liquid.defaultDirection,
    )
    expect(transitionDuration({ ...DEFAULT_SEQUENCE, duration: 2 })).toBe(2)
  })
})
