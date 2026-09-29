import type { DriftKind } from '../engine/drift'
import { ALL_DIRECTIONS, EFFECTS, directionFor, type Direction, type EffectId, type ShineStyle } from '../engine/effects'
import type { IdleKind } from '../engine/idle'
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

/** Looping motion while the logo is at rest. */
export interface IdleSettings {
  kind: IdleKind | 'none'
  amount: number
  /** Seconds per cycle. */
  period: number
}

/** How a logo arrives, stays and leaves. */
export interface AnimationSettings {
  entry: MotionSettings
  /** Seconds the logo stays still (at rest) between entry and exit. */
  hold: number
  exit: ExitSettings
  shine: ShineSettings
  drift: DriftSettings
  idle: IdleSettings
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
  idle: { kind: 'hover', amount: 1, period: 3.5 },
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
  idle?: Partial<IdleSettings>
}

export function patchAnimation(animation: AnimationSettings, patch: AnimationPatch): AnimationSettings {
  return {
    entry: { ...animation.entry, ...patch.entry },
    hold: patch.hold ?? animation.hold,
    exit: { ...animation.exit, ...patch.exit },
    shine: { ...animation.shine, ...patch.shine },
    drift: { ...animation.drift, ...patch.drift },
    idle: { ...animation.idle, ...patch.idle },
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
  const { entry, hold, exit, shine, drift, idle } = animation
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
    idle: idle.kind === 'none' ? null : { kind: idle.kind, amount: idle.amount, period: idle.period },
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

// ─── Restoring saved settings ───────────────────────────────────────────────

type Loose = Record<string, unknown>
type Check = (value: unknown) => boolean

const isObject = (value: unknown): value is Loose => typeof value === 'object' && value !== null

/**
 * `fallback` with each field replaced by the saved one when that has the same type (a
 * nullable duration may be a number) and passes its check, if any.
 */
function merge<T extends object>(fallback: T, saved: unknown, checks: Partial<Record<keyof T, Check>> = {}): T {
  if (!isObject(saved)) return fallback
  const out: Loose = { ...(fallback as Loose) }
  for (const [key, value] of Object.entries(fallback)) {
    const candidate = saved[key]
    const check = checks[key as keyof T]
    const sameType = typeof candidate === typeof value || (value === null && typeof candidate === 'number')
    if (candidate !== undefined && sameType && (!check || check(candidate))) out[key] = candidate
  }
  return out as T
}

const oneOf =
  (values: readonly unknown[]): Check =>
  (v) =>
    values.includes(v)
const isNumber: Check = (v) => typeof v === 'number' && Number.isFinite(v)
const isDuration: Check = (v) => v === null || (isNumber(v) && (v as number) > 0)
const motionChecks = {
  effect: (v: unknown) => typeof v === 'string' && v in EFFECTS,
  duration: isDuration,
  intensity: isNumber,
  direction: oneOf(ALL_DIRECTIONS),
}

/**
 * Animation settings read back from storage, possibly saved by an older version: anything
 * missing, unknown or of the wrong type falls back to its default.
 */
export function normalizeAnimation(saved: unknown): AnimationSettings {
  const raw = isObject(saved) ? saved : {}
  const d = DEFAULT_ANIMATION
  return {
    entry: merge(d.entry, raw.entry, motionChecks),
    hold: isNumber(raw.hold) && (raw.hold as number) >= 0 ? (raw.hold as number) : d.hold,
    exit: merge(d.exit, raw.exit, motionChecks),
    shine: merge(d.shine, raw.shine, { style: oneOf(['soft', 'glint', 'double']) }),
    drift: merge(d.drift, raw.drift, { kind: oneOf(['none', 'zoom-in', 'zoom-out']), amount: isNumber }),
    idle: merge(d.idle, raw.idle, {
      kind: oneOf(['none', 'hover', 'breathe', 'sway', 'tilt', 'pulse']),
      amount: isNumber,
      period: isDuration,
    }),
  }
}

export function normalizeSequence(saved: unknown): SequenceSettings {
  return merge(DEFAULT_SEQUENCE, saved, {
    transition: (v) => typeof v === 'string' && v in TRANSITIONS,
    duration: isDuration,
    direction: oneOf(ALL_DIRECTIONS),
  })
}
