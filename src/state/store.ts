import { create } from 'zustand'
import { EFFECTS, type EffectId } from '../engine/effects'
import { DEFAULT_STAGE_SETTINGS, type StageSettings } from '../engine/types'
import type { LogoSource } from '../processing/decode'
import type { ProcessedLogo } from '../processing/pipeline'
import { DEFAULT_WHITE_THRESHOLD } from '../processing/removeWhite'

/** Total length of one logo clip. The hold is whatever remains after the entry effect. */
export const CLIP_DURATION = 6

export type Resolution = 1080 | 2160

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
  playing: boolean
  loop: boolean
  time: number

  loadLogo: (name: string, source: LogoSource) => void
  updateLogoOptions: (patch: Partial<LogoOptions>) => void
  setLogoEffect: (effect: EffectId) => void
  setProcessed: (id: string, result: { processed: ProcessedLogo } | { error: string }) => void
  updateSettings: (patch: Partial<StageSettings>) => void
  setResolution: (resolution: Resolution) => void
  setPlaying: (playing: boolean) => void
  setLoop: (loop: boolean) => void
  setTime: (time: number) => void
}

export const useStudio = create<StudioState>()((set) => ({
  logo: null,
  settings: DEFAULT_STAGE_SETTINGS,
  resolution: 1080,
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
  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  setTime: (time) => set({ time }),
}))
