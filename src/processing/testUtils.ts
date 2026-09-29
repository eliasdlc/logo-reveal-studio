import type { LogoBitmap } from '../engine/types'

export type RGBA = [number, number, number, number]

export const CLEAR: RGBA = [0, 0, 0, 0]
export const WHITE: RGBA = [255, 255, 255, 255]

/** Builds a bitmap from a painter called for every pixel. */
export function paint(width: number, height: number, color: (x: number, y: number) => RGBA): LogoBitmap {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(color(x, y), (y * width + x) * 4)
  }
  return { width, height, data }
}

export function pixel(b: LogoBitmap, x: number, y: number): RGBA {
  const i = (y * b.width + x) * 4
  return [b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]]
}

/** Pixels inside [x0, x1) × [y0, y1) get `inside`, the rest `outside`. */
export const rect =
  (x0: number, y0: number, x1: number, y1: number, inside: RGBA, outside: RGBA) =>
  (x: number, y: number): RGBA =>
    x >= x0 && x < x1 && y >= y0 && y < y1 ? inside : outside
