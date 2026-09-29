import {
  cubicBezier,
  easeArrive,
  easeArriveInverse,
  easeInCubic,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  easeOutElastic,
  easeOutQuart,
  lerp,
  linear,
  progress,
  smoothstep,
  type Easing,
} from './easings'

// ─── Directions ─────────────────────────────────────────────────────────────

/** Direction the motion travels towards (an entry "right" comes in from the left). */
export type Direction = 'left' | 'right' | 'up' | 'down'

export const ALL_DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down']
export const HORIZONTAL: readonly Direction[] = ['left', 'right']

export const opposite = (d: Direction): Direction =>
  d === 'left' ? 'right' : d === 'right' ? 'left' : d === 'up' ? 'down' : 'up'

export const directionVector = (d: Direction): [number, number] =>
  d === 'left' ? [-1, 0] : d === 'right' ? [1, 0] : d === 'up' ? [0, 1] : [0, -1]

export const isVertical = (d: Direction): boolean => d === 'up' || d === 'down'

// ─── State of one logo layer ────────────────────────────────────────────────

/**
 * How the logo is masked while it's being revealed. Coordinates are the logo's own
 * content box, so the reveal always spans exactly the visible logo.
 */
export type Reveal =
  /** The content slides in from behind its own edge (a line it rises from). `smear` is motion blur, in logo lengths. */
  | { kind: 'slide'; direction: Direction; progress: number; smear: number }
  /** A soft straight edge travels across the logo; `glow` lights up the edge. */
  | { kind: 'wipe'; direction: Direction; progress: number; softness: number; glow: number }
  /** A circle opens from the centre. */
  | { kind: 'iris'; progress: number; softness: number; glow: number }
  /** Strips slide in from alternating sides, one after another. `travel` in logo lengths. */
  | { kind: 'slices'; direction: Direction; progress: number; count: number; travel: number; shutter: number }
  /** Organic noise dissolve with a glowing frontier. */
  | { kind: 'dissolve'; progress: number; softness: number; glow: number; scale: number }
  /**
   * A soft line crosses the frame (shared by two logos in a transition): the outgoing logo
   * keeps what's `ahead` of the line, the incoming one what's `behind` it.
   */
  | { kind: 'sweep'; direction: Direction; progress: number; keep: 'ahead' | 'behind'; glow: number }

export type ShineStyle = 'soft' | 'glint' | 'double'

/** A light band crossing the logo, masked by the logo itself. */
export interface ShineState {
  /** 0 → 1 while the band crosses (it's fully outside the logo at both ends). */
  position: number
  /** Travel direction in degrees: 0 = →, 90 = ↑. */
  angle: number
  /** Band width, in logo heights. */
  width: number
  /** 0–1: how close to white the band gets. */
  intensity: number
  style: ShineStyle
}

/** The logo assembling from (or scattering into) particles. */
export interface ParticleState {
  /** 0 = all scattered, 1 = all in place. */
  progress: number
  direction: Direction
  /** How far the particles fly from, relative to the designed amount. */
  spread: number
}

/** Pose and look of one logo layer at an instant. Angles in degrees. */
export interface EffectState {
  /** Offset from the rest position, in frame heights (the frame is 1 unit tall). */
  x: number
  y: number
  /** Towards the camera, in frame heights. */
  z: number
  rotX: number
  rotY: number
  rotZ: number
  scale: number
  opacity: number
  /** Soft (lens) blur radius, in logo heights. */
  blur: number
  /** Motion blur: length and direction of the smear, in frame heights. */
  smearX: number
  smearY: number
  /** Mix towards white: 0 = the logo's own colours, 1 = a white silhouette. */
  flash: number
  reveal: Reveal | null
  shine: ShineState | null
  particles: ParticleState | null
}

export const REST_STATE: EffectState = Object.freeze({
  x: 0,
  y: 0,
  z: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scale: 1,
  opacity: 1,
  blur: 0,
  smearX: 0,
  smearY: 0,
  flash: 0,
  reveal: null,
  shine: null,
  particles: null,
})

export const pose = (patch: Partial<EffectState>): EffectState => ({ ...REST_STATE, ...patch })

/**
 * Stacks two states: offsets and angles add, scale and opacity multiply, blurs combine.
 * REST_STATE is the identity.
 */
export function compose(a: EffectState, b: EffectState): EffectState {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
    rotX: a.rotX + b.rotX,
    rotY: a.rotY + b.rotY,
    rotZ: a.rotZ + b.rotZ,
    scale: a.scale * b.scale,
    opacity: a.opacity * b.opacity,
    blur: Math.hypot(a.blur, b.blur),
    smearX: a.smearX + b.smearX,
    smearY: a.smearY + b.smearY,
    flash: a.flash + b.flash - a.flash * b.flash,
    reveal: a.reveal ?? b.reveal,
    shine: a.shine ?? b.shine,
    particles: a.particles ?? b.particles,
  }
}

// ─── Entry effects ──────────────────────────────────────────────────────────

export interface MotionParams {
  /** 1 = the designed amount of motion; 0.5 subtler, 1.5 bolder. */
  intensity: number
  direction: Direction
  /** Real length of the motion in seconds (for velocity-based effects like motion blur). */
  duration: number
}

/** Exposure time used for motion blur, in seconds. Longer than a real shutter, for style. */
const SHUTTER = 1 / 30

/** Motion blur along a path: how far `ease` moves during the shutter ending at `p`. */
const smearOf = (ease: Easing, p: number, duration: number): number => {
  const window = SHUTTER / Math.max(duration, 0.05)
  return ease(p) - ease(Math.max(0, p - window))
}

/** Glow for reveal edges: fades in at the start and is gone before the logo is at rest. */
const edgeGlow = (p: number): number => smoothstep(0, 0.12, p) * smoothstep(1, 0.7, p)

export type EffectGroup = 'classic' | 'cinematic' | 'reveal' | 'special'

export const EFFECT_GROUPS: { id: EffectGroup; label: string }[] = [
  { id: 'classic', label: 'Clásicas' },
  { id: 'cinematic', label: 'Cinemáticas' },
  { id: 'reveal', label: 'Revelados' },
  { id: 'special', label: 'Especiales' },
]

export type EffectId =
  | 'fade'
  | 'swing'
  | 'flip'
  | 'pop'
  | 'focus'
  | 'depth'
  | 'flash'
  | 'slide'
  | 'rise'
  | 'wipe'
  | 'iris'
  | 'slices'
  | 'dissolve'
  | 'particles'

export interface EffectDefinition {
  id: EffectId
  label: string
  description: string
  group: EffectGroup
  /** Natural length in seconds. */
  duration: number
  /** Directions it can travel in, or null when it has no direction. */
  directions: readonly Direction[] | null
  defaultDirection: Direction
  /** True when the effect ignores the intensity setting. */
  fixedIntensity?: boolean
  /**
   * Maps exit progress to the entry progress to play (default 1 − p). Entries that land
   * with a long exponential settle would, played backwards, sit still for most of the exit
   * and then vanish; this makes them accelerate away smoothly instead.
   */
  exitWarp?: Easing
  /**
   * The logo arriving, from p = 0 (not visible yet) to p = 1 (at rest). Exits play it
   * backwards. Only ever called with 0 ≤ p < 1: at p ≥ 1 the logo is at REST_STATE.
   */
  enter: (p: number, params: MotionParams) => EffectState
}

const sideSign = (d: Direction): number => (d === 'left' || d === 'down' ? -1 : 1)

/** For entries driven by easeArrive: the exit moves like a cubic ease-in. */
const arriveExit: Easing = (p) => easeArriveInverse(1 - easeInCubic(p))

const flipOvershoot = (k: number): Easing => easeOutBack(1.2 * k)
const wipeEase = cubicBezier(0.6, 0, 0.2, 1)
const irisEase = cubicBezier(0.55, 0, 0.15, 1)

export const EFFECTS: Record<EffectId, EffectDefinition> = {
  fade: {
    id: 'fade',
    label: 'Fundido',
    description: 'Aparece suavemente con un leve acercamiento.',
    group: 'classic',
    duration: 0.9,
    directions: null,
    defaultDirection: 'up',
    enter: (p, { intensity: k }) =>
      pose({ opacity: easeInOutSine(p), scale: lerp(1 - 0.05 * k, 1, easeOutCubic(p)) }),
  },
  swing: {
    id: 'swing',
    label: 'Swing',
    description: 'Gira suavemente en 3D hasta quedar de frente.',
    group: 'classic',
    duration: 1.6,
    directions: HORIZONTAL,
    defaultDirection: 'right',
    enter: (p, { intensity: k, direction }) => {
      const move = easeOutCubic(p)
      return pose({
        rotY: lerp(40 * k * sideSign(direction), 0, move),
        scale: lerp(1 - 0.12 * k, 1, move),
        opacity: linear(progress(p, 0, 0.25)),
      })
    },
  },
  flip: {
    id: 'flip',
    label: 'Card Flip',
    description: 'Se voltea desde el canto como una tarjeta.',
    group: 'classic',
    duration: 1.2,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'right',
    enter: (p, { intensity: k, direction }) => {
      // Starts edge-on (90°), so it's invisible without any fade.
      const angle = lerp(90, 0, flipOvershoot(k)(p)) * sideSign(direction)
      return pose({
        rotX: isVertical(direction) ? -angle : 0,
        rotY: isVertical(direction) ? 0 : angle,
        scale: lerp(1 - 0.05 * k, 1, easeOutCubic(p)),
      })
    },
  },
  pop: {
    id: 'pop',
    label: 'Pop',
    description: 'Surge con un rebote elástico y una leve inclinación.',
    group: 'classic',
    duration: 0.9,
    directions: null,
    defaultDirection: 'up',
    enter: (p, { intensity: k }) => {
      const tilt = easeOutCubic(p)
      return pose({
        rotX: lerp(10 * k, 0, tilt),
        rotY: lerp(-10 * k, 0, tilt),
        scale: easeOutElastic(5 / Math.max(k, 0.2), 1.25)(p),
        opacity: linear(progress(p, 0, 0.15)),
      })
    },
  },
  focus: {
    id: 'focus',
    label: 'Enfoque',
    description: 'Pasa de desenfocado a nítido mientras se asienta, como un cambio de foco de cámara.',
    group: 'cinematic',
    duration: 1.5,
    directions: null,
    defaultDirection: 'up',
    exitWarp: arriveExit,
    enter: (p, { intensity: k }) =>
      pose({
        blur: 0.22 * k * (1 - easeOutCubic(p)),
        scale: 1 + 0.1 * k * (1 - easeArrive(p)),
        opacity: easeOutCubic(progress(p, 0, 0.5)),
      }),
  },
  depth: {
    id: 'depth',
    label: 'Llegada 3D',
    description: 'Llega desde el fondo de la escena, inclinado, y se endereza frente a la cámara.',
    group: 'cinematic',
    duration: 1.8,
    directions: HORIZONTAL,
    defaultDirection: 'right',
    exitWarp: arriveExit,
    enter: (p, { intensity: k, direction }) => {
      const rest = 1 - easeArrive(p)
      return pose({
        z: -3 * k * rest,
        rotX: 28 * k * rest,
        rotY: -24 * k * rest * sideSign(direction),
        blur: 0.05 * k * rest,
        opacity: easeOutCubic(progress(p, 0, 0.35)),
      })
    },
  },
  flash: {
    id: 'flash',
    label: 'Destello',
    description: 'Nace de un destello de luz y sus colores se revelan poco a poco.',
    group: 'cinematic',
    duration: 1.4,
    directions: null,
    defaultDirection: 'up',
    exitWarp: arriveExit,
    enter: (p, { intensity: k }) =>
      pose({
        opacity: easeOutCubic(progress(p, 0, 0.18)),
        flash: 1 - easeOutCubic(progress(p, 0.08, 0.75)),
        blur: 0.12 * k * (1 - easeOutQuart(p)),
        scale: 1 + 0.08 * k * (1 - easeArrive(p)),
      }),
  },
  slide: {
    id: 'slide',
    label: 'Deslizar',
    description: 'Entra deslizándose con desenfoque de movimiento.',
    group: 'cinematic',
    duration: 1.0,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'right',
    exitWarp: arriveExit,
    enter: (p, { intensity: k, direction, duration }) => {
      const [dx, dy] = directionVector(direction)
      const travel = 0.35 * k
      const rest = 1 - easeArrive(p)
      const smear = travel * smearOf(easeArrive, p, duration)
      return pose({
        x: -dx * travel * rest,
        y: -dy * travel * rest,
        smearX: dx * smear,
        smearY: dy * smear,
        opacity: easeOutCubic(progress(p, 0, 0.4)),
      })
    },
  },
  rise: {
    id: 'rise',
    label: 'Ascenso',
    description: 'Emerge desde detrás de una línea invisible, con un corte limpio.',
    group: 'reveal',
    duration: 1.1,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'up',
    fixedIntensity: true,
    exitWarp: arriveExit,
    enter: (p, { direction, duration }) =>
      pose({
        reveal: { kind: 'slide', direction, progress: easeArrive(p), smear: smearOf(easeArrive, p, duration) },
      }),
  },
  wipe: {
    id: 'wipe',
    label: 'Barrido',
    description: 'Un borde de luz suave recorre el logo y lo va revelando.',
    group: 'reveal',
    duration: 1.2,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'right',
    enter: (p, { intensity: k, direction }) =>
      pose({
        reveal: { kind: 'wipe', direction, progress: wipeEase(p), softness: 0.25, glow: 0.5 * k * edgeGlow(p) },
        scale: 1 + 0.025 * k * (1 - easeArrive(p)),
      }),
  },
  iris: {
    id: 'iris',
    label: 'Círculo',
    description: 'Se abre en un círculo desde el centro.',
    group: 'reveal',
    duration: 1.1,
    directions: null,
    defaultDirection: 'up',
    enter: (p, { intensity: k }) =>
      pose({
        reveal: { kind: 'iris', progress: irisEase(p), softness: 0.12, glow: 0.4 * k * edgeGlow(p) },
        scale: 1 + 0.05 * k * (1 - easeArrive(p)),
      }),
  },
  slices: {
    id: 'slices',
    label: 'Franjas',
    description: 'Se arma con franjas que llegan desde lados alternos.',
    group: 'reveal',
    duration: 1.3,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'right',
    enter: (p, { intensity: k, direction, duration }) =>
      pose({
        reveal: {
          kind: 'slices',
          direction,
          progress: p,
          count: 6,
          travel: 0.45 * k,
          shutter: SHUTTER / Math.max(duration, 0.05),
        },
      }),
  },
  dissolve: {
    id: 'dissolve',
    label: 'Disolver',
    description: 'Se materializa de forma orgánica, con un borde luminoso.',
    group: 'reveal',
    duration: 1.6,
    directions: null,
    defaultDirection: 'up',
    enter: (p, { intensity: k }) =>
      pose({
        reveal: { kind: 'dissolve', progress: easeInOutSine(p), softness: 0.3, glow: 0.2 * k * edgeGlow(p), scale: 2.4 },
        blur: 0.02 * k * (1 - easeOutCubic(p)),
      }),
  },
  particles: {
    id: 'particles',
    label: 'Partículas',
    description: 'Miles de partículas con los colores del logo vuelan y se ensamblan.',
    group: 'special',
    duration: 2.4,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'right',
    enter: (p, { intensity: k, direction }) =>
      pose({
        particles: { progress: p, direction, spread: k },
        // The real logo fades in over the assembled dots at the very end.
        opacity: smoothstep(0.72, 1, p),
      }),
  },
}

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[]

/** The logo arriving: `p` is 0 → 1 over the entry; at 1 it's exactly at rest. */
export function evaluateEntry(effect: EffectId, p: number, params: MotionParams): EffectState {
  if (p >= 1) return REST_STATE
  return EFFECTS[effect].enter(Math.max(0, p), params)
}

/**
 * The logo leaving: the entry played backwards, travelling towards `params.direction`.
 * At p = 0 it's exactly at rest.
 */
export function evaluateExit(effect: EffectId, p: number, params: MotionParams): EffectState {
  if (p <= 0) return REST_STATE
  const warp = EFFECTS[effect].exitWarp
  const q = p >= 1 ? 0 : warp ? warp(p) : 1 - p
  return evaluateEntry(effect, q, { ...params, direction: opposite(params.direction) })
}

/** Whether a direction applies to the effect; falls back to its default otherwise. */
export function directionFor(effect: EffectId, direction: Direction): Direction {
  const { directions, defaultDirection } = EFFECTS[effect]
  return directions?.includes(direction) ? direction : defaultDirection
}
