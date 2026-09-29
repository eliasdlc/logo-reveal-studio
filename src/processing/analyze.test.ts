import { describe, expect, it } from 'vitest'
import { analyzeLogo } from './analyze'
import { CLEAR, WHITE, paint, rect } from './testUtils'

const BLUE = [0, 0, 255, 255] as const

describe('analyzeLogo', () => {
  it('recognises a transparent PNG', () => {
    expect(analyzeLogo(paint(20, 20, rect(5, 5, 15, 15, [...BLUE], CLEAR)))).toEqual({
      hasTransparency: true,
      lightBorder: false,
    })
  })

  it('recognises a JPG-style logo on white', () => {
    expect(analyzeLogo(paint(20, 20, rect(5, 5, 15, 15, [...BLUE], WHITE)))).toEqual({
      hasTransparency: false,
      lightBorder: true,
    })
  })

  it('recognises an opaque logo on a dark background', () => {
    const img = paint(20, 20, rect(5, 5, 15, 15, WHITE, [20, 20, 20, 255]))
    expect(analyzeLogo(img)).toEqual({ hasTransparency: false, lightBorder: false })
  })

  it('ignores a handful of soft pixels in an otherwise opaque image', () => {
    const img = paint(100, 100, (x, y) => (x === 0 && y === 0 ? [255, 255, 255, 0] : WHITE))
    expect(analyzeLogo(img).hasTransparency).toBe(false)
  })
})
