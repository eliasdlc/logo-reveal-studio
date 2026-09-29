import type { LogoBitmap } from '../engine/types'

/** How far a color is from pure white: 0 = white, 255 = at least one channel is 0. */
export const whiteDistance = (r: number, g: number, b: number): number =>
  255 - Math.min(r, g, b)

export function cloneBitmap(b: LogoBitmap): LogoBitmap {
  return { width: b.width, height: b.height, data: new Uint8ClampedArray(b.data) }
}

/** Pixels at or below this white distance count as "background white". */
export const NEAR_WHITE = 12
