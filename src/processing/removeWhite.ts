import type { LogoBitmap } from '../engine/types'
import { whiteDistance } from './pixels'

export const DEFAULT_WHITE_THRESHOLD = 12
/** Width (in white-distance units) of the soft ramp between removed and kept pixels. */
const FEATHER = 24

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Makes the white background transparent, in place. By default only whites connected to
 * the image border are removed (flood fill), so white shapes and text inside the logo
 * survive; with `contiguous = false` every white area goes, including the inside of
 * letters like "o" or "a".
 *
 * Pixels whose white distance is ≤ `threshold` disappear; up to `threshold + FEATHER` they
 * fade out smoothly and their color is "un-mixed" from the white they were blended with,
 * so edges don't keep a light halo over a colored background.
 */
export function removeWhiteBackground(
  bitmap: LogoBitmap,
  threshold = DEFAULT_WHITE_THRESHOLD,
  contiguous = true,
): void {
  const { width: w, height: h, data } = bitmap
  const limit = threshold + FEATHER
  const n = w * h
  const seen = new Uint8Array(n)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0

  const isBackground = (p: number) => {
    const i = p * 4
    return data[i + 3] === 0 || whiteDistance(data[i], data[i + 1], data[i + 2]) < limit
  }
  const push = (p: number) => {
    if (seen[p] || !isBackground(p)) return
    seen[p] = 1
    queue[tail++] = p
  }

  if (contiguous) {
    for (let x = 0; x < w; x++) {
      push(x)
      push((h - 1) * w + x)
    }
    for (let y = 0; y < h; y++) {
      push(y * w)
      push(y * w + w - 1)
    }
  } else {
    for (let p = 0; p < n; p++) push(p)
  }

  while (head < tail) {
    const p = queue[head++]
    const x = p % w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < n - w) push(p + w)

    const i = p * 4
    const keep = smoothstep(threshold, limit, whiteDistance(data[i], data[i + 1], data[i + 2]))
    if (keep <= 0) {
      data[i + 3] = 0
      continue
    }
    // observed = keep * color + (1 - keep) * white  →  solve for color.
    for (let c = 0; c < 3; c++) data[i + c] = (data[i + c] - 255 * (1 - keep)) / keep
    data[i + 3] = data[i + 3] * keep
  }
}
