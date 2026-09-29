import { describe, expect, it } from 'vitest'
import { codecString, encoderSettings, levelFor, peakBitrate, withLevel, withLevelInPacket } from './codec'

const HD30 = { width: 1920, height: 1080, fps: 30 }
const HD60 = { width: 1920, height: 1080, fps: 60 }
const UHD30 = { width: 3840, height: 2160, fps: 30 }
const UHD60 = { width: 3840, height: 2160, fps: 60 }

describe('levelFor', () => {
  it('covers the frame size and rate', () => {
    expect(levelFor(HD30, 5e6)).toBe(40)
    expect(levelFor(HD60, 5e6)).toBe(42)
    expect(levelFor(UHD30, 5e6)).toBe(51)
    expect(levelFor(UHD60, 5e6)).toBe(52)
    expect(levelFor({ width: 1280, height: 720, fps: 30 }, 5e6)).toBe(31)
  })

  it('goes up a level when the real bitrate needs it', () => {
    expect(levelFor(HD30, 30e6)).toBe(41)
    expect(levelFor(HD60, 100e6)).toBe(50)
  })
})

describe('peakBitrate', () => {
  it('is the busiest one-second window, in bits', () => {
    expect(peakBitrate([10, 10, 50, 10, 10], 2)).toBe(60 * 8)
    expect(peakBitrate(Array(90).fill(1000), 30)).toBe(30 * 1000 * 8)
  })

  it('scales clips shorter than a second up to a second', () => {
    expect(peakBitrate([100, 100], 30)).toBe(100 * 30 * 8)
  })
})

// avcC with one SPS (Baseline, level 4.0) and one PPS.
const SPS = [0x67, 66, 0x00, 40, 0xac, 0xd9]
const PPS = [0x68, 0xce, 0x38, 0x80]
const AVCC = new Uint8Array([1, 66, 0x00, 40, 0xff, 0xe1, 0, SPS.length, ...SPS, 1, 0, PPS.length, ...PPS])

describe('withLevel', () => {
  it('writes the level and Constrained Baseline in the record and its SPS, on a copy', () => {
    const out = withLevel(AVCC, 42)
    expect([...out.slice(1, 4)]).toEqual([66, 0xc0, 42])
    expect([...out.slice(8, 12)]).toEqual([0x67, 66, 0xc0, 42])
    expect([...out.slice(12)]).toEqual([...AVCC.slice(12)])
    expect(AVCC[3]).toBe(40)
    expect(codecString(out)).toBe('avc1.42C02A')
  })

  it('rejects anything that is not an avcC record', () => {
    expect(() => withLevel(new Uint8Array([0, 1, 2]), 42)).toThrow()
  })
})

describe('withLevelInPacket', () => {
  const nal = (bytes: number[]) => [0, 0, 0, bytes.length, ...bytes]

  it('patches in-band SPS units and leaves the rest alone', () => {
    const slice = [0x65, 0x88, 0x84, 0x00]
    const packet = new Uint8Array([...nal(SPS), ...nal(PPS), ...nal(slice)])
    const out = withLevelInPacket(packet, 4, 51)
    expect([...out.slice(4, 8)]).toEqual([0x67, 66, 0xc0, 51])
    expect([...out.slice(10)]).toEqual([...packet.slice(10)])
  })

  it('returns the same data when there is no SPS', () => {
    const packet = new Uint8Array(nal([0x41, 0x9a, 0x02]))
    expect(withLevelInPacket(packet, 4, 42)).toBe(packet)
  })
})

describe('encoderSettings', () => {
  it('keeps even the busiest second inside the usual level for the format', () => {
    const usual: [typeof HD30, number][] = [[HD30, 41], [HD60, 42], [UHD30, 51], [UHD60, 52]]
    for (const [format, level] of usual) {
      const { kbps, keyFrameInterval } = encoderSettings(format)
      // Measured: rate control overshoots ~1.7× on particle transitions.
      expect(levelFor(format, kbps * 1000 * 1.8)).toBeLessThanOrEqual(level)
      expect(keyFrameInterval).toBe(format.fps)
    }
  })
})
