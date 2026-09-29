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

// ─── Programs: clips played back to back ────────────────────────────────────

/** One logo's clip inside a program. */
export interface ProgramItem<Logo = unknown> {
  logo: Logo
  /** Manual per-logo scale. */
  scale: number
  clip: ClipSpec
}

/**
 * What a video shows: its items one after another, no overlap. An individual video is a
 * one-item program; the combined sequence has one item per logo, each exiting before the
 * next one enters.
 */
export interface Program<Logo = unknown> {
  items: ProgramItem<Logo>[]
}

export const programLength = (program: Program): number =>
  program.items.reduce((sum, item) => sum + clipLength(item.clip), 0)

export interface ProgramFrame<Logo> {
  index: number
  item: ProgramItem<Logo>
  /** Time inside the item's clip. */
  local: number
  state: EffectState | null
}

/** Which item is on screen at program time `t`, and its pose. Null for an empty program. */
export function programAt<Logo>(program: Program<Logo>, t: number): ProgramFrame<Logo> | null {
  const { items } = program
  if (items.length === 0) return null
  let start = 0
  for (let index = 0; index < items.length; index++) {
    const length = clipLength(items[index].clip)
    // Boundaries belong to the next item; the very end belongs to the last one.
    if (t < start + length || index === items.length - 1) {
      const local = t - start
      return { index, item: items[index], local, state: clipStateAt(items[index].clip, local) }
    }
    start += length
  }
  return null
}

/** Start time of each item. */
export function programStarts(program: Program): number[] {
  const starts: number[] = []
  let start = 0
  for (const item of program.items) {
    starts.push(start)
    start += clipLength(item.clip)
  }
  return starts
}
