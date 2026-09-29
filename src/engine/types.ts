/**
 * Decoded logo pixels: straight (non-premultiplied) RGBA, sRGB-encoded, top row first.
 * This is exactly what ends up on the GPU, so what you see here is what the video shows.
 */
export interface LogoBitmap {
  width: number
  height: number
  data: Uint8ClampedArray
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
