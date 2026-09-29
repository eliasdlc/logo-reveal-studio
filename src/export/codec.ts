/*
 * H.264 details that decide whether a phone will play the file. Hardware decoders (phones,
 * TVs, WhatsApp's player) are strict where desktop players are lenient: the stream must
 * declare a profile and a level that cover its real size, frame rate and bitrate.
 *
 * The encoder writes Constrained Baseline, the profile every H.264 decoder supports; the
 * level is chosen here from the finished stream and written into its headers.
 */

export interface VideoFormat {
  width: number
  height: number
  fps: number
}

/**
 * Encoder settings. Rate-controlled rather than constant quality: flat logo frames come
 * out near-lossless well under the budget, and busy moments (particles, dissolves) can't
 * spike past what the level allows.
 */
export interface EncoderSettings {
  /** Target bitrate in kbit/s. */
  kbps: number
  /** 0 = best compression … 10 = fastest. */
  speed: number
  /** Frames between keyframes. */
  keyFrameInterval: number
}

export function encoderSettings({ height, fps }: VideoFormat): EncoderSettings {
  const uhd = height > 1080
  const kbps = uhd ? (fps > 30 ? 90_000 : 60_000) : fps > 30 ? 26_000 : 24_000
  return { kbps, speed: uhd ? 8 : 6, keyFrameInterval: Math.round(fps) }
}

interface Level {
  idc: number
  /** Macroblocks per second. */
  maxRate: number
  /** Macroblocks per frame. */
  maxFrame: number
  /** Bits per second (Baseline/Main). */
  maxBitrate: number
}

// ITU-T H.264 Table A-1.
const LEVELS: Level[] = [
  { idc: 31, maxRate: 108_000, maxFrame: 3_600, maxBitrate: 14_000_000 },
  { idc: 32, maxRate: 216_000, maxFrame: 5_120, maxBitrate: 20_000_000 },
  { idc: 40, maxRate: 245_760, maxFrame: 8_192, maxBitrate: 20_000_000 },
  { idc: 41, maxRate: 245_760, maxFrame: 8_192, maxBitrate: 50_000_000 },
  { idc: 42, maxRate: 522_240, maxFrame: 8_704, maxBitrate: 50_000_000 },
  { idc: 50, maxRate: 589_824, maxFrame: 22_080, maxBitrate: 135_000_000 },
  { idc: 51, maxRate: 983_040, maxFrame: 36_864, maxBitrate: 240_000_000 },
  { idc: 52, maxRate: 2_073_600, maxFrame: 36_864, maxBitrate: 240_000_000 },
]

/** Lowest level (as level_idc, e.g. 42 = 4.2) that covers the format and peak bitrate. */
export function levelFor({ width, height, fps }: VideoFormat, peakBitrate: number): number {
  const frame = Math.ceil(width / 16) * Math.ceil(height / 16)
  const level = LEVELS.find((l) => frame <= l.maxFrame && frame * fps <= l.maxRate && peakBitrate <= l.maxBitrate)
  return (level ?? LEVELS[LEVELS.length - 1]).idc
}

/** Highest number of bits in any one-second window of the stream. */
export function peakBitrate(packetBytes: readonly number[], fps: number): number {
  const window = Math.max(1, Math.round(fps))
  let sum = 0
  let peak = 0
  for (let i = 0; i < packetBytes.length; i++) {
    sum += packetBytes[i]
    if (i >= window) sum -= packetBytes[i - window]
    peak = Math.max(peak, sum)
  }
  // A clip shorter than a second is scaled up to a full second's rate.
  if (packetBytes.length < window) peak = (peak * window) / Math.max(packetBytes.length, 1)
  return peak * 8
}

const BASELINE = 66
/** constraint_set0 + constraint_set1: Constrained Baseline, decodable by Main/High decoders too. */
const CONSTRAINED_BASELINE = 0xc0

/** Rewrites profile compatibility and level in an SPS NAL unit starting at `offset` (its header byte). */
function patchSps(bytes: Uint8Array, offset: number, level: number): void {
  if (bytes[offset + 1] === BASELINE) bytes[offset + 2] |= CONSTRAINED_BASELINE
  bytes[offset + 3] = level
}

/**
 * The avcC decoder configuration record with the given level (in the record and in its
 * SPS units). Returns a copy.
 */
export function withLevel(avcC: Uint8Array, level: number): Uint8Array {
  const out = avcC.slice()
  if (out.length < 7 || out[0] !== 1) throw new Error('Configuración H.264 no válida.')
  const count = out[5] & 0x1f
  let offset = 6
  for (let i = 0; i < count; i++) {
    const length = (out[offset] << 8) | out[offset + 1]
    patchSps(out, offset + 2, level)
    offset += 2 + length
  }
  out[2] = out[10] // profile compatibility = the first SPS constraint flags
  out[3] = level
  return out
}

/** Applies the same change to any SPS carried inside a packet (length-prefixed NAL units). */
export function withLevelInPacket(data: Uint8Array, lengthSize: number, level: number): Uint8Array {
  let out = data
  let offset = 0
  while (offset + lengthSize < data.length) {
    let length = 0
    for (let i = 0; i < lengthSize; i++) length = length * 256 + data[offset + i]
    const nal = offset + lengthSize
    if ((data[nal] & 0x1f) === 7) {
      if (out === data) out = data.slice()
      patchSps(out, nal, level)
    }
    offset = nal + length
  }
  return out
}

const hex = (byte: number) => byte.toString(16).toUpperCase().padStart(2, '0')

/** WebCodecs codec string for an avcC record, e.g. avc1.42C02A. */
export const codecString = (avcC: Uint8Array): string => `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`
