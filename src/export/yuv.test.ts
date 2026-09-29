import { describe, expect, it } from 'vitest'
import { i420Size, rgbaToI420 } from './yuv'

/** A 2×2 frame of one color, converted. */
function convert(r: number, g: number, b: number) {
  const rgba = new Uint8Array(16)
  for (let i = 0; i < 4; i++) rgba.set([r, g, b, 255], i * 4)
  const out = new Uint8Array(i420Size(2, 2))
  rgbaToI420(rgba, 2, 2, out)
  return { y: out[0], u: out[4], v: out[5] }
}

describe('rgbaToI420', () => {
  it('uses BT.709 limited range', () => {
    expect(convert(0, 0, 0)).toEqual({ y: 16, u: 128, v: 128 })
    expect(convert(255, 255, 255)).toEqual({ y: 235, u: 128, v: 128 })
    // Reference values for BT.709 8-bit limited range.
    expect(convert(255, 0, 0)).toEqual({ y: 63, u: 102, v: 240 })
    expect(convert(0, 255, 0)).toEqual({ y: 173, u: 42, v: 26 })
    expect(convert(0, 0, 255)).toEqual({ y: 32, u: 240, v: 118 })
  })

  it('lays out the planes and flips frames read bottom-up', () => {
    // 2×4 frame: top half white, bottom half black.
    const rgba = new Uint8Array(2 * 4 * 4)
    rgba.fill(255, 0, 16)
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
    const out = new Uint8Array(i420Size(2, 4))
    expect(out.length).toBe(12)
    rgbaToI420(rgba, 2, 4, out)
    expect([...out.slice(0, 8)]).toEqual([235, 235, 235, 235, 16, 16, 16, 16])
    rgbaToI420(rgba, 2, 4, out, true)
    expect([...out.slice(0, 8)]).toEqual([16, 16, 16, 16, 235, 235, 235, 235])
  })
})
