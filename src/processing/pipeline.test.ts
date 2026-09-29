import { describe, expect, it } from 'vitest'
import { PADDING, processLogo, type ProcessOptions } from './pipeline'
import { CLEAR, WHITE, paint, pixel, rect, type RGBA } from './testUtils'

const GREEN: RGBA = [0, 160, 60, 255]
const options: ProcessOptions = {
  removeWhite: false,
  whiteThreshold: 12,
  removeEnclosedWhite: false,
  scale: 1,
  outputHeight: 1080,
}

describe('processLogo (raster)', () => {
  it('trims to the content and adds a transparent margin', () => {
    const source = { kind: 'raster' as const, bitmap: paint(40, 30, rect(10, 5, 30, 15, GREEN, CLEAR)) }
    const { stage, analysis } = processLogo(source, options)
    expect(analysis.hasTransparency).toBe(true)
    expect(stage.padding).toBe(PADDING)
    expect(stage.bitmap.width).toBe(20 + 2 * PADDING)
    expect(stage.bitmap.height).toBe(10 + 2 * PADDING)
    expect(pixel(stage.bitmap, PADDING, PADDING)).toEqual(GREEN)
    // Margin is transparent but carries the logo color (bleeding), not black.
    expect(pixel(stage.bitmap, 0, 0)).toEqual([0, 160, 60, 0])
  })

  it('does not modify the original source', () => {
    const bitmap = paint(10, 10, rect(2, 2, 8, 8, GREEN, WHITE))
    const before = new Uint8ClampedArray(bitmap.data)
    processLogo({ kind: 'raster', bitmap }, { ...options, removeWhite: true })
    expect(bitmap.data).toEqual(before)
  })

  it('removes a white background when asked', () => {
    const source = { kind: 'raster' as const, bitmap: paint(20, 20, rect(5, 5, 15, 15, GREEN, WHITE)) }
    const { stage } = processLogo(source, { ...options, removeWhite: true })
    expect(stage.bitmap.width).toBe(10 + 2 * PADDING)
    expect(pixel(stage.bitmap, PADDING + 5, PADDING + 5)).toEqual(GREEN)
  })

  it('trims an opaque logo on white by its non-white content', () => {
    const source = { kind: 'raster' as const, bitmap: paint(20, 20, rect(5, 6, 15, 12, GREEN, WHITE)) }
    const { stage, analysis } = processLogo(source, options)
    expect(analysis.hasTransparency).toBe(false)
    expect(stage.bitmap.width - 2 * PADDING).toBe(10)
    expect(stage.bitmap.height - 2 * PADDING).toBe(6)
  })

  it('reports low resolution for small bitmaps', () => {
    const source = { kind: 'raster' as const, bitmap: paint(60, 60, rect(10, 10, 50, 50, GREEN, CLEAR)) }
    // A square logo is ~389 px tall at 1080p, the bitmap only 40.
    expect(processLogo(source, options).baseDensity).toBeLessThan(1)
  })

  it('fails clearly on empty images', () => {
    const source = { kind: 'raster' as const, bitmap: paint(5, 5, () => CLEAR) }
    expect(() => processLogo(source, options)).toThrow(/vacía/)
  })
})
