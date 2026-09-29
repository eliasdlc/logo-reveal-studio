import encoderScriptUrl from 'h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js?url'
import { encoderSettings, type VideoFormat } from './codec'
import type { WorkerRequest, WorkerResponse } from './h264.worker'
import { finishMp4 } from './mp4'

export interface EncodeJob {
  format: VideoFormat
  /** Video length in seconds. */
  duration: number
  /** Must draw the exact frame for video time `t` (seconds). */
  drawFrame: (t: number) => void
  /** Copies the frame just drawn as RGBA, bottom row first (as WebGL reads it). */
  readPixels: (target: Uint8Array) => void
  signal?: AbortSignal
  onProgress?: (framesDone: number, totalFrames: number) => void
  /** Short description of the current step, after the frames ("Verificando…"). */
  onStep?: (step: string) => void
}

export const frameCountFor = (duration: number, fps: number): number => Math.round(duration * fps)

/** Frames being encoded while the next ones render. */
const IN_FLIGHT = 3

/** The encoder worker, driven with promises. */
class EncoderWorker {
  private readonly worker = new Worker(new URL('./h264.worker.ts', import.meta.url), { type: 'module' })
  private readonly free: ArrayBuffer[] = []
  private waiting: { resolve: (buffer: ArrayBuffer) => void; reject: (error: Error) => void } | null = null
  private pending: { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void } | null = null
  private failure: Error | null = null

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === 'error') return this.fail(new Error(`El codificador de video falló: ${data.message}`))
      if (data.type === 'frame-done') {
        if (this.waiting) this.waiting.resolve(data.rgba)
        else this.free.push(data.rgba)
        this.waiting = null
        return
      }
      this.pending?.resolve(data)
      this.pending = null
    }
    this.worker.onerror = (event) => this.fail(new Error(`El codificador de video falló: ${event.message}`))
  }

  private fail(error: Error) {
    this.failure = error
    this.pending?.reject(error)
    this.waiting?.reject(error)
    this.pending = null
    this.waiting = null
  }

  private request(message: WorkerRequest): Promise<WorkerResponse> {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      this.worker.postMessage(message)
    })
  }

  async start(format: VideoFormat): Promise<void> {
    const size = format.width * format.height * 4
    for (let i = 0; i < IN_FLIGHT; i++) this.free.push(new ArrayBuffer(size))
    await this.request({ type: 'init', scriptUrl: new URL(encoderScriptUrl, location.href).href, ...format, ...encoderSettings(format) })
  }

  /** A buffer to read the next frame into; waits while all of them are being encoded. */
  async nextBuffer(): Promise<ArrayBuffer> {
    if (this.failure) throw this.failure
    const buffer = this.free.pop()
    if (buffer) return buffer
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject }
    })
  }

  encode(rgba: ArrayBuffer): void {
    this.worker.postMessage({ type: 'frame', rgba } satisfies WorkerRequest, [rgba])
  }

  async finish(): Promise<Uint8Array> {
    const response = await this.request({ type: 'finish' })
    if (response.type !== 'finished') throw new Error('El codificador de video no terminó el archivo.')
    return new Uint8Array(response.mp4)
  }

  terminate(): void {
    this.worker.terminate()
  }
}

/**
 * Renders and encodes the video frame by frame (t = i / fps), never in real time: however
 * slow the machine, every frame is exactly the one the preview shows at that time. The
 * result is an MP4 (H.264 Constrained Baseline, BT.709, moov first) checked before it is
 * handed over.
 */
export async function encodeVideo(job: EncodeJob): Promise<Blob> {
  const { fps } = job.format
  const total = frameCountFor(job.duration, fps)
  if (total === 0) throw new Error('El video no tiene duración.')
  const encoder = new EncoderWorker()
  try {
    job.onStep?.('Preparando el codificador…')
    await encoder.start(job.format)
    for (let i = 0; i < total; i++) {
      job.signal?.throwIfAborted()
      const buffer = await encoder.nextBuffer()
      job.drawFrame(i / fps)
      job.readPixels(new Uint8Array(buffer))
      encoder.encode(buffer)
      job.onProgress?.(i + 1, total)
    }
    job.onStep?.('Cerrando el archivo…')
    const raw = await encoder.finish()
    job.signal?.throwIfAborted()
    return await finishMp4(raw, job.format, total, job.onStep)
  } finally {
    encoder.terminate()
  }
}
