import { describe, expect, it } from 'vitest'
import { EFFECTS } from '../engine/effects'
import type { ProcessedLogo } from '../processing/pipeline'
import { CLEAR, WHITE, paint, rect } from '../processing/testUtils'
import { DEFAULT_ANIMATION, DEFAULT_SEQUENCE, patchAnimation } from './animation'
import { fullSequenceProgram, individualProgram, previewProgram, previewTimeFor, type PreviewSource } from './program'
import { DEFAULT_LOGO_OPTIONS, PAD_SECONDS, type LogoItem } from './store'

const bitmap = paint(40, 30, rect(8, 8, 32, 22, WHITE, CLEAR))

function logo(id: string, processed = true, animation = DEFAULT_LOGO_OPTIONS.animation): LogoItem {
  return {
    id,
    name: `${id}.png`,
    source: { kind: 'raster', bitmap },
    options: { ...DEFAULT_LOGO_OPTIONS, animation },
    processed: processed
      ? ({ stage: { bitmap, padding: 8 }, analysis: {}, baseDensity: 1 } as unknown as ProcessedLogo)
      : null,
    error: null,
  }
}

const logos = [logo('a'), logo('b', false), logo('c'), logo('d')]
const source = (patch: Partial<PreviewSource> = {}): PreviewSource => ({
  logos,
  selectedId: 'c',
  padEnds: false,
  previewMode: 'logo',
  animation: DEFAULT_ANIMATION,
  sequence: DEFAULT_SEQUENCE,
  ...patch,
})

const entry = EFFECTS[DEFAULT_ANIMATION.entry.effect].duration
const exit = EFFECTS[DEFAULT_ANIMATION.exit.effect].duration

describe('individualProgram', () => {
  it('is entry + hold + exit, with the optional empty padding', () => {
    expect(individualProgram(logos[0], DEFAULT_ANIMATION, false).length).toBeCloseTo(entry + DEFAULT_ANIMATION.hold + exit)
    expect(individualProgram(logos[0], DEFAULT_ANIMATION, true).length).toBeCloseTo(
      entry + DEFAULT_ANIMATION.hold + exit + 2 * PAD_SECONDS,
    )
  })

  it('is empty until the logo is processed', () => {
    expect(individualProgram(logos[1], DEFAULT_ANIMATION, false).items).toEqual([])
  })

  it('uses the logo’s own animation when it has one', () => {
    const own = patchAnimation(DEFAULT_ANIMATION, { hold: 5, exit: { enabled: false } })
    expect(individualProgram(logo('x', true, own), DEFAULT_ANIMATION, false).length).toBeCloseTo(entry + 5)
  })
})

describe('fullSequenceProgram', () => {
  it('includes only the processed logos, in list order', () => {
    const program = fullSequenceProgram(logos, DEFAULT_ANIMATION, DEFAULT_SEQUENCE)
    expect(program.items).toHaveLength(3)
    expect(program.segments.filter((s) => s.kind === 'transition')).toHaveLength(2)
  })

  it('can loop seamlessly', () => {
    const program = fullSequenceProgram(logos, DEFAULT_ANIMATION, { ...DEFAULT_SEQUENCE, loop: true })
    expect(program.segments[0].kind).toBe('hold')
    expect(program.segments.filter((s) => s.kind === 'transition')).toHaveLength(3)
  })
})

describe('previewProgram', () => {
  it('plays the selected logo or the whole sequence', () => {
    expect(previewProgram(source()).items).toHaveLength(1)
    expect(previewProgram(source({ previewMode: 'sequence' })).items).toHaveLength(3)
    expect(previewProgram(source({ selectedId: null })).items).toHaveLength(0)
  })
})

describe('previewTimeFor', () => {
  it('starts just before the part to show', () => {
    expect(previewTimeFor(source(), 'entry')).toBe(0)
    expect(previewTimeFor(source(), 'exit')).toBeCloseTo(entry + DEFAULT_ANIMATION.hold - 0.6)
  })

  it('in the sequence, finds the part that involves the selected logo', () => {
    const s = source({ previewMode: 'sequence' })
    const program = previewProgram(s)
    // "c" is the second logo of the sequence: its first transition is the one coming in.
    const incoming = program.segments.find((seg) => seg.kind === 'transition' && seg.to.item === 1)!
    expect(previewTimeFor(s, 'transition')).toBeCloseTo(incoming.start - 0.6)
  })

  it('returns null when there is no such part', () => {
    expect(previewTimeFor(source({ animation: patchAnimation(DEFAULT_ANIMATION, { exit: { enabled: false } }) }), 'exit')).toBeNull()
  })
})
