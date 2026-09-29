import {
  EMPTY_PROGRAM,
  clipProgram,
  sequenceProgram,
  type Program,
  type ProgramItem,
  type SegmentKind,
} from '../engine/timeline'
import type { StageLogo } from '../engine/types'
import { resolveAnimation, resolveTransition, type AnimationSettings, type SequenceSettings } from './animation'
import { PAD_SECONDS, animationOf, selectedLogo, type LogoItem, type useStudio } from './store'

type State = ReturnType<typeof useStudio.getState>

/** The parts of the store that decide what the preview plays. */
export type PreviewSource = Pick<State, 'logos' | 'selectedId' | 'padEnds' | 'previewMode' | 'animation' | 'sequence'>

function programItem(logo: LogoItem, general: AnimationSettings): ProgramItem<StageLogo> | null {
  if (!logo.processed) return null
  return {
    logo: logo.processed.stage,
    scale: logo.options.scale,
    animation: resolveAnimation(animationOf(logo, general)),
  }
}

/** One logo's individual video (with the optional empty padding). */
export function individualProgram(logo: LogoItem, general: AnimationSettings, padEnds: boolean): Program<StageLogo> {
  const item = programItem(logo, general)
  if (!item) return EMPTY_PROGRAM
  const pad = padEnds ? PAD_SECONDS : 0
  return clipProgram(item, { lead: pad, tail: pad })
}

/** The logos that take part in the sequence: every processed one, in list order. */
export const sequenceLogos = (logos: LogoItem[]): LogoItem[] => logos.filter((logo) => logo.processed)

/** Every logo in list order, handing over to the next one with the sequence's transition. */
export function fullSequenceProgram(
  logos: LogoItem[],
  general: AnimationSettings,
  sequence: SequenceSettings,
): Program<StageLogo> {
  const items = sequenceLogos(logos).flatMap((logo) => programItem(logo, general) ?? [])
  return sequenceProgram(items, resolveTransition(sequence), { loop: sequence.loop })
}

/** What the preview plays right now: exactly what the matching export button produces. */
export function previewProgram(s: PreviewSource): Program<StageLogo> {
  if (s.previewMode === 'sequence') return fullSequenceProgram(s.logos, s.animation, s.sequence)
  const logo = selectedLogo(s)
  return logo ? individualProgram(logo, s.animation, s.padEnds) : EMPTY_PROGRAM
}

/** The logos matching previewProgram's items, in the same order. */
export function previewLogos(s: PreviewSource): LogoItem[] {
  if (s.previewMode === 'sequence') return sequenceLogos(s.logos)
  const logo = selectedLogo(s)
  return logo?.processed ? [logo] : []
}

/**
 * A good moment to start playing to show off one part of the selected logo's animation:
 * slightly before the first segment of that kind that involves it.
 */
export function previewTimeFor(s: PreviewSource, kind: SegmentKind): number | null {
  const program = previewProgram(s)
  const logos = previewLogos(s)
  const involves = (item: number) => logos[item]?.id === s.selectedId
  const segment =
    program.segments.find(
      (seg) =>
        seg.kind === kind &&
        (seg.kind === 'transition' ? involves(seg.from.item) || involves(seg.to.item) : 'occurrence' in seg && involves(seg.occurrence.item)),
    ) ?? program.segments.find((seg) => seg.kind === kind)
  if (!segment) return null
  const lead = kind === 'entry' ? 0.25 : 0.6
  return Math.max(0, segment.start - lead)
}
