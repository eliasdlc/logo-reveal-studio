import { describe, expect, it } from 'vitest'
import { EFFECT_IDS, EFFECTS, evaluateEntry, pose, REST_STATE } from './effects'
import { solidity } from './finish'

describe('solidity', () => {
  it('shows the full body of a logo at rest', () => {
    expect(solidity(REST_STATE)).toBe(1)
  })

  it('follows the opacity', () => {
    expect(solidity(pose({ opacity: 0.4 }))).toBeCloseTo(0.4)
  })

  it('hides the body while the face is being revealed, blurred or smeared', () => {
    expect(solidity(pose({ reveal: { kind: 'iris', progress: 0.5, softness: 0.1, glow: 0 } }))).toBe(0)
    expect(solidity(pose({ blur: 0.1 }))).toBe(0)
    expect(solidity(pose({ smearX: 0.1 }))).toBe(0)
  })

  it.each(EFFECT_IDS)('%s: the body is fully there when the entry ends, with no jump', (id) => {
    const params = { intensity: 1, direction: EFFECTS[id].defaultDirection, duration: EFFECTS[id].duration }
    expect(solidity(evaluateEntry(id, 0.9995, params))).toBeGreaterThan(0.97)
  })
})
