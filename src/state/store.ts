import { create } from 'zustand'
import type { EffectId } from '../engine/effects'
import { DEFAULT_STAGE_SETTINGS, type StageSettings } from '../engine/types'
import type { LogoSource } from '../processing/decode'
import type { ProcessedLogo } from '../processing/pipeline'
import { DEFAULT_WHITE_THRESHOLD } from '../processing/removeWhite'

/** Total length of one logo clip. The hold is whatever remains after the entry effect. */
export const CLIP_DURATION = 6

export type Resolution = 1080 | 2160

export interface LogoOptions {
  removeWhite: boolean
  whiteThreshold: number
  removeEnclosedWhite: boolean
  /** Manual size multiplier on top of the automatic normalization. */
  scale: number
}

export const DEFAULT_LOGO_OPTIONS: LogoOptions = {
  removeWhite: false,
  whiteThreshold: DEFAULT_WHITE_THRESHOLD,
  removeEnclosedWhite: false,
  scale: 1,
}

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
  effect: EffectId
  settings: StageSettings
  resolution: Resolution
  playing: boolean
  loop: boolean
  time: number

  loadLogo: (name: string, source: LogoSource) => void
  updateLogoOptions: (patch: Partial<LogoOptions>) => void
  setProcessed: (id: string, result: { processed: ProcessedLogo } | { error: string }) => void
  updateSettings: (patch: Partial<StageSettings>) => void
  setResolution: (resolution: Resolution) => void
  setPlaying: (playing: boolean) => void
  setLoop: (loop: boolean) => void
  setTime: (time: number) => void
}

export const useStudio = create<StudioState>()((set) => ({
  logo: null,
  effect: 'swing',
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
