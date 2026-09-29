import { describe, expect, it } from 'vitest'
import { codecCandidates, levelFor } from './codec'

describe('levelFor', () => {
  it('accounts for frame rate, not just size', () => {
    expect(levelFor({ width: 1920, height: 1080, fps: 30 })).toBe('28')
    expect(levelFor({ width: 1920, height: 1080, fps: 60 })).toBe('2A')
    expect(levelFor({ width: 3840, height: 2160, fps: 30 })).toBe('33')
    expect(levelFor({ width: 3840, height: 2160, fps: 60 })).toBe('34')
  })
})

describe('codecCandidates', () => {
  it('prefers High, then Main, then Baseline', () => {
    expect(codecCandidates({ width: 1920, height: 1080, fps: 60 }).map((c) => c.codec)).toEqual([
      'avc1.64002A',
      'avc1.4D402A',
      'avc1.42E02A',
    ])
  })

  it('stays within the level bitrate limits', () => {
    // Level 4.0 allows 20 Mbps (High: 25), 4.2 50 Mbps, 5.x 240 Mbps.
    expect(codecCandidates({ width: 1920, height: 1080, fps: 30 })[0].bitrate).toBeLessThanOrEqual(20e6)
    expect(codecCandidates({ width: 1920, height: 1080, fps: 60 })[0].bitrate).toBeLessThanOrEqual(50e6)
    expect(codecCandidates({ width: 3840, height: 2160, fps: 60 })[0].bitrate).toBeLessThanOrEqual(240e6)
  })
})
