import { describe, expect, it } from 'vitest'
import { hexToRgb } from './color'

describe('hexToRgb', () => {
  it('parses without any color-space conversion', () => {
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1])
    expect(hexToRgb('#F26B1D')).toEqual([0xf2 / 255, 0x6b / 255, 0x1d / 255])
    expect(hexToRgb('#0f0')).toEqual([0, 1, 0])
  })

  it('rejects garbage', () => {
    expect(() => hexToRgb('white')).toThrow()
  })
})
