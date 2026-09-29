import type { LogoBitmap } from '../engine/types'
import { NEAR_WHITE, whiteDistance } from './pixels'

export interface LogoAnalysis {
  /** The image has a real transparent background (not just a few soft pixels). */
  hasTransparency: boolean
  /** The outer edge of the image is (near) white — typical of a JPG/PNG with a baked-in background. */
  lightBorder: boolean
}

/** Share of the image that must be transparent to call it "transparent background". */
const MIN_TRANSPARENT_SHARE = 0.01

export function analyzeLogo({ width: w, height: h, data }: LogoBitmap): LogoAnalysis {
  let transparent = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) transparent++

  let border = 0
  let lightBorder = 0
  const visit = (x: number, y: number) => {
    const i = (y * w + x) * 4
    border++
    if (data[i + 3] >= 128 && whiteDistance(data[i], data[i + 1], data[i + 2]) <= NEAR_WHITE * 2) {
      lightBorder++
    }
  }
  for (let x = 0; x < w; x++) {
    visit(x, 0)
    if (h > 1) visit(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    visit(0, y)
    if (w > 1) visit(w - 1, y)
  }

  return {
    hasTransparency: transparent / (w * h) >= MIN_TRANSPARENT_SHARE,
    lightBorder: lightBorder / border >= 0.9,
  }
}
