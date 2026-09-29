import { easeOutCubic, lerp, linear, progress } from './easings'

/** Pose of the logo at a given instant. Angles in degrees. */
export interface EffectState {
  rotX: number
  rotY: number
  scale: number
  opacity: number
  /** Position of the diagonal shine sweep, 0→1 while it crosses; null when there is no shine. */
  shine: number | null
}

export const REST_STATE: EffectState = { rotX: 0, rotY: 0, scale: 1, opacity: 1, shine: null }

export interface SwingConfig {
  fadeDuration: number
  duration: number
  fromRotY: number
  fromScale: number
}

export const SWING_DEFAULTS: SwingConfig = {
  fadeDuration: 0.4,
  duration: 1.6,
  fromRotY: 40,
  fromScale: 0.88,
}

/** Swing: fades in while turning from 40° to face the camera and growing to full size. */
export function swing(t: number, cfg: SwingConfig = SWING_DEFAULTS): EffectState {
  const fade = linear(progress(t, 0, cfg.fadeDuration))
  const move = easeOutCubic(progress(t, 0, cfg.duration))
  return {
    rotX: 0,
    rotY: lerp(cfg.fromRotY, 0, move),
    scale: lerp(cfg.fromScale, 1, move),
    opacity: fade,
    shine: null,
  }
}

export type EffectId = 'swing'

export interface EffectDefinition {
  id: EffectId
  label: string
  /** Seconds until the logo is completely at rest. */
  entryDuration: number
  evaluate: (t: number) => EffectState
}

export const EFFECTS: Record<EffectId, EffectDefinition> = {
  swing: {
    id: 'swing',
    label: 'Swing',
    entryDuration: Math.max(SWING_DEFAULTS.fadeDuration, SWING_DEFAULTS.duration),
    evaluate: (t) => swing(t),
  },
}
