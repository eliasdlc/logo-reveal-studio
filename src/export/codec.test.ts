import { describe, expect, it } from 'vitest'
import { codecCandidates, levelFor, vp9LevelFor } from './codec'

describe('levelFor', () => {
  it('accounts for frame rate, not just size', () => {
    expect(levelFor({ width: 1920, height: 1080, fps: 30 })).toBe('28')
    expect(levelFor({ width: 1920, height: 1080, fps: 60 })).toBe('2A')
    expect(levelFor({ width: 3840, height: 2160, fps: 30 })).toBe('33')
    expect(levelFor({ width: 3840, height: 2160, fps: 60 })).toBe('34')
  })
})

describe('codecCandidates', () => {
  it('prefers H.264 High, then Main, then Baseline, and falls back to VP9 in WebM', () => {
    const candidates = codecCandidates({ width: 1920, height: 1080, fps: 60 })
    expect(candidates.map((c) => c.codec)).toEqual(['avc1.64002A', 'avc1.4D402A', 'avc1.42E02A', 'vp09.00.41.08'])
    expect(candidates.map((c) => c.container)).toEqual(['mp4', 'mp4', 'mp4', 'webm'])
  })

  it('stays within the level bitrate limits', () => {
    // Level 4.0 allows 20 Mbps (High: 25), 4.2 50 Mbps, 5.x 240 Mbps.
    expect(codecCandidates({ width: 1920, height: 1080, fps: 30 })[0].bitrate).toBeLessThanOrEqual(20e6)
    expect(codecCandidates({ width: 1920, height: 1080, fps: 60 })[0].bitrate).toBeLessThanOrEqual(50e6)
    expect(codecCandidates({ width: 3840, height: 2160, fps: 60 })[0].bitrate).toBeLessThanOrEqual(240e6)
  })
})

describe('vp9LevelFor', () => {
  it('accounts for frame rate, not just size', () => {
    expect(vp9LevelFor({ width: 1920, height: 1080, fps: 30 })).toBe('40')
    expect(vp9LevelFor({ width: 1920, height: 1080, fps: 60 })).toBe('41')
    expect(vp9LevelFor({ width: 3840, height: 2160, fps: 30 })).toBe('50')
    expect(vp9LevelFor({ width: 3840, height: 2160, fps: 60 })).toBe('51')
  })
})
