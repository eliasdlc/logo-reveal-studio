import { create } from 'zustand'
import type { EffectId } from '../engine/effects'
import { DEFAULT_STAGE_SETTINGS, type LogoBitmap, type StageSettings } from '../engine/types'

/** Total length of one logo clip. The hold is whatever remains after the entry effect. */
export const CLIP_DURATION = 6

interface StudioState {
  logo: LogoBitmap | null
  logoName: string
  effect: EffectId
  settings: StageSettings
  playing: boolean
  loop: boolean
  time: number

  setLogo: (logo: LogoBitmap, name: string) => void
  updateSettings: (patch: Partial<StageSettings>) => void
  setPlaying: (playing: boolean) => void
  setLoop: (loop: boolean) => void
  setTime: (time: number) => void
}

export const useStudio = create<StudioState>()((set) => ({
  logo: null,
  logoName: '',
  effect: 'swing',
  settings: DEFAULT_STAGE_SETTINGS,
  playing: true,
  loop: true,
  time: 0,

  setLogo: (logo, logoName) => set({ logo, logoName, time: 0 }),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  setTime: (time) => set({ time }),
}))
