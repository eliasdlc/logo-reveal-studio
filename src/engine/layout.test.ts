import { describe, expect, it } from 'vitest'
import { MAX_LOGO_HEIGHT, MAX_LOGO_WIDTH, TARGET_SQUARE_SIDE, normalizedLogoSize } from './layout'

const FRAME = 16 / 9
const area = ({ width, height }: { width: number; height: number }) => width * height

describe('normalizedLogoSize', () => {
  it('gives square and moderately wide logos the same area', () => {
    const square = normalizedLogoSize(1, FRAME)
    expect(square.width).toBeCloseTo(TARGET_SQUARE_SIDE)
    expect(area(normalizedLogoSize(2, FRAME))).toBeCloseTo(area(square))
    expect(area(normalizedLogoSize(4, FRAME))).toBeCloseTo(area(square))
  })

  it('keeps the aspect ratio', () => {
    for (const aspect of [0.3, 1, 3, 12]) {
      const { width, height } = normalizedLogoSize(aspect, FRAME)
      expect(width / height).toBeCloseTo(aspect)
    }
  })

  it('caps very wide logos at 55% of the frame width', () => {
    expect(normalizedLogoSize(12, FRAME).width).toBeCloseTo(MAX_LOGO_WIDTH * FRAME)
  })

  it('caps tall logos at 45% of the frame height', () => {
    expect(normalizedLogoSize(0.4, FRAME).height).toBeCloseTo(MAX_LOGO_HEIGHT)
  })
})
