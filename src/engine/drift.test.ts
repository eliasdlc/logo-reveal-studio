import { describe, expect, it } from 'vitest'
import { driftAt } from './drift'
import { REST_STATE } from './effects'

describe('driftAt', () => {
  it('starts at rest when the logo appears', () => {
    for (const kind of ['zoom-in', 'zoom-out'] as const) {
      expect(driftAt({ kind, amount: 1 }, 0, 6)).toEqual(REST_STATE)
    }
  })

  it('zooms in steadily over the whole time on screen', () => {
    const spec = { kind: 'zoom-in' as const, amount: 1 }
    expect(driftAt(spec, 3, 6).scale).toBeCloseTo(1.03)
    expect(driftAt(spec, 6, 6).scale).toBeCloseTo(1.06)
    expect(driftAt(spec, 9, 6).scale).toBeCloseTo(1.06)
    expect(driftAt({ ...spec, amount: 2 }, 6, 6).scale).toBeCloseTo(1.12)
  })

  it('zooms out', () => {
    expect(driftAt({ kind: 'zoom-out', amount: 1 }, 6, 6).scale).toBeCloseTo(0.95)
  })

  it('stays at rest for a zero-length appearance', () => {
    expect(driftAt({ kind: 'zoom-in', amount: 1 }, 1, 0)).toEqual(REST_STATE)
  })
})
