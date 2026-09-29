import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, WebMOutputFormat } from 'mediabunny'
import type { CodecChoice, VideoFormat } from './codec'

export interface EncodeJob {
  /** The canvas `drawFrame` renders into; each frame is captured right after drawing. */
  canvas: HTMLCanvasElement | OffscreenCanvas
  format: VideoFormat
  codec: CodecChoice
  /** Video length in seconds. */
  duration: number
  /** Must draw the exact frame for video time `t` (seconds) onto `canvas`. */
  drawFrame: (t: number) => void
  signal?: AbortSignal
  onProgress?: (framesDone: number, totalFrames: number) => void
}

export const frameCountFor = (duration: number, fps: number): number => Math.round(duration * fps)

/**
 * Renders and encodes the video frame by frame (t = i / fps), never in real time: however
 * slow the machine, every frame is exactly the one the preview shows at that time.
 */
export async function encodeVideo(job: EncodeJob): Promise<Blob> {
  const { fps } = job.format
  const { container } = job.codec
  const total = frameCountFor(job.duration, fps)
  const target = new BufferTarget()
  const output = new Output({
    // moov before mdat: QuickTime, PowerPoint and web players can start without seeking.
    format: container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target,
  })
  const source = new CanvasSource(job.canvas, {
    codec: container === 'mp4' ? 'avc' : 'vp9',
    fullCodecString: job.codec.codec,
    quality: new Quality({ quantizer: job.codec.quantizer, bitrate: job.codec.bitrate }),
    keyFrameInterval: 1,
    latencyMode: 'quality',
  })
  output.addVideoTrack(source, { frameRate: fps })

  try {
    await output.start()
    for (let i = 0; i < total; i++) {
      job.signal?.throwIfAborted()
      const t = i / fps
      job.drawFrame(t)
      // Waits for the encoder when it's busy (backpressure), so memory stays flat.
      await source.add(t, 1 / fps)
      job.onProgress?.(i + 1, total)
    }
    job.signal?.throwIfAborted()
    await output.finalize()
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {})
    throw error
  }

  return new Blob([target.buffer!], { type: `video/${container}` })
}
