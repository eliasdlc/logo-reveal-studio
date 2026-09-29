import { describe, expect, it } from 'vitest'
import type { LogoBitmap } from '../engine/types'
import { bleedAlpha } from './bleed'

function bitmap(width: number, height: number, pixels: number[][]): LogoBitmap {
  return { width, height, data: new Uint8ClampedArray(pixels.flat()) }
}

const T = [0, 0, 0, 0] // transparent black, as PNG exporters write it

describe('bleedAlpha', () => {
  it('spreads visible colors into transparent pixels without touching alpha', () => {
    const img = bitmap(4, 1, [[255, 0, 0, 255], T, T, T])
    bleedAlpha(img)
    expect([...img.data]).toEqual([255, 0, 0, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0])
  })

  it('averages when two colors meet', () => {
    const img = bitmap(3, 1, [[200, 0, 0, 255], T, [0, 0, 100, 255]])
    bleedAlpha(img)
    expect([...img.data.slice(4, 8)]).toEqual([100, 0, 50, 0])
  })

  it('keeps partially transparent pixels as they are', () => {
    const img = bitmap(2, 1, [[10, 20, 30, 128], T])
    bleedAlpha(img)
    expect([...img.data]).toEqual([10, 20, 30, 128, 10, 20, 30, 0])
  })

  it('fills a 2D image completely', () => {
    const w = 5
    const pixels = Array.from({ length: w * w }, (_, i) => (i === 12 ? [0, 255, 0, 255] : T))
    const img = bitmap(w, w, pixels)
    bleedAlpha(img)
    for (let i = 0; i < w * w; i++) expect(img.data[i * 4 + 1]).toBe(255)
  })

  it('leaves fully transparent images alone', () => {
    const img = bitmap(2, 1, [T, T])
    bleedAlpha(img)
    expect([...img.data]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })
})
