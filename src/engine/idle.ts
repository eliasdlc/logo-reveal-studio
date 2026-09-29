import { smoothstep } from './easings'
import { REST_STATE, pose, type EffectState } from './effects'

/**
 * A looping motion while the logo is at rest, so it never looks frozen: it floats,
 * breathes, sways… It eases in after the entry and out before the exit or transition, so
 * it never adds a jump to them.
 */
export type IdleKind = 'hover' | 'breathe' | 'sway' | 'tilt' | 'pulse'

export interface IdleSpec {
  kind: IdleKind
  /** 1 = the designed amount. */
  amount: number
  /** Seconds per cycle. */
  period: number
}

/** Seconds the idle motion takes to fade in after the entry and out before the exit. */
const RAMP = 0.8

const TAU = 2 * Math.PI

/** Two quick beats at the start of each cycle, like a heartbeat (0 → 1 → 0). */
function heartbeat(u: number): number {
  const beat = (centre: number, width: number) => Math.exp(-(((u - centre) / width) ** 2))
  return beat(0.12, 0.045) + 0.65 * beat(0.3, 0.055)
}

/**
 * The idle motion `elapsed` seconds after the logo came to rest, for a rest that lasts
 * `window` seconds. REST_STATE outside the rest and exactly at both of its ends.
 */
export function idleAt(spec: IdleSpec, elapsed: number, window: number): EffectState {
  if (window <= 0 || spec.period <= 0 || elapsed <= 0 || elapsed >= window) return REST_STATE
  const ramp = Math.min(RAMP, window / 2)
  const a = spec.amount * smoothstep(0, ramp, elapsed) * smoothstep(0, ramp, window - elapsed)
  const phase = (TAU * elapsed) / spec.period
  switch (spec.kind) {
    case 'hover':
      // Levitates above its shadow, tipping slightly forward as it rises.
      return pose({ y: 0.02 * a * Math.sin(phase), rotX: -4 * a * Math.sin(phase - 0.9) })
    case 'breathe':
      return pose({ scale: 1 + 0.05 * a * (1 - Math.cos(phase)) * 0.5 })
    case 'sway':
      // Turns gently from side to side in 3D.
      return pose({ rotY: 12 * a * Math.sin(phase) })
    case 'tilt':
      // A slow figure of eight, like a card held in the air.
      return pose({
        rotY: 10 * a * Math.sin(phase),
        rotX: 6 * a * Math.sin(2 * phase),
        y: 0.007 * a * Math.sin(2 * phase),
      })
    case 'pulse': {
      const beat = heartbeat((elapsed / spec.period) % 1)
      return pose({ scale: 1 + 0.06 * a * beat, flash: Math.min(1, 0.3 * a * beat) })
    }
  }
}
