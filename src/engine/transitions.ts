import {
  clamp01,
  cubicBezier,
  easeArrive,
  easeInCubic,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  easeTravel,
  lerp,
  progress,
  smoothstep,
} from './easings'
import {
  ALL_DIRECTIONS,
  REST_STATE,
  directionVector,
  isVertical,
  pose,
  type Direction,
  type EffectState,
} from './effects'
import { FRAME_ASPECT } from './layout'

/**
 * How the pair is drawn: as two ordinary layers, as one liquid shape melting from one
 * logo into the other, or with a cloud of particles flying from one logo to the other.
 */
export type TransitionMode = 'layers' | 'liquid' | 'swarm'

export interface TransitionFrame {
  mode: TransitionMode
  /** The outgoing logo, relative to its rest pose. */
  from: EffectState
  /** The incoming logo, relative to its rest pose. */
  to: EffectState
}

export interface TransitionParams {
  direction: Direction
  /** Real length in seconds (for motion blur). */
  duration: number
}

export type TransitionId = 'sequential' | 'crossfade' | 'zoom' | 'liquid' | 'particles' | 'flip' | 'push' | 'sweep'

export interface TransitionDefinition {
  id: TransitionId
  label: string
  description: string
  /** Natural length in seconds (0 for 'sequential', which uses each logo's own exit and entry). */
  duration: number
  directions: readonly Direction[] | null
  defaultDirection: Direction
  /** Null for 'sequential': the outgoing logo's exit plays, then the next logo's entry. */
  evaluate: ((p: number, params: TransitionParams) => TransitionFrame) | null
}

const SHUTTER = 1 / 30
const sweepEase = cubicBezier(0.45, 0, 0.25, 1)

const layers = (from: Partial<EffectState>, to: Partial<EffectState>): TransitionFrame => ({
  mode: 'layers',
  from: pose(from),
  to: pose(to),
})

export const TRANSITIONS: Record<TransitionId, TransitionDefinition> = {
  sequential: {
    id: 'sequential',
    label: 'Salida + entrada',
    description: 'Cada logo sale con su propia salida y el siguiente entra con su propia entrada.',
    duration: 0,
    directions: null,
    defaultDirection: 'right',
    evaluate: null,
  },
  liquid: {
    id: 'liquid',
    label: 'Morph líquido',
    description: 'Un logo se derrite y se transforma en el siguiente como si fuera líquido.',
    duration: 1.4,
    directions: null,
    defaultDirection: 'right',
    evaluate: (p) => {
      const pulse = 1 - 0.035 * Math.sin(Math.PI * p)
      return { mode: 'liquid', from: pose({ scale: pulse }), to: pose({ scale: pulse }) }
    },
  },
  particles: {
    id: 'particles',
    label: 'Morph de partículas',
    description: 'El logo se deshace en partículas que vuelan y forman el siguiente.',
    duration: 2.6,
    directions: null,
    defaultDirection: 'right',
    evaluate: (p) => ({
      mode: 'swarm',
      from: pose({ opacity: 1 - smoothstep(0, 0.14, p) }),
      to: pose({ opacity: smoothstep(0.86, 1, p) }),
    }),
  },
  crossfade: {
    id: 'crossfade',
    label: 'Fundido cruzado',
    description: 'Uno se desvanece mientras el otro aparece, con un leve acercamiento.',
    duration: 1.0,
    directions: null,
    defaultDirection: 'right',
    evaluate: (p) => {
      const e = easeInOutSine(p)
      return layers({ opacity: 1 - e, scale: 1 + 0.04 * e }, { opacity: e, scale: 0.96 + 0.04 * e })
    },
  },
  zoom: {
    id: 'zoom',
    label: 'Zoom desenfocado',
    description: 'El logo avanza hacia la cámara y se desenfoca; el siguiente llega desde atrás y enfoca.',
    duration: 1.2,
    directions: null,
    defaultDirection: 'right',
    evaluate: (p) => {
      const out = easeInCubic(progress(p, 0, 0.6))
      const inn = progress(p, 0.4, 0.6)
      return layers(
        { scale: 1 + 0.35 * out, blur: 0.18 * out, opacity: 1 - smoothstep(0.15, 0.55, p) },
        {
          scale: lerp(0.75, 1, easeArrive(inn)),
          blur: 0.18 * (1 - easeOutCubic(inn)),
          opacity: smoothstep(0.4, 0.75, p),
        },
      )
    },
  },
  flip: {
    id: 'flip',
    label: 'Giro',
    description: 'El logo gira como una tarjeta y por detrás aparece el siguiente.',
    duration: 1.0,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'left',
    evaluate: (p, { direction }) => {
      const sign = direction === 'left' || direction === 'down' ? -1 : 1
      const first = p < 0.5
      // Both are edge-on (invisible) at the half-way switch, so nothing pops.
      const outAngle = 90 * easeInCubic(progress(p, 0, 0.5)) * sign
      const inAngle = -90 * (1 - easeOutBack(1.1)(progress(p, 0.5, 0.5))) * sign
      const dip = 1 - 0.08 * Math.sin(Math.PI * p)
      const turn = (angle: number) => (isVertical(direction) ? { rotX: -angle } : { rotY: angle })
      return layers(
        { ...turn(outAngle), scale: dip, opacity: first ? 1 : 0 },
        { ...turn(inAngle), scale: dip, opacity: first ? 0 : 1 },
      )
    },
  },
  push: {
    id: 'push',
    label: 'Empuje',
    description: 'El siguiente logo entra empujando al anterior fuera del cuadro.',
    duration: 0.9,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'left',
    evaluate: (p, { direction, duration }) => {
      const [dx, dy] = directionVector(direction)
      const travel = isVertical(direction) ? 1 : FRAME_ASPECT
      const e = easeTravel(p)
      const smear = travel * (e - easeTravel(Math.max(0, p - SHUTTER / Math.max(duration, 0.05))))
      const blur = { smearX: dx * smear, smearY: dy * smear }
      return layers(
        { x: dx * travel * e, y: dy * travel * e, ...blur },
        { x: -dx * travel * (1 - e), y: -dy * travel * (1 - e), ...blur },
      )
    },
  },
  sweep: {
    id: 'sweep',
    label: 'Barrido de luz',
    description: 'Una línea de luz cruza la pantalla y deja el nuevo logo a su paso.',
    duration: 1.2,
    directions: ALL_DIRECTIONS,
    defaultDirection: 'right',
    evaluate: (p, { direction }) => {
      const e = sweepEase(p)
      const glow = 0.9 * smoothstep(0, 0.15, p) * smoothstep(1, 0.85, p)
      return layers(
        { reveal: { kind: 'sweep', direction, progress: e, keep: 'ahead', glow } },
        { reveal: { kind: 'sweep', direction, progress: e, keep: 'behind', glow } },
      )
    },
  },
}

export const TRANSITION_IDS = Object.keys(TRANSITIONS) as TransitionId[]

/**
 * The pair at progress `p` (0 → 1). At p = 0 the outgoing logo is exactly at rest, at
 * p = 1 the incoming one is. Not defined for 'sequential'.
 */
export function evaluateTransition(id: TransitionId, p: number, params: TransitionParams): TransitionFrame {
  const evaluate = TRANSITIONS[id].evaluate
  if (!evaluate) throw new Error(`Transition ${id} has no blend`)
  const frame = evaluate(clamp01(p), params)
  if (p <= 0) return { ...frame, from: REST_STATE }
  if (p >= 1) return { ...frame, to: REST_STATE }
  return frame
}

/** Shape of the liquid morph at progress `p`. */
export interface LiquidState {
  /** 0 = only the outgoing logo, 1 = only the incoming one. */
  mix: number
  /** Blur radius shared by both logos, in frame heights. */
  blur: number
  /** 0 = plain blend, 1 = fully "gooey" (thresholded) edges. */
  goo: number
}

export function liquidAt(p: number): LiquidState {
  if (p <= 0) return { mix: 0, blur: 0, goo: 0 }
  if (p >= 1) return { mix: 1, blur: 0, goo: 0 }
  const bell = Math.sin(Math.PI * p)
  return {
    mix: smoothstep(0.3, 0.7, p),
    blur: 0.04 * bell ** 1.2,
    goo: smoothstep(0, 0.22, p) * smoothstep(1, 0.78, p),
  }
}
