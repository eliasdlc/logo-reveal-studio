import type { LogoBitmap } from '../engine/types'
import { NEAR_WHITE, whiteDistance } from './pixels'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Pixels fainter than this are invisible in practice and don't count as content. */
const MIN_ALPHA = 3

export type ContentTest = (data: Uint8ClampedArray, i: number) => boolean

export const visibleByAlpha: ContentTest = (d, i) => d[i + 3] >= MIN_ALPHA

/** For images without transparency: anything that isn't (near) white is content. */
export const visibleOnWhite: ContentTest = (d, i) =>
  d[i + 3] >= MIN_ALPHA && whiteDistance(d[i], d[i + 1], d[i + 2]) > NEAR_WHITE

/** Tight bounding box of the content, or null if the image is empty. */
export function findContentBox({ width: w, height: h, data }: LogoBitmap, isContent: ContentTest): Box | null {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    let row = (y * w) * 4
    for (let x = 0; x < w; x++, row += 4) {
      if (!isContent(data, row)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Copies `box` out of the bitmap and surrounds it with `padding` fully transparent pixels. */
export function cropAndPad(src: LogoBitmap, box: Box, padding: number): LogoBitmap {
  const width = box.width + 2 * padding
  const height = box.height + 2 * padding
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * src.width + box.x) * 4
    data.set(src.data.subarray(from, from + box.width * 4), ((y + padding) * width + padding) * 4)
  }
  return { width, height, data }
}
