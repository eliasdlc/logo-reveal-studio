/**
 * Decoded logo pixels: straight (non-premultiplied) RGBA, sRGB-encoded, top row first.
 * This is exactly what ends up on the GPU, so what you see here is what the video shows.
 */
export interface LogoBitmap {
  width: number
  height: number
  data: Uint8ClampedArray<ArrayBuffer>
}

/** A processed logo ready for the stage: trimmed content plus a transparent margin. */
export interface StageLogo {
  bitmap: LogoBitmap
  /** Transparent margin (px) on every side of the content. Keeps the quad's edges invisible. */
  padding: number
}

export interface StageSettings {
  /** Frame background as #RRGGBB. */
  background: string
  shadow: boolean
}

export const DEFAULT_STAGE_SETTINGS: StageSettings = {
  background: '#ffffff',
  shadow: true,
}
