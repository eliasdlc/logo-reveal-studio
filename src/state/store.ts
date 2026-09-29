import { create } from 'zustand'
import { EFFECTS, type EffectId } from '../engine/effects'
import type { ClipSpec } from '../engine/timeline'
import { DEFAULT_STAGE_SETTINGS, type StageSettings } from '../engine/types'
import type { LogoSource } from '../processing/decode'
import type { ProcessedLogo } from '../processing/pipeline'
import { DEFAULT_WHITE_THRESHOLD } from '../processing/removeWhite'

/** Time each logo is on screen. The hold is whatever remains after the entry effect. */
export const CLIP_DURATION = 6
/** Empty background before and after an individual video, when enabled. */
export const PAD_SECONDS = 1

export type Resolution = 1080 | 2160
export type Fps = 30 | 60

export interface LogoOptions {
  effect: EffectId
  /** Seconds the entry lasts; null = the effect's natural length. */
  entryDuration: number | null
  removeWhite: boolean
  whiteThreshold: number
  removeEnclosedWhite: boolean
  /** Manual size multiplier on top of the automatic normalization. */
  scale: number
}

export const DEFAULT_LOGO_OPTIONS: LogoOptions = {
  effect: 'swing',
  entryDuration: null,
  removeWhite: false,
  whiteThreshold: DEFAULT_WHITE_THRESHOLD,
  removeEnclosedWhite: false,
  scale: 1,
}

/** Seconds until the logo is at rest; the hold is the rest of the clip. */
export const entryDurationOf = (options: LogoOptions): number =>
  options.entryDuration ?? EFFECTS[options.effect].entryDuration

/**
 * The clip for one logo's individual video. The preview plays exactly this, so what you
 * scrub is what gets exported. With padding on, the logo also exits before the tail so
 * the video doesn't cut from the logo straight to an empty frame.
 */
export const clipSpecOf = (options: LogoOptions, padEnds: boolean): ClipSpec => ({
  effect: options.effect,
  entryDuration: options.entryDuration ?? undefined,
  duration: CLIP_DURATION,
  lead: padEnds ? PAD_SECONDS : 0,
  tail: padEnds ? PAD_SECONDS : 0,
  exit: padEnds,
})

export interface LogoItem {
  id: string
  name: string
  source: LogoSource
  options: LogoOptions
  processed: ProcessedLogo | null
  error: string | null
  /** The built-in sample logo; replaced as soon as real logos are added. */
  demo?: boolean
}

export type PreviewMode = 'logo' | 'sequence'

interface StudioState {
  logos: LogoItem[]
  selectedId: string | null
  defaultEffect: EffectId
  settings: StageSettings
  resolution: Resolution
  fps: Fps
  padEnds: boolean
  previewMode: PreviewMode
  playing: boolean
  loop: boolean
  time: number

  addLogos: (entries: { name: string; source: LogoSource }[], options?: { demo?: boolean }) => void
  removeLogo: (id: string) => void
  moveLogo: (fromId: string, toId: string) => void
  selectLogo: (id: string) => void
  updateLogoOptions: (id: string, patch: Partial<LogoOptions>) => void
  setLogoEffect: (id: string, effect: EffectId) => void
  setDefaultEffect: (effect: EffectId) => void
  applyEffectToAll: (effect: EffectId) => void
  setProcessed: (id: string, result: { processed: ProcessedLogo } | { error: string }) => void
  updateSettings: (patch: Partial<StageSettings>) => void
  setResolution: (resolution: Resolution) => void
  setFps: (fps: Fps) => void
  setPadEnds: (padEnds: boolean) => void
  setPreviewMode: (mode: PreviewMode) => void
  setPlaying: (playing: boolean) => void
  setLoop: (loop: boolean) => void
  setTime: (time: number) => void
}

const updateLogo = (logos: LogoItem[], id: string, update: (logo: LogoItem) => LogoItem) =>
  logos.map((logo) => (logo.id === id ? update(logo) : logo))

export const useStudio = create<StudioState>()((set) => ({
  logos: [],
  selectedId: null,
  defaultEffect: 'swing',
  settings: DEFAULT_STAGE_SETTINGS,
  resolution: 1080,
  fps: 60,
  padEnds: false,
  previewMode: 'logo',
  playing: true,
  loop: true,
  time: 0,

  addLogos: (entries, { demo = false } = {}) =>
    set((s) => {
      if (entries.length === 0) return {}
      const added: LogoItem[] = entries.map(({ name, source }) => ({
        id: crypto.randomUUID(),
        name,
        source,
        options: { ...DEFAULT_LOGO_OPTIONS, effect: s.defaultEffect },
        processed: null,
        error: null,
        demo,
      }))
      // Real logos replace the sample one.
      const kept = demo ? s.logos : s.logos.filter((logo) => !logo.demo)
      return { logos: [...kept, ...added], selectedId: added[0].id, time: 0 }
    }),
  removeLogo: (id) =>
    set((s) => {
      const index = s.logos.findIndex((logo) => logo.id === id)
      const logos = s.logos.filter((logo) => logo.id !== id)
      const selectedId =
        s.selectedId === id ? (logos[Math.min(index, logos.length - 1)]?.id ?? null) : s.selectedId
      return { logos, selectedId }
    }),
  moveLogo: (fromId, toId) =>
    set((s) => {
      const from = s.logos.findIndex((logo) => logo.id === fromId)
      const to = s.logos.findIndex((logo) => logo.id === toId)
      if (from < 0 || to < 0 || from === to) return {}
      const logos = [...s.logos]
      logos.splice(to, 0, ...logos.splice(from, 1))
      return { logos }
    }),
  selectLogo: (selectedId) => set((s) => (s.selectedId === selectedId ? {} : { selectedId, time: 0 })),
  updateLogoOptions: (id, patch) =>
    set((s) => ({ logos: updateLogo(s.logos, id, (logo) => ({ ...logo, options: { ...logo.options, ...patch } })) })),
  setLogoEffect: (id, effect) =>
    set((s) => ({
      logos: updateLogo(s.logos, id, (logo) => ({ ...logo, options: { ...logo.options, effect, entryDuration: null } })),
      time: 0,
    })),
  setDefaultEffect: (defaultEffect) => set({ defaultEffect }),
  applyEffectToAll: (effect) =>
    set((s) => ({
      logos: s.logos.map((logo) => ({ ...logo, options: { ...logo.options, effect, entryDuration: null } })),
      defaultEffect: effect,
      time: 0,
    })),
  setProcessed: (id, result) =>
    set((s) => ({
      logos: updateLogo(s.logos, id, (logo) =>
        'error' in result
          ? { ...logo, processed: null, error: result.error }
          : { ...logo, processed: result.processed, error: null },
      ),
    })),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setResolution: (resolution) => set({ resolution }),
  setFps: (fps) => set({ fps }),
  setPadEnds: (padEnds) => set({ padEnds, time: 0 }),
  setPreviewMode: (previewMode) => set({ previewMode, time: 0 }),
  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  setTime: (time) => set({ time }),
}))

export const selectedLogo = (s: Pick<StudioState, 'logos' | 'selectedId'>): LogoItem | null =>
  s.logos.find((logo) => logo.id === s.selectedId) ?? null
