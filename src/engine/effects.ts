import { easeInOutCubic, easeOutBack, easeOutCubic, easeOutElastic, lerp, linear, progress } from './easings'

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

// ─── Swing ──────────────────────────────────────────────────────────────────

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

/** Fades in while turning from 40° to face the camera and growing to full size. */
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

// ─── Card Flip ──────────────────────────────────────────────────────────────

export interface FlipConfig {
  duration: number
  /** Starts edge-on (90°), so it's invisible without any fade. */
  fromRotY: number
  overshoot: number
  fromScale: number
}

export const FLIP_DEFAULTS: FlipConfig = {
  duration: 1.2,
  fromRotY: 90,
  overshoot: 1.2,
  fromScale: 0.95,
}

/** Turns from edge-on to facing the camera like a card, overshooting slightly. */
export function flip(t: number, cfg: FlipConfig = FLIP_DEFAULTS): EffectState {
  const p = progress(t, 0, cfg.duration)
  return {
    rotX: 0,
    rotY: lerp(cfg.fromRotY, 0, easeOutBack(cfg.overshoot)(p)),
    scale: lerp(cfg.fromScale, 1, easeOutCubic(p)),
    opacity: 1,
    shine: null,
  }
}

// ─── Pop + Shine ────────────────────────────────────────────────────────────

export interface PopConfig {
  duration: number
  /** Short fade so the very first frames aren't a single stray pixel. */
  fadeDuration: number
  fromRotX: number
  fromRotY: number
  springDamping: number
  springOscillations: number
  /** The shine starts once the logo has settled (at `duration`). */
  shineDuration: number
}

export const POP_DEFAULTS: PopConfig = {
  duration: 0.9,
  fadeDuration: 0.15,
  fromRotX: 10,
  fromRotY: -10,
  springDamping: 5,
  springOscillations: 1.25,
  shineDuration: 0.8,
}

/** Springs up from nothing with a slight 3D tilt, then a diagonal shine crosses it once. */
export function pop(t: number, cfg: PopConfig = POP_DEFAULTS): EffectState {
  const p = progress(t, 0, cfg.duration)
  const tilt = easeOutCubic(p)
  const shineT = t - cfg.duration
  return {
    rotX: lerp(cfg.fromRotX, 0, tilt),
    rotY: lerp(cfg.fromRotY, 0, tilt),
    scale: easeOutElastic(cfg.springDamping, cfg.springOscillations)(p),
    opacity: linear(progress(t, 0, cfg.fadeDuration)),
    shine:
      shineT >= 0 && shineT <= cfg.shineDuration ? easeInOutCubic(progress(shineT, 0, cfg.shineDuration)) : null,
  }
}

// ─── Registry ───────────────────────────────────────────────────────────────

export type EffectId = 'swing' | 'flip' | 'pop'

export interface EffectDefinition {
  id: EffectId
  label: string
  description: string
  /** Seconds, at normal speed, until the effect is completely finished and the logo is at rest. */
  entryDuration: number
  evaluate: (t: number) => EffectState
}

export const EFFECTS: Record<EffectId, EffectDefinition> = {
  swing: {
    id: 'swing',
    label: 'Swing',
    description: 'Aparece girando suavemente hasta quedar de frente.',
    entryDuration: Math.max(SWING_DEFAULTS.fadeDuration, SWING_DEFAULTS.duration),
    evaluate: (t) => swing(t),
  },
  flip: {
    id: 'flip',
    label: 'Card Flip',
    description: 'Se voltea desde el canto como una tarjeta.',
    entryDuration: FLIP_DEFAULTS.duration,
    evaluate: (t) => flip(t),
  },
  pop: {
    id: 'pop',
    label: 'Pop + Shine',
    description: 'Aparece con un rebote suave y un brillo lo cruza.',
    entryDuration: POP_DEFAULTS.duration + POP_DEFAULTS.shineDuration,
    evaluate: (t) => pop(t),
  },
}

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[]

/**
 * State of `effect` at clip time `t`, with the whole entry stretched or compressed so it
 * lasts `entryDuration` seconds (defaults to the effect's natural length).
 */
export function evaluateEffect(effect: EffectId, t: number, entryDuration?: number): EffectState {
  const def = EFFECTS[effect]
  const speed = entryDuration && entryDuration > 0 ? def.entryDuration / entryDuration : 1
  return def.evaluate(t * speed)
}
