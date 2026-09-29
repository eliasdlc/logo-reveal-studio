import { describe, expect, it } from 'vitest'
import { removeWhiteBackground } from './removeWhite'
import { WHITE, paint, pixel, rect, type RGBA } from './testUtils'

const RED: RGBA = [200, 0, 0, 255]

describe('removeWhiteBackground', () => {
  it('makes the outer white transparent and keeps the logo untouched', () => {
    const img = paint(10, 10, rect(3, 3, 7, 7, RED, WHITE))
    removeWhiteBackground(img)
    expect(pixel(img, 0, 0)[3]).toBe(0)
    expect(pixel(img, 9, 9)[3]).toBe(0)
    expect(pixel(img, 5, 5)).toEqual(RED)
  })

  it('keeps white enclosed by the logo (e.g. the inside of an "O")', () => {
    // Red ring with a white hole in the middle, on a white background.
    const img = paint(11, 11, (x, y) => {
      const ring = x >= 2 && x <= 8 && y >= 2 && y <= 8
      const hole = x >= 4 && x <= 6 && y >= 4 && y <= 6
      return ring && !hole ? RED : WHITE
    })
    removeWhiteBackground(img)
    expect(pixel(img, 0, 0)[3]).toBe(0)
    expect(pixel(img, 5, 5)).toEqual(WHITE)
  })

  it('can also remove enclosed white', () => {
    const img = paint(11, 11, (x, y) => {
      const ring = x >= 2 && x <= 8 && y >= 2 && y <= 8
      const hole = x >= 4 && x <= 6 && y >= 4 && y <= 6
      return ring && !hole ? RED : WHITE
    })
    removeWhiteBackground(img, 12, false)
    expect(pixel(img, 5, 5)[3]).toBe(0)
    expect(pixel(img, 3, 3)).toEqual(RED)
  })

  it('fades anti-aliased edges and un-mixes the white out of them', () => {
    const pink: RGBA = [255, 230, 230, 255] // white distance 25 → inside the feather ramp
    const img = paint(5, 1, (x) => (x === 0 ? WHITE : x === 1 ? pink : RED))
    removeWhiteBackground(img, 12)
    const [r, g, b, a] = pixel(img, 1, 0)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(255)
    expect(r).toBe(255)
    expect(g).toBeLessThan(230)
    expect(b).toBe(g)
  })

  it('respects the threshold', () => {
    const offWhite: RGBA = [235, 235, 235, 255] // distance 20
    const strict = paint(3, 3, () => offWhite)
    removeWhiteBackground(strict, 0)
    expect(pixel(strict, 1, 1)[3]).toBeGreaterThan(0)

    const loose = paint(3, 3, () => offWhite)
    removeWhiteBackground(loose, 30)
    expect(pixel(loose, 1, 1)[3]).toBe(0)
  })
})
