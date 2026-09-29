import type { DriftKind } from '../engine/drift'
import { EFFECTS, directionFor, type Direction, type EffectId, type ShineStyle } from '../engine/effects'
import type { ItemAnimation, MotionSpec, TransitionSpec } from '../engine/timeline'
import { TRANSITIONS, type TransitionId } from '../engine/transitions'

/** An entry or exit as the user sets it. */
export interface MotionSettings {
  effect: EffectId
  /** Seconds; null = the effect's natural length. */
  duration: number | null
  intensity: number
  direction: Direction
}

export interface ExitSettings extends MotionSettings {
  enabled: boolean
}

export interface ShineSettings {
  enabled: boolean
  /** Seconds after the logo is at rest; negative starts it during the entry. */
  delay: number
  duration: number
  /** Seconds between sweeps; 0 = only once. */
  interval: number
  /** Travel direction in degrees: 0 = →, 90 = ↑. */
  angle: number
  /** Band width, in logo heights. */
  width: number
  intensity: number
  style: ShineStyle
}

export interface DriftSettings {
  kind: DriftKind | 'none'
  amount: number
}

/** How a logo arrives, stays and leaves. */
export interface AnimationSettings {
  entry: MotionSettings
  /** Seconds the logo stays still (at rest) between entry and exit. */
  hold: number
  exit: ExitSettings
  shine: ShineSettings
  drift: DriftSettings
}

export interface SequenceSettings {
  transition: TransitionId
  /** Seconds; null = the transition's natural length. */
  duration: number | null
  direction: Direction
  /** Seamless loop: ends with the transition back into the first logo. */
  loop: boolean
}

export const DEFAULT_ANIMATION: AnimationSettings = {
  entry: { effect: 'focus', duration: null, intensity: 1, direction: 'up' },
  hold: 2.5,
  exit: { enabled: true, effect: 'fade', duration: null, intensity: 1, direction: 'up' },
  shine: {
    enabled: true,
    delay: 0.1,
    duration: 1.1,
    interval: 0,
    angle: 45,
    width: 0.2,
    intensity: 0.6,
    style: 'glint',
  },
  drift: { kind: 'zoom-in', amount: 1 },
}

export const DEFAULT_SEQUENCE: SequenceSettings = {
  transition: 'liquid',
  duration: null,
  direction: 'left',
  loop: false,
}

/** Partial update of an animation, section by section. */
export interface AnimationPatch {
  entry?: Partial<MotionSettings>
  hold?: number
  exit?: Partial<ExitSettings>
  shine?: Partial<ShineSettings>
  drift?: Partial<DriftSettings>
}

export function patchAnimation(animation: AnimationSettings, patch: AnimationPatch): AnimationSettings {
  return {
    entry: { ...animation.entry, ...patch.entry },
    hold: patch.hold ?? animation.hold,
    exit: { ...animation.exit, ...patch.exit },
    shine: { ...animation.shine, ...patch.shine },
    drift: { ...animation.drift, ...patch.drift },
  }
}

export const motionDuration = (motion: MotionSettings): number => motion.duration ?? EFFECTS[motion.effect].duration

const resolveMotion = (motion: MotionSettings): MotionSpec => ({
  effect: motion.effect,
  duration: motionDuration(motion),
  intensity: motion.intensity,
  direction: directionFor(motion.effect, motion.direction),
})

/** The settings as the timeline plays them. */
export function resolveAnimation(animation: AnimationSettings): ItemAnimation {
  const { entry, hold, exit, shine, drift } = animation
  return {
    entry: resolveMotion(entry),
    hold,
    exit: exit.enabled ? resolveMotion(exit) : null,
    shine: shine.enabled
      ? {
          delay: shine.delay,
          duration: shine.duration,
          interval: shine.interval,
          angle: shine.angle,
          width: shine.width,
          intensity: shine.intensity,
          style: shine.style,
        }
      : null,
    drift: drift.kind === 'none' ? null : { kind: drift.kind, amount: drift.amount },
  }
}

export const transitionDuration = (sequence: SequenceSettings): number =>
  sequence.duration ?? TRANSITIONS[sequence.transition].duration

export function resolveTransition(sequence: SequenceSettings): TransitionSpec {
  const { directions, defaultDirection } = TRANSITIONS[sequence.transition]
  return {
    kind: sequence.transition,
    duration: transitionDuration(sequence),
    direction: directions?.includes(sequence.direction) ? sequence.direction : defaultDirection,
  }
}
