import { smoothstep } from './easings'
import type { EffectState } from './effects'

/** How the logo's surface looks. */
export interface FinishSpec {
  /** A solid 3D emblem (thickness, bevelled edges, studio lighting); false = flat, as in the file. */
  emblem: boolean
  /** Thickness, in logo heights. */
  depth: number
  /** Width of the rounded edges, in logo heights. */
  bevel: number
  /** 0–1: specular highlights and rim light. */
  gloss: number
  /** 0–1: how much it reflects the studio around it, like polished metal. */
  metal: number
  /** 0–1: mirror reflection on the floor below the logo (flat logos too). */
  reflection: number
}

/**
 * How much of the emblem's solid body (its extruded sides) to show for a layer state.
 * The sides only make sense once the face is complete and sharp, so they fade in at the
 * very end of reveals, blurs and motion blur instead of showing through them.
 */
export function solidity(state: EffectState): number {
  const { reveal } = state
  let shown = state.opacity
  if (reveal) {
    const coverage = reveal.kind === 'sweep' && reveal.keep === 'ahead' ? 1 - reveal.progress : reveal.progress
    shown *= smoothstep(0.85, 1, coverage)
  }
  shown *= 1 - smoothstep(0, 0.03, state.blur)
  shown *= 1 - smoothstep(0, 0.02, Math.hypot(state.smearX, state.smearY))
  return shown
}
