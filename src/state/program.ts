import type { Program, ProgramItem } from '../engine/timeline'
import type { StageLogo } from '../engine/types'
import { CLIP_DURATION, clipSpecOf, selectedLogo, type LogoItem, type useStudio } from './store'

/** The parts of the store that decide what the preview plays. */
export type PreviewSource = Pick<ReturnType<typeof useStudio.getState>, 'logos' | 'selectedId' | 'padEnds' | 'previewMode'>

/** One logo's individual video (with the optional empty padding). */
export function individualItem(logo: LogoItem, padEnds: boolean): ProgramItem<StageLogo> | null {
  if (!logo.processed) return null
  return { logo: logo.processed.stage, scale: logo.options.scale, clip: clipSpecOf(logo.options, padEnds) }
}

/** Every logo in list order; each exits before the next one enters. */
export function sequenceProgram(logos: LogoItem[]): Program<StageLogo> {
  const items: ProgramItem<StageLogo>[] = []
  for (const logo of logos) {
    if (!logo.processed) continue
    items.push({
      logo: logo.processed.stage,
      scale: logo.options.scale,
      clip: {
        effect: logo.options.effect,
        entryDuration: logo.options.entryDuration ?? undefined,
        duration: CLIP_DURATION,
        lead: 0,
        tail: 0,
        exit: true,
      },
    })
  }
  return { items }
}

/** What the preview plays right now: exactly what the matching export button produces. */
export function previewProgram(s: PreviewSource): Program<StageLogo> {
  if (s.previewMode === 'sequence') return sequenceProgram(s.logos)
  const logo = selectedLogo(s)
  const item = logo && individualItem(logo, s.padEnds)
  return { items: item ? [item] : [] }
}

/** Names matching previewProgram's items, for labelling the scrubber. */
export function previewNames(s: PreviewSource): string[] {
  if (s.previewMode === 'sequence') return s.logos.filter((l) => l.processed).map((l) => l.name)
  const logo = selectedLogo(s)
  return logo?.processed ? [logo.name] : []
}
