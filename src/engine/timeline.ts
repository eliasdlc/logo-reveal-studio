import { driftAt, type DriftSpec } from './drift'
import {
  REST_STATE,
  compose,
  evaluateEntry,
  evaluateExit,
  type Direction,
  type EffectId,
  type EffectState,
} from './effects'
import { shineAt, type ShineSpec } from './shine'
import { TRANSITIONS, evaluateTransition, type TransitionId } from './transitions'

/** An entry or an exit. */
export interface MotionSpec {
  effect: EffectId
  /** Seconds. */
  duration: number
  intensity: number
  direction: Direction
}

/** Everything that decides how one logo moves: arrive, stay, leave. */
export interface ItemAnimation {
  entry: MotionSpec
  /** Seconds the logo stays at rest between its entry and its exit (or transition). */
  hold: number
  /** Null: no exit, the logo is still on screen when its part ends. */
  exit: MotionSpec | null
  shine: ShineSpec | null
  drift: DriftSpec | null
}

export interface TransitionSpec {
  kind: TransitionId
  /** Seconds (ignored for 'sequential'). */
  duration: number
  direction: Direction
}

/** One logo in a program. */
export interface ProgramItem<Logo = unknown> {
  logo: Logo
  /** Manual per-logo scale. */
  scale: number
  animation: ItemAnimation
}

/** One appearance of a logo on screen, in program time. */
export interface Occurrence {
  item: number
  /** Starts to be visible (its entry, or the transition bringing it in, starts). */
  appear: number
  /** Fully arrived and at rest. */
  arrive: number
  /** Starts to leave. */
  depart: number
  /** Gone (or the program ends with it on screen). */
  vanish: number
}

export type Segment =
  | { kind: 'empty'; start: number; end: number }
  | { kind: 'entry' | 'hold' | 'exit'; start: number; end: number; occurrence: Occurrence }
  | { kind: 'transition'; start: number; end: number; from: Occurrence; to: Occurrence; transition: TransitionSpec }

export type SegmentKind = Segment['kind']

/**
 * What a video shows: its logos and the stretches of time they play in. An individual
 * video is a one-logo program; the combined sequence chains every logo with transitions.
 */
export interface Program<Logo = unknown> {
  items: ProgramItem<Logo>[]
  segments: Segment[]
  length: number
}

export const EMPTY_PROGRAM: Program<never> = { items: [], segments: [], length: 0 }

export const programLength = (program: Program): number => program.length

class SegmentList {
  readonly segments: Segment[] = []
  /** Adds a segment unless it's empty. */
  push(segment: Segment): void {
    if (segment.end > segment.start) this.segments.push(segment)
  }
}

/**
 * One logo's individual video: optional empty background, entry, hold, exit, empty
 * background again.
 */
export function clipProgram<Logo>(item: ProgramItem<Logo>, pad = { lead: 0, tail: 0 }): Program<Logo> {
  const { entry, hold, exit } = item.animation
  const appear = pad.lead
  const arrive = appear + entry.duration
  const depart = arrive + hold
  const vanish = depart + (exit?.duration ?? 0)
  const occurrence: Occurrence = { item: 0, appear, arrive, depart, vanish }
  const list = new SegmentList()
  list.push({ kind: 'empty', start: 0, end: appear })
  list.push({ kind: 'entry', start: appear, end: arrive, occurrence })
  list.push({ kind: 'hold', start: arrive, end: depart, occurrence })
  if (exit) list.push({ kind: 'exit', start: depart, end: vanish, occurrence })
  list.push({ kind: 'empty', start: vanish, end: vanish + pad.tail })
  return { items: [item], segments: list.segments, length: vanish + pad.tail }
}

export interface SequenceOptions {
  /**
   * Seamless loop: the video starts with the first logo already at rest and ends with the
   * transition back into it, so it can repeat forever without a cut. Needs 2+ logos.
   */
  loop: boolean
}

/**
 * Every logo in order. The first one enters with its entry, each one hands over to the
 * next with the transition, and the last one leaves with its exit (unless looping).
 */
export function sequenceProgram<Logo>(
  items: ProgramItem<Logo>[],
  transition: TransitionSpec,
  { loop }: SequenceOptions = { loop: false },
): Program<Logo> {
  if (items.length === 0) return { items, segments: [], length: 0 }
  const seamless = loop && items.length > 1
  const sequential = TRANSITIONS[transition.kind].evaluate === null
  const list = new SegmentList()
  let t = 0

  const first: Occurrence = { item: 0, appear: 0, arrive: 0, depart: 0, vanish: 0 }
  if (!seamless) {
    t = items[0].animation.entry.duration
    first.arrive = t
    list.push({ kind: 'entry', start: 0, end: t, occurrence: first })
  }

  let current = first
  for (let i = 0; i < items.length; i++) {
    const { hold, exit } = items[i].animation
    current.depart = t + hold
    list.push({ kind: 'hold', start: t, end: current.depart, occurrence: current })
    t = current.depart

    if (i === items.length - 1 && !seamless) {
      current.vanish = t + (exit?.duration ?? 0)
      if (exit) list.push({ kind: 'exit', start: t, end: current.vanish, occurrence: current })
      t = current.vanish
      break
    }

    const nextIndex = (i + 1) % items.length
    let next: Occurrence
    if (sequential) {
      current.vanish = t + (exit?.duration ?? 0)
      if (exit) list.push({ kind: 'exit', start: t, end: current.vanish, occurrence: current })
      t = current.vanish
      const entry = items[nextIndex].animation.entry
      next = { item: nextIndex, appear: t, arrive: t + entry.duration, depart: 0, vanish: 0 }
      list.push({ kind: 'entry', start: t, end: next.arrive, occurrence: next })
    } else {
      current.vanish = t + transition.duration
      next = { item: nextIndex, appear: t, arrive: current.vanish, depart: 0, vanish: 0 }
      list.push({ kind: 'transition', start: t, end: next.arrive, from: current, to: next, transition })
    }
    t = next.arrive
    current = next
  }

  if (seamless) {
    // `current` is the first logo coming back at the very end: the same appearance as the
    // one the video opens with, one loop later.
    first.appear = current.appear - t
    current.depart = first.depart + t
    current.vanish = first.vanish + t
  }
  return { items, segments: list.segments, length: t }
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

/** One logo layer to draw. */
export interface LogoLayer {
  item: number
  state: EffectState
}

export type Draw =
  | ({ kind: 'logo' } & LogoLayer)
  /** Both logos drawn as a single liquid shape. */
  | { kind: 'liquid'; from: LogoLayer; to: LogoLayer; progress: number }
  /** Particles flying from one logo to the other (drawn over both logo layers). */
  | { kind: 'swarm'; from: LogoLayer; to: LogoLayer; progress: number }

export interface Frame {
  /** In drawing order. */
  draws: Draw[]
  /** Index of the segment playing. */
  segment: number
  /** Local progress inside that segment, 0 → 1. */
  progress: number
}

/** Index of the segment playing at `t`. Boundaries belong to the later segment. */
export function segmentIndexAt(program: Program, t: number): number {
  const { segments } = program
  for (let i = 0; i < segments.length; i++) if (t < segments[i].end) return i
  return segments.length - 1
}

/** Drift and shine of one appearance at program time `t`. */
function ambientState(program: Program, occurrence: Occurrence, t: number): EffectState {
  const { drift, shine } = program.items[occurrence.item].animation
  let state = REST_STATE
  if (drift) state = driftAt(drift, t - occurrence.appear, occurrence.vanish - occurrence.appear)
  if (shine) {
    const sweep = shineAt(shine, t - occurrence.arrive, occurrence.depart - occurrence.arrive)
    if (sweep) state = { ...state, shine: sweep }
  }
  return state
}

/** What to draw at program time `t`. Null for an empty program. */
export function programAt(program: Program, t: number): Frame | null {
  const index = segmentIndexAt(program, t)
  if (index < 0) return null
  const seg = program.segments[index]
  const p = seg.end > seg.start ? Math.min(Math.max((t - seg.start) / (seg.end - seg.start), 0), 1) : 1
  const frame = (draws: Draw[]): Frame => ({ draws, segment: index, progress: p })

  switch (seg.kind) {
    case 'empty':
      return frame([])
    case 'entry':
    case 'hold':
    case 'exit': {
      const { occurrence } = seg
      const { entry, exit } = program.items[occurrence.item].animation
      let state = ambientState(program, occurrence, t)
      if (seg.kind === 'entry') state = compose(evaluateEntry(entry.effect, p, entry), state)
      else if (seg.kind === 'exit' && exit) state = compose(evaluateExit(exit.effect, p, exit), state)
      return frame([{ kind: 'logo', item: occurrence.item, state }])
    }
    case 'transition': {
      const pair = evaluateTransition(seg.transition.kind, p, seg.transition)
      const from: LogoLayer = {
        item: seg.from.item,
        state: compose(pair.from, ambientState(program, seg.from, t)),
      }
      const to: LogoLayer = { item: seg.to.item, state: compose(pair.to, ambientState(program, seg.to, t)) }
      if (pair.mode === 'liquid') return frame([{ kind: 'liquid', from, to, progress: p }])
      const layers: Draw[] = [
        { kind: 'logo', ...from },
        { kind: 'logo', ...to },
      ]
      if (pair.mode === 'swarm') layers.push({ kind: 'swarm', from, to, progress: p })
      return frame(layers)
    }
  }
}

/** The logos a segment shows (to prepare their textures before it plays). */
export function segmentItems(segment: Segment): number[] {
  switch (segment.kind) {
    case 'empty':
      return []
    case 'transition':
      return [segment.from.item, segment.to.item]
    default:
      return [segment.occurrence.item]
  }
}
