import { describe, expect, it } from 'vitest'
import { CLEAR, WHITE, paint, pixel, rect } from './testUtils'
import { cropAndPad, findContentBox, visibleByAlpha, visibleOnWhite } from './trim'

const RED = [255, 0, 0, 255] as const

describe('findContentBox', () => {
  it('finds the tight box of visible pixels', () => {
    const img = paint(10, 8, rect(2, 3, 7, 5, [...RED], CLEAR))
    expect(findContentBox(img, visibleByAlpha)).toEqual({ x: 2, y: 3, width: 5, height: 2 })
  })

  it('ignores nearly invisible pixels', () => {
    const img = paint(10, 10, (x, y) => (x === 5 && y === 5 ? [...RED] : [0, 0, 0, 2]))
    expect(findContentBox(img, visibleByAlpha)).toEqual({ x: 5, y: 5, width: 1, height: 1 })
  })

  it('treats near-white as empty for opaque images', () => {
    const img = paint(10, 10, rect(1, 2, 4, 9, [...RED], [250, 252, 251, 255]))
    expect(findContentBox(img, visibleOnWhite)).toEqual({ x: 1, y: 2, width: 3, height: 7 })
    expect(findContentBox(paint(4, 4, () => WHITE), visibleOnWhite)).toBeNull()
  })

  it('returns null for an empty image', () => {
    expect(findContentBox(paint(3, 3, () => CLEAR), visibleByAlpha)).toBeNull()
  })
})

describe('cropAndPad', () => {
  it('copies the box and surrounds it with transparent pixels', () => {
    const img = paint(6, 6, rect(2, 2, 4, 5, [...RED], WHITE))
    const out = cropAndPad(img, { x: 2, y: 2, width: 2, height: 3 }, 2)
    expect(out.width).toBe(6)
    expect(out.height).toBe(7)
    expect(pixel(out, 0, 0)).toEqual(CLEAR)
    expect(pixel(out, 1, 3)).toEqual(CLEAR)
    expect(pixel(out, 2, 2)).toEqual([...RED])
    expect(pixel(out, 3, 4)).toEqual([...RED])
    expect(pixel(out, 4, 4)).toEqual(CLEAR)
  })
})
