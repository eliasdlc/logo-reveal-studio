import { create } from 'zustand'
import { DEFAULT_STAGE_SETTINGS, type StageSettings } from '../engine/types'
import type { LogoSource } from '../processing/decode'
import type { ProcessedLogo } from '../processing/pipeline'
import { DEFAULT_WHITE_THRESHOLD } from '../processing/removeWhite'
import {
  DEFAULT_ANIMATION,
  DEFAULT_SEQUENCE,
  patchAnimation,
  type AnimationPatch,
  type AnimationSettings,
  type SequenceSettings,
} from './animation'

/** Empty background before and after an individual video, when enabled. */
export const PAD_SECONDS = 1

export type Resolution = 1080 | 2160
export type Fps = 30 | 60

export interface LogoOptions {
  removeWhite: boolean
  whiteThreshold: number
  removeEnclosedWhite: boolean
  /** Manual size multiplier on top of the automatic normalization. */
  scale: number
  /** This logo's own animation; null = it follows the general one. */
  animation: AnimationSettings | null
}

export const DEFAULT_LOGO_OPTIONS: LogoOptions = {
  removeWhite: false,
  whiteThreshold: DEFAULT_WHITE_THRESHOLD,
  removeEnclosedWhite: false,
  scale: 1,
  animation: null,
}

export interface LogoItem {
  id: string
  name: string
  source: LogoSource
  options: LogoOptions
  processed: ProcessedLogo | null
  error: string | null
  /** The file as uploaded, kept so the session can be restored after a reload. */
  file?: Blob | null
  /** The built-in sample logo; replaced as soon as real logos are added. */
  demo?: boolean
}

/** A logo being added: its decoded source and, for uploads, the original file. */
export interface NewLogo {
  name: string
  source: LogoSource
  file?: Blob
}

export type PreviewMode = 'logo' | 'sequence'

interface StudioState {
  logos: LogoItem[]
  selectedId: string | null
  /** The animation every logo follows unless it has its own. */
  animation: AnimationSettings
  sequence: SequenceSettings
  settings: StageSettings
  resolution: Resolution
  fps: Fps
  padEnds: boolean
  previewMode: PreviewMode
  playing: boolean
  loop: boolean
  time: number

  addLogos: (entries: NewLogo[], options?: { demo?: boolean }) => void
  removeLogo: (id: string) => void
  moveLogo: (fromId: string, toId: string) => void
  selectLogo: (id: string) => void
  updateLogoOptions: (id: string, patch: Partial<Omit<LogoOptions, 'animation'>>) => void
  /** Edits the general animation (id = null) or a logo's own one. */
  updateAnimation: (id: string | null, patch: AnimationPatch) => void
  /** Gives the logo its own animation, starting from the general one. */
  customizeAnimation: (id: string) => void
  /** The logo goes back to following the general animation. */
  resetAnimation: (id: string) => void
  /** Makes the logo's own animation the general one, for every logo. */
  applyAnimationToAll: (id: string) => void
  updateSequence: (patch: Partial<SequenceSettings>) => void
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

let idCounter = 0
/**
 * Unique id. crypto.randomUUID only exists in secure contexts (https or localhost), so
 * opening the dev server from another device by IP would otherwise break uploads.
 */
const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `logo-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

const updateLogo = (logos: LogoItem[], id: string, update: (logo: LogoItem) => LogoItem) =>
  logos.map((logo) => (logo.id === id ? update(logo) : logo))

const withAnimation = (logo: LogoItem, animation: AnimationSettings | null): LogoItem => ({
  ...logo,
  options: { ...logo.options, animation },
})

export const useStudio = create<StudioState>()((set) => ({
  logos: [],
  selectedId: null,
  animation: DEFAULT_ANIMATION,
  sequence: DEFAULT_SEQUENCE,
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
      const added: LogoItem[] = entries.map(({ name, source, file }) => ({
        id: newId(),
        name,
        source,
        file: file ?? null,
        options: DEFAULT_LOGO_OPTIONS,
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
  selectLogo: (selectedId) =>
    set((s) => (s.selectedId === selectedId ? {} : { selectedId, time: s.previewMode === 'logo' ? 0 : s.time })),
  updateLogoOptions: (id, patch) =>
    set((s) => ({ logos: updateLogo(s.logos, id, (logo) => ({ ...logo, options: { ...logo.options, ...patch } })) })),
  updateAnimation: (id, patch) =>
    set((s) => {
      if (id === null) return { animation: patchAnimation(s.animation, patch) }
      return {
        logos: updateLogo(s.logos, id, (logo) =>
          withAnimation(logo, patchAnimation(logo.options.animation ?? s.animation, patch)),
        ),
      }
    }),
  customizeAnimation: (id) =>
    set((s) => ({ logos: updateLogo(s.logos, id, (logo) => withAnimation(logo, logo.options.animation ?? s.animation)) })),
  resetAnimation: (id) => set((s) => ({ logos: updateLogo(s.logos, id, (logo) => withAnimation(logo, null)) })),
  applyAnimationToAll: (id) =>
    set((s) => {
      const own = s.logos.find((logo) => logo.id === id)?.options.animation
      if (!own) return {}
      return { animation: own, logos: s.logos.map((logo) => withAnimation(logo, null)) }
    }),
  updateSequence: (patch) => set((s) => ({ sequence: { ...s.sequence, ...patch } })),
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

/** The animation a logo plays: its own, or the general one. */
export const animationOf = (logo: LogoItem, general: AnimationSettings): AnimationSettings =>
  logo.options.animation ?? general
