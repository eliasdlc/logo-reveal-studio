import type { LogoBitmap } from '../engine/types'

/**
 * Fills the RGB of fully transparent pixels with the color of the nearest visible pixels
 * (alpha stays 0). PNG exporters usually store black there; texture filtering and mipmaps
 * would blend that black into the edges and draw a dark outline while the logo rotates.
 *
 * Grows outward one ring at a time from the visible pixels, so it's O(pixels).
 */
export function bleedAlpha(bitmap: LogoBitmap): void {
  const { width: w, height: h, data } = bitmap
  const n = w * h
  const UNKNOWN = 0
  const KNOWN = 1
  const QUEUED = 2
  const state = new Uint8Array(n)

  let visible = 0
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] > 0) {
      state[i] = KNOWN
      visible++
    }
  }
  if (visible === 0 || visible === n) return

  let frontier = new Int32Array(n)
  let next = new Int32Array(n)
  let count = 0

  const enqueueNeighbours = (p: number, into: Int32Array, len: number): number => {
    const x = p % w
    const y = (p - x) / w
    const push = (q: number) => {
      if (state[q] !== UNKNOWN) return
      state[q] = QUEUED
      into[len++] = q
    }
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (y > 0) push(p - w)
    if (y < h - 1) push(p + w)
    return len
  }

  for (let p = 0; p < n; p++) {
    if (state[p] === KNOWN) count = enqueueNeighbours(p, frontier, count)
  }

  while (count > 0) {
    // Color each pixel of the ring from its already-known 8-neighbours.
    for (let k = 0; k < count; k++) {
      const p = frontier[k]
      const x = p % w
      const y = (p - x) / w
      let r = 0
      let g = 0
      let b = 0
      let m = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue
          const q = yy * w + xx
          if (state[q] !== KNOWN) continue
          r += data[q * 4]
          g += data[q * 4 + 1]
          b += data[q * 4 + 2]
          m++
        }
      }
      data[p * 4] = r / m
      data[p * 4 + 1] = g / m
      data[p * 4 + 2] = b / m
    }

    let nextCount = 0
    for (let k = 0; k < count; k++) state[frontier[k]] = KNOWN
    for (let k = 0; k < count; k++) nextCount = enqueueNeighbours(frontier[k], next, nextCount)
    ;[frontier, next] = [next, frontier]
    count = nextCount
  }
}
