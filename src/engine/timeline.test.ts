import { describe, expect, it } from 'vitest'
import { EFFECTS, REST_STATE, compose, evaluateEntry, evaluateExit, type EffectId, type EffectState } from './effects'
import { driftAt } from './drift'
import { idleAt } from './idle'
import { shineAt } from './shine'
import {
  clipProgram,
  programAt,
  segmentIndexAt,
  segmentItems,
  sequenceProgram,
  type Frame,
  type ItemAnimation,
  type MotionSpec,
  type ProgramItem,
  type TransitionSpec,
} from './timeline'
import { FRAME_ASPECT } from './layout'
import { TRANSITIONS, TRANSITION_IDS, liquidAt, type TransitionId } from './transitions'

const motion = (effect: EffectId, duration = EFFECTS[effect].duration): MotionSpec => ({
  effect,
  duration,
  intensity: 1,
  direction: EFFECTS[effect].defaultDirection,
})

const plain: ItemAnimation = {
  entry: motion('swing', 1.6),
  hold: 2,
  exit: motion('fade', 0.8),
  shine: null,
  drift: null,
  idle: null,
}

const item = (logo: string, animation: Partial<ItemAnimation> = {}): ProgramItem<string> => ({
  logo,
  scale: 1,
  animation: { ...plain, ...animation },
})

const transition = (kind: TransitionId, duration = TRANSITIONS[kind].duration): TransitionSpec => ({
  kind,
  duration,
  direction: TRANSITIONS[kind].defaultDirection,
})

/** Numbers rounded to 9 decimals, so equal maths along different paths compares equal. */
const approx = (value: unknown): unknown =>
  typeof value === 'number'
    ? Math.round(value * 1e9) / 1e9 || 0
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, approx(v)]))
      : value

const kinds = (program: { segments: { kind: string; start: number; end: number }[] }) =>
  program.segments.map((s) => [s.kind, +s.start.toFixed(6), +s.end.toFixed(6)])

describe('clipProgram', () => {
  it('plays entry, hold and exit back to back', () => {
    const program = clipProgram(item('a'))
    expect(program.length).toBeCloseTo(4.4)
    expect(kinds(program)).toEqual([
      ['entry', 0, 1.6],
      ['hold', 1.6, 3.6],
      ['exit', 3.6, 4.4],
    ])
  })

  it('adds the empty lead and tail', () => {
    const program = clipProgram(item('a'), { lead: 1, tail: 1 })
    expect(program.length).toBeCloseTo(6.4)
    expect(kinds(program)[0]).toEqual(['empty', 0, 1])
    expect(kinds(program).at(-1)).toEqual(['empty', 5.4, 6.4])
    expect(programAt(program, 0.5)!.draws).toEqual([])
    expect(programAt(program, 6)!.draws).toEqual([])
  })

  it('without an exit, ends with the logo on screen', () => {
    const program = clipProgram(item('a', { exit: null }))
    expect(program.length).toBeCloseTo(3.6)
    expect(programAt(program, 3.6)!.draws).toEqual([{ kind: 'logo', item: 0, state: REST_STATE }])
  })

  it('skips an empty hold', () => {
    expect(clipProgram(item('a', { hold: 0 })).segments.map((s) => s.kind)).toEqual(['entry', 'exit'])
  })

  it('shows the entry, then the logo at rest, then the exit', () => {
    const program = clipProgram(item('a'), { lead: 1, tail: 0 })
    const stateAt = (t: number) => (programAt(program, t)!.draws[0] as { state: EffectState }).state
    const params = { ...plain.entry }
    expect(approx(stateAt(1.8))).toEqual(approx(evaluateEntry('swing', 0.8 / 1.6, params)))
    expect(stateAt(3)).toEqual(REST_STATE)
    expect(approx(stateAt(4.6 + 0.4))).toEqual(approx(evaluateExit('fade', 0.5, plain.exit!)))
  })

  it('layers the drift and the shine on top of the motion', () => {
    const shine = { delay: 0.2, duration: 1, interval: 0, angle: 45, width: 0.2, intensity: 0.6, style: 'soft' as const }
    const drift = { kind: 'zoom-in' as const, amount: 1 }
    const program = clipProgram(item('a', { shine, drift }))
    const frame = programAt(program, 2.3)!
    const expected = compose(REST_STATE, { ...driftAt(drift, 2.3, 4.4), shine: shineAt(shine, 0.7, 2) })
    expect(approx(frame.draws[0])).toEqual(approx({ kind: 'logo', item: 0, state: expected }))
  })

  it('plays the idle motion only while the logo is at rest', () => {
    const idle = { kind: 'sway' as const, amount: 1, period: 1 }
    const program = clipProgram(item('a', { idle, hold: 3 }))
    const stateAt = (t: number) => (programAt(program, t)!.draws[0] as { state: EffectState }).state
    expect(stateAt(1.6)).toEqual(REST_STATE)
    expect(approx(stateAt(1.6 + 1.25))).toEqual(approx(idleAt(idle, 1.25, 3)))
    expect(Math.abs(stateAt(1.6 + 1.25).rotY)).toBeGreaterThan(5)
    expect(stateAt(4.6)).toEqual(REST_STATE)
  })
})

describe('sequenceProgram', () => {
  const items = [item('a'), item('b'), item('c')]

  it('chains the logos with the transition', () => {
    const program = sequenceProgram(items, transition('crossfade', 1))
    expect(kinds(program)).toEqual([
      ['entry', 0, 1.6],
      ['hold', 1.6, 3.6],
      ['transition', 3.6, 4.6],
      ['hold', 4.6, 6.6],
      ['transition', 6.6, 7.6],
      ['hold', 7.6, 9.6],
      ['exit', 9.6, 10.4],
    ])
    expect(program.length).toBeCloseTo(10.4)
  })

  it('draws both logos during a transition', () => {
    const program = sequenceProgram(items, transition('crossfade', 1))
    const frame = programAt(program, 4.1)!
    expect(frame.draws.map((d) => d.kind === 'logo' && d.item)).toEqual([0, 1])
  })

  it('uses each logo’s own exit and entry for "sequential"', () => {
    const program = sequenceProgram(items, transition('sequential'))
    expect(kinds(program).slice(1, 5)).toEqual([
      ['hold', 1.6, 3.6],
      ['exit', 3.6, 4.4],
      ['entry', 4.4, 6],
      ['hold', 6, 8],
    ])
    // Never two logos at once.
    for (let t = 0; t < program.length; t += 0.05) expect(programAt(program, t)!.draws.length).toBeLessThanOrEqual(1)
  })

  it('cuts straight to the next entry when a logo has no exit', () => {
    const program = sequenceProgram([item('a', { exit: null }), item('b')], transition('sequential'))
    expect(program.segments.map((s) => s.kind)).toEqual(['entry', 'hold', 'entry', 'hold', 'exit'])
  })

  it('draws the liquid morph as one shape and the particle morph over both logos', () => {
    const liquid = programAt(sequenceProgram(items, transition('liquid', 1)), 4.1)!
    expect(liquid.draws.map((d) => d.kind)).toEqual(['liquid'])
    const swarm = programAt(sequenceProgram(items, transition('particles', 2)), 4.1)!
    expect(swarm.draws.map((d) => d.kind)).toEqual(['logo', 'logo', 'swarm'])
  })

  it('handles one logo and none', () => {
    expect(sequenceProgram([item('a')], transition('liquid')).segments.map((s) => s.kind)).toEqual([
      'entry',
      'hold',
      'exit',
    ])
    expect(sequenceProgram([], transition('liquid')).length).toBe(0)
    expect(programAt(sequenceProgram([], transition('liquid')), 1)).toBeNull()
  })

  describe('seamless loop', () => {
    const drift = { kind: 'zoom-in' as const, amount: 1 }
    const shine = { delay: -0.5, duration: 1, interval: 0, angle: 45, width: 0.2, intensity: 0.6, style: 'soft' as const }
    const looping = [item('a', { drift, shine }), item('b', { drift, shine }), item('c', { drift, shine })]

    it.each(['crossfade', 'sequential', 'liquid'] as const)('%s: starts at rest on the first logo and transitions back into it', (kind) => {
      const program = sequenceProgram(looping, transition(kind, 1), { loop: true })
      expect(program.segments[0]).toMatchObject({ kind: 'hold', start: 0 })
      const last = program.segments.at(-1)!
      expect(last.end).toBeCloseTo(program.length)
      expect(segmentItems(last)).toContain(0)
    })

    it.each(['crossfade', 'sequential', 'liquid', 'particles'] as const)('%s: the last frame flows into the first', (kind) => {
      const program = sequenceProgram(looping, transition(kind, 1), { loop: true })
      expect(visible(programAt(program, program.length - 1e-7)!)).toEqual(visible(programAt(program, 0)!))
    })

    it('needs two logos; one logo plays normally', () => {
      const program = sequenceProgram([item('a')], transition('crossfade'), { loop: true })
      expect(program.segments.map((s) => s.kind)).toEqual(['entry', 'hold', 'exit'])
    })
  })
})

describe('segmentIndexAt', () => {
  const program = clipProgram(item('a'))

  it('gives boundaries to the later segment and clamps outside the program', () => {
    expect(segmentIndexAt(program, 0)).toBe(0)
    expect(segmentIndexAt(program, 1.6)).toBe(1)
    expect(segmentIndexAt(program, 100)).toBe(2)
    expect(segmentIndexAt(program, -1)).toBe(0)
  })

  it('evaluates past the end as the final frame', () => {
    expect(programAt(program, 100)).toEqual(programAt(program, program.length))
  })
})

// ─── Continuity ─────────────────────────────────────────────────────────────

/**
 * What the viewer sees, per logo: layers that can't be seen are dropped, and the liquid
 * morph counts as its two logos weighted by the blend. Rounded so tiny float noise and
 * sub-pixel differences compare equal.
 */
function visible(frame: Frame): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = {}
  const add = (item: number, state: EffectState, weight: number) => {
    const edgeOn = Math.abs(Math.cos((state.rotY * Math.PI) / 180) * Math.cos((state.rotX * Math.PI) / 180)) < 1e-3
    const reveal = state.reveal
    const shown = !reveal ? 1 : reveal.kind === 'sweep' && reveal.keep === 'ahead' ? 1 - reveal.progress : reveal.progress
    // Pushed out of the frame (the widest logo is 55% of it).
    const offFrame = Math.abs(state.x) >= FRAME_ASPECT * 0.78 || Math.abs(state.y) >= 0.73
    const w = weight * state.opacity * shown * (edgeOn || offFrame ? 0 : 1)
    if (w < 0.01) return
    const r = (v: number) => Math.round(v * 100) / 100 || 0
    out[item] = {
      weight: r(w),
      x: r(state.x),
      y: r(state.y),
      z: r(state.z),
      rotX: Math.round(state.rotX) || 0,
      rotY: Math.round(state.rotY) || 0,
      scale: r(state.scale),
      blur: r(state.blur * 10),
      flash: r(state.flash),
      shine: state.shine ? r(state.shine.position) : -1,
    }
  }
  for (const draw of frame.draws) {
    if (draw.kind === 'logo') add(draw.item, draw.state, 1)
    else if (draw.kind === 'liquid') {
      const { mix } = liquidAt(draw.progress)
      add(draw.from.item, draw.from.state, 1 - mix)
      add(draw.to.item, draw.to.state, mix)
    }
  }
  return out
}

describe('continuity', () => {
  // An amount that doesn't land scales exactly on the half-hundredths `visible` rounds at.
  const drift = { kind: 'zoom-in' as const, amount: 0.93 }
  const shine = { delay: 0.1, duration: 0.8, interval: 1.2, angle: 90, width: 0.2, intensity: 0.6, style: 'glint' as const }

  it.each(TRANSITION_IDS)('%s: nothing pops at any segment boundary', (kind) => {
    const items = ['a', 'b', 'c'].map((logo, i) =>
      item(logo, {
        entry: motion((['focus', 'rise', 'particles'] as const)[i]),
        exit: motion((['slide', 'wipe', 'depth'] as const)[i]),
        drift,
        idle: { kind: (['hover', 'tilt', 'pulse'] as const)[i], amount: 1.5, period: 1.3 },
        shine,
      }),
    )
    for (const loop of [false, true]) {
      const program = sequenceProgram(items, transition(kind), { loop })
      for (const seg of program.segments.slice(1)) {
        expect(visible(programAt(program, seg.start - 1e-7)!), `${kind} ${seg.kind} @${seg.start}`).toEqual(
          visible(programAt(program, seg.start)!),
        )
      }
    }
  })
})
