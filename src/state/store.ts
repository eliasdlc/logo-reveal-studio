import { create } from 'zustand'
import { EFFECTS, type EffectId } from '../engine/effects'
import { clipLength, type ClipSpec } from '../engine/timeline'
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
}

interface StudioState {
  logo: LogoItem | null
  settings: StageSettings
  resolution: Resolution
  fps: Fps
  padEnds: boolean
  playing: boolean
  loop: boolean
  time: number

  loadLogo: (name: string, source: LogoSource) => void
  updateLogoOptions: (patch: Partial<LogoOptions>) => void
  setLogoEffect: (effect: EffectId) => void
  setProcessed: (id: string, result: { processed: ProcessedLogo } | { error: string }) => void
  updateSettings: (patch: Partial<StageSettings>) => void
  setResolution: (resolution: Resolution) => void
  setFps: (fps: Fps) => void
  setPadEnds: (padEnds: boolean) => void
  setPlaying: (playing: boolean) => void
  setLoop: (loop: boolean) => void
  setTime: (time: number) => void
}

export const useStudio = create<StudioState>()((set) => ({
  logo: null,
  settings: DEFAULT_STAGE_SETTINGS,
  resolution: 1080,
  fps: 60,
  padEnds: false,
  playing: true,
  loop: true,
  time: 0,

  loadLogo: (name, source) =>
    set({
      logo: { id: crypto.randomUUID(), name, source, options: DEFAULT_LOGO_OPTIONS, processed: null, error: null },
      time: 0,
    }),
  updateLogoOptions: (patch) =>
    set((s) => (s.logo ? { logo: { ...s.logo, options: { ...s.logo.options, ...patch } } } : {})),
  setLogoEffect: (effect) =>
    set((s) =>
      s.logo ? { logo: { ...s.logo, options: { ...s.logo.options, effect, entryDuration: null } }, time: 0 } : {},
    ),
  setProcessed: (id, result) =>
    set((s) => {
      if (s.logo?.id !== id) return {}
      return 'error' in result
        ? { logo: { ...s.logo, error: result.error } }
        : { logo: { ...s.logo, processed: result.processed, error: null } }
    }),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setResolution: (resolution) => set({ resolution }),
  setFps: (fps) => set({ fps }),
  setPadEnds: (padEnds) => set({ padEnds, time: 0 }),
  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  setTime: (time) => set({ time }),
}))

/** Length of what the preview plays (and an individual export contains), in seconds. */
export const playbackLength = (s: Pick<StudioState, 'logo' | 'padEnds'>): number =>
  s.logo ? clipLength(clipSpecOf(s.logo.options, s.padEnds)) : CLIP_DURATION
