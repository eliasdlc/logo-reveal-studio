import { describe, expect, it } from 'vitest'
import { DEFAULT_STAGE_SETTINGS } from '../engine/types'
import { CLEAR, WHITE, paint, rect } from '../processing/testUtils'
import { DEFAULT_ANIMATION, DEFAULT_SEQUENCE, normalizeAnimation, patchAnimation } from './animation'
import { parseSession, toSession, typeFromName } from './persistence'
import { DEFAULT_LOGO_OPTIONS, useStudio, type LogoItem } from './store'

const bitmap = paint(20, 20, rect(4, 4, 16, 16, WHITE, CLEAR))
const logo = (id: string, patch: Partial<LogoItem> = {}): LogoItem => ({
  id,
  name: `${id}.png`,
  source: { kind: 'raster', bitmap },
  options: DEFAULT_LOGO_OPTIONS,
  processed: null,
  error: null,
  ...patch,
})

describe('session round trip', () => {
  it('saves and reads back everything that matters', () => {
    const own = patchAnimation(DEFAULT_ANIMATION, { entry: { effect: 'rise' }, idle: { kind: 'tilt', period: 2 } })
    const state = {
      ...useStudio.getState(),
      logos: [logo('a'), logo('b', { options: { ...DEFAULT_LOGO_OPTIONS, scale: 1.2, animation: own } }), logo('demo', { demo: true })],
      selectedId: 'b',
      animation: patchAnimation(DEFAULT_ANIMATION, { hold: 1.5, shine: { enabled: false } }),
      sequence: { ...DEFAULT_SEQUENCE, transition: 'particles' as const, loop: true },
      settings: { background: '#101820', shadow: false },
      resolution: 2160 as const,
      fps: 30 as const,
      padEnds: true,
      previewMode: 'sequence' as const,
      loop: false,
    }
    const session = toSession(state)
    const restored = parseSession(JSON.stringify(session))
    expect(restored).toEqual(session)
    expect(restored!.logos.map((l) => [l.id, l.demo])).toEqual([
      ['a', false],
      ['b', false],
      ['demo', true],
    ])
    expect(restored!.logos[1].options.animation).toEqual(own)
  })

  it('never saves pixels or files, only references to them', () => {
    const json = JSON.stringify(toSession({ ...useStudio.getState(), logos: [logo('a', { file: new Blob(['x']) })] }))
    expect(json).not.toContain('bitmap')
    expect(json).not.toContain('file')
  })
})

describe('parseSession', () => {
  it('ignores missing, broken or foreign data', () => {
    expect(parseSession(null)).toBeNull()
    expect(parseSession('{not json')).toBeNull()
    expect(parseSession('{"version":2,"logos":[]}')).toBeNull()
    expect(parseSession('[]')).toBeNull()
  })

  it('falls back to the defaults for anything unknown or of the wrong type', () => {
    const session = parseSession(
      JSON.stringify({
        version: 1,
        logos: [{ id: 'x', name: 'x.svg', options: { scale: 'big', animation: { entry: { effect: 'teleport' } } } }, { id: 3 }],
        animation: { hold: -4, entry: { effect: 'slide', duration: 'fast' }, idle: { kind: 'spin' } },
        sequence: { transition: 'warp', duration: 2 },
        settings: { background: 'red' },
        resolution: 720,
        fps: 24,
        previewMode: 'other',
      }),
    )!
    expect(session.logos).toHaveLength(1)
    expect(session.logos[0].options.scale).toBe(1)
    expect(session.logos[0].options.animation!.entry.effect).toBe(DEFAULT_ANIMATION.entry.effect)
    expect(session.animation.hold).toBe(DEFAULT_ANIMATION.hold)
    expect(session.animation.entry).toEqual({ ...DEFAULT_ANIMATION.entry, effect: 'slide' })
    expect(session.animation.idle).toEqual(DEFAULT_ANIMATION.idle)
    expect(session.sequence).toEqual({ ...DEFAULT_SEQUENCE, duration: 2 })
    expect(session.settings).toEqual(DEFAULT_STAGE_SETTINGS)
    expect(session).toMatchObject({ resolution: 1080, fps: 60, previewMode: 'logo', padEnds: false, loop: true })
  })
})

describe('project', () => {
  it('is kept with the session', () => {
    const project = { id: 'p1', name: 'BarCamp', savedAt: 1700000000000, dirty: true }
    const session = toSession({ ...useStudio.getState(), project, logos: [logo('a')] })
    expect(parseSession(JSON.stringify(session))!.project).toEqual(project)
  })

  it('treats work saved before projects existed as unsaved, untitled work', () => {
    const legacy = (logos: unknown[]) => parseSession(JSON.stringify({ version: 1, logos }))!.project
    expect(legacy([{ id: 'a', name: 'a.png' }])).toEqual({ id: null, name: 'Sin título', savedAt: null, dirty: true })
    // Only the sample logo: there is nothing to lose.
    expect(legacy([{ id: 'd', name: 'Logo de ejemplo', demo: true }]).dirty).toBe(false)
  })

  it('repairs a broken project entry', () => {
    const raw = { version: 1, logos: [], project: { id: 4, name: '  ', savedAt: 'ayer', dirty: 'yes' } }
    expect(parseSession(JSON.stringify(raw))!.project).toEqual({ id: null, name: 'Sin título', savedAt: null, dirty: false })
  })
})

describe('typeFromName', () => {
  it('recovers the image type from the file name', () => {
    expect(typeFromName('logo.PNG')).toBe('image/png')
    expect(typeFromName('a.b.svg')).toBe('image/svg+xml')
    expect(typeFromName('photo.jpeg')).toBe('image/jpeg')
    expect(typeFromName('sin-extension')).toBe('')
  })
})

describe('normalizeAnimation', () => {
  it('fills in sections added after the settings were saved', () => {
    const older: Record<string, unknown> = { ...DEFAULT_ANIMATION }
    delete older.idle
    expect(normalizeAnimation(older)).toEqual(DEFAULT_ANIMATION)
  })

  it('keeps valid values, including a natural (null) duration', () => {
    const custom = patchAnimation(DEFAULT_ANIMATION, { exit: { enabled: false, duration: 1.3 }, drift: { kind: 'none' } })
    expect(normalizeAnimation(JSON.parse(JSON.stringify(custom)))).toEqual(custom)
  })
})
