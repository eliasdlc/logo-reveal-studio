/*
 * H.264 settings chosen for playback everywhere (VLC, QuickTime, PowerPoint, browsers):
 * 8-bit 4:2:0, the right level for size AND frame rate (Mediabunny's automatic pick only
 * looks at the frame size), and the best profile the browser's encoder accepts.
 *
 * Some browsers (e.g. Chromium builds without proprietary codecs) can't encode H.264 at
 * all; they fall back to VP9 in a WebM file rather than not exporting.
 */

export interface VideoFormat {
  width: number
  height: number
  fps: number
}

export interface CodecChoice {
  /** Full WebCodecs codec string, e.g. avc1.64002A. */
  codec: string
  profile: 'High' | 'Main' | 'Baseline' | 'VP9'
  bitrate: number
  /** Constant-quality target (lower is better); the bitrate is the fallback. */
  quantizer: number
  /** MP4 for H.264, WebM for the VP9 fallback. Also the file extension. */
  container: 'mp4' | 'webm'
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

/** VP9 level (as the two digits of the codec string) for the frame size and rate. */
export function vp9LevelFor({ width, height, fps }: VideoFormat): string {
  const samplesPerSecond = width * height * fps
  if (samplesPerSecond <= 83_558_400) return '40' // 1080p30
  if (samplesPerSecond <= 160_432_128) return '41' // 1080p60
  if (samplesPerSecond <= 311_951_360) return '50' // 2160p30
  return '51' // 2160p60
}

/** H.264 profiles from best to most compatible, then the VP9 fallback. */
export function codecCandidates(format: VideoFormat): CodecChoice[] {
  const level = levelFor(format)
  const bitrate = bitrateFor(format)
  return [
    ...PROFILES.map(({ profile, prefix }) => ({
      codec: `avc1.${prefix}${level}`,
      profile,
      bitrate,
      quantizer: 18,
      container: 'mp4' as const,
    })),
    { codec: `vp09.00.${vp9LevelFor(format)}.08`, profile: 'VP9', bitrate, quantizer: 20, container: 'webm' },
  ]
}

export function hasWebCodecs(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window
}

/** First configuration this browser can encode (H.264 if at all possible), or null. */
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
