/*
 * H.264 settings chosen for playback everywhere (VLC, QuickTime, PowerPoint, browsers):
 * 8-bit 4:2:0, the right level for size AND frame rate (Mediabunny's automatic pick only
 * looks at the frame size), and the best profile the browser's encoder accepts.
 */

export interface VideoFormat {
  width: number
  height: number
  fps: number
}

export interface CodecChoice {
  /** Full WebCodecs codec string, e.g. avc1.64002A. */
  codec: string
  profile: 'High' | 'Main' | 'Baseline'
  bitrate: number
}

/** Bits per second. Flat backgrounds compress well; this leaves ample room for fine text. */
export function bitrateFor({ height, fps }: VideoFormat): number {
  const base = height > 1080 ? 40_000_000 : 12_000_000
  return fps > 30 ? base * 1.5 : base
}

/** H.264 level (as the hex byte of the codec string) for the frame size and rate. */
export function levelFor({ width, height, fps }: VideoFormat): string {
  const macroblocksPerSecond = Math.ceil(width / 16) * Math.ceil(height / 16) * fps
  if (macroblocksPerSecond <= 245_760) return '28' // 4.0 — 1080p30
  if (macroblocksPerSecond <= 522_240) return '2A' // 4.2 — 1080p60
  if (macroblocksPerSecond <= 983_040) return '33' // 5.1 — 2160p30
  return '34' // 5.2 — 2160p60
}

const PROFILES = [
  { profile: 'High', prefix: '6400' },
  { profile: 'Main', prefix: '4D40' },
  { profile: 'Baseline', prefix: '42E0' },
] as const

export function codecCandidates(format: VideoFormat): CodecChoice[] {
  const level = levelFor(format)
  const bitrate = bitrateFor(format)
  return PROFILES.map(({ profile, prefix }) => ({ codec: `avc1.${prefix}${level}`, profile, bitrate }))
}

export function hasWebCodecs(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window
}

/** First H.264 configuration this browser can encode, or null. */
export async function chooseCodec(format: VideoFormat): Promise<CodecChoice | null> {
  if (!hasWebCodecs()) return null
  for (const choice of codecCandidates(format)) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec: choice.codec,
        width: format.width,
        height: format.height,
        framerate: format.fps,
        bitrate: choice.bitrate,
      })
      if (supported) return choice
    } catch {
      // Malformed or unknown config on this browser: try the next one.
    }
  }
  return null
}
