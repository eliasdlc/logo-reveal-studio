import { describe, expect, it } from 'vitest'
import { MAX_LOGO_HEIGHT, MAX_LOGO_WIDTH, fitLogo } from './layout'

const FRAME = 16 / 9

describe('fitLogo', () => {
  it('limits wide logos by width (55% of the frame)', () => {
    const { width, height } = fitLogo(5, FRAME)
    expect(width).toBeCloseTo(MAX_LOGO_WIDTH * FRAME)
    expect(width / height).toBeCloseTo(5)
  })

  it('limits square and tall logos by height (45% of the frame)', () => {
    expect(fitLogo(1, FRAME).height).toBeCloseTo(MAX_LOGO_HEIGHT)
    expect(fitLogo(0.5, FRAME).height).toBeCloseTo(MAX_LOGO_HEIGHT)
  })
})
