import { clamp01 } from './easings'
import { pose, REST_STATE, type EffectState } from './effects'

/** Subtle continuous motion while the logo is on screen, so it never sits dead still. */
export type DriftKind = 'zoom-in' | 'zoom-out' | 'float'

export interface DriftSpec {
  kind: DriftKind
  /** 1 = the designed amount. */
  amount: number
}

/** Seconds per float cycle (rounded so the cycles fit the time on screen). */
const FLOAT_PERIOD = 5

/**
 * Drift after `elapsed` seconds of a logo that is on screen for `span` seconds in total.
 * It starts at rest when the logo appears and moves at a steady pace until it's gone.
 */
export function driftAt(spec: DriftSpec, elapsed: number, span: number): EffectState {
  if (span <= 0) return REST_STATE
  const q = clamp01(elapsed / span)
  switch (spec.kind) {
    case 'zoom-in':
      return pose({ scale: 1 + 0.06 * spec.amount * q })
    case 'zoom-out':
      return pose({ scale: 1 - 0.05 * spec.amount * q })
    case 'float': {
      const cycles = Math.max(1, Math.round(span / FLOAT_PERIOD))
      return pose({ y: 0.012 * spec.amount * Math.sin(2 * Math.PI * cycles * q) })
    }
  }
}
