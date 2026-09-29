import { easeInOutCubic, lerp, progress } from './easings'
import { evaluateEffect, type EffectId, type EffectState } from './effects'

export const EXIT_DURATION = 0.5
export const EXIT_SCALE = 0.95

/** Everything that decides what one logo's video shows over time. */
export interface ClipSpec {
  effect: EffectId
  /** Seconds the entry lasts; undefined = the effect's natural length. */
  entryDuration?: number
  /** Time the logo is on screen: entry + hold (+ exit). */
  duration: number
  /** Empty background before and after the logo. */
  lead: number
  tail: number
  /** Fade/shrink out during the last EXIT_DURATION seconds of `duration`. */
  exit: boolean
}

export const clipLength = (clip: ClipSpec): number => clip.lead + clip.duration + clip.tail

/** Logo pose at video time `t`, or null when the frame is just the empty background. */
export function clipStateAt(clip: ClipSpec, t: number): EffectState | null {
  const local = t - clip.lead
  if (local < 0 || local > clip.duration) return null
  const state = evaluateEffect(clip.effect, local, clip.entryDuration)
  if (!clip.exit) return state
  const out = easeInOutCubic(progress(local, clip.duration - EXIT_DURATION, EXIT_DURATION))
  if (out <= 0) return state
  return {
    ...state,
    scale: state.scale * lerp(1, EXIT_SCALE, out),
    opacity: state.opacity * (1 - out),
  }
}

/** Named stretches of the clip, for the scrubber. */
export interface ClipSegment {
  kind: 'empty' | 'entry' | 'hold' | 'exit'
  start: number
  end: number
}

export function clipSegments(clip: ClipSpec, entryDuration: number): ClipSegment[] {
  const segments: ClipSegment[] = []
  const push = (kind: ClipSegment['kind'], start: number, end: number) => {
    if (end > start) segments.push({ kind, start, end })
  }
  const logoStart = clip.lead
  const logoEnd = clip.lead + clip.duration
  const exitStart = clip.exit ? logoEnd - EXIT_DURATION : logoEnd
  const entryEnd = Math.min(logoStart + entryDuration, exitStart)
  push('empty', 0, logoStart)
  push('entry', logoStart, entryEnd)
  push('hold', entryEnd, exitStart)
  push('exit', exitStart, logoEnd)
  push('empty', logoEnd, clipLength(clip))
  return segments
}
