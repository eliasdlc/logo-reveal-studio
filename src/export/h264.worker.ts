/*
 * H.264 encoding off the main thread, so rendering the next frame and encoding the last
 * one happen at the same time. The encoder (h264-mp4-encoder: minih264 in WebAssembly) is
 * the same in every browser, so every export is the same kind of file.
 */
import type { H264MP4Encoder } from 'h264-mp4-encoder'
import { i420Size, rgbaToI420 } from './yuv'

export type WorkerRequest =
  | {
      type: 'init'
      scriptUrl: string
      width: number
      height: number
      fps: number
      kbps: number
      speed: number
      keyFrameInterval: number
    }
  | { type: 'frame'; rgba: ArrayBuffer }
  | { type: 'finish' }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'frame-done'; rgba: ArrayBuffer }
  | { type: 'finished'; mp4: ArrayBuffer }
  | { type: 'error'; message: string }

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope

let encoder: H264MP4Encoder | null = null
let yuv = new Uint8Array(0)
let width = 0
let height = 0

/** The encoder ships as a classic script defining a global `HME`; evaluate it here. */
async function loadEncoderModule(url: string): Promise<{ createH264MP4Encoder: () => Promise<H264MP4Encoder> }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`No se pudo cargar el codificador de video (${response.status}).`)
  const code = await response.text()
  return new Function(`${code}\nreturn HME`)()
}

async function handle(message: WorkerRequest): Promise<void> {
  switch (message.type) {
    case 'init': {
      const module = await loadEncoderModule(message.scriptUrl)
      encoder = await module.createH264MP4Encoder()
      width = message.width
      height = message.height
      encoder.width = width
      encoder.height = height
      encoder.frameRate = message.fps
      encoder.kbps = message.kbps
      encoder.speed = message.speed
      encoder.groupOfPictures = message.keyFrameInterval
      encoder.initialize()
      yuv = new Uint8Array(i420Size(width, height))
      scope.postMessage({ type: 'ready' })
      return
    }
    case 'frame': {
      if (!encoder) throw new Error('El codificador no está listo.')
      rgbaToI420(new Uint8Array(message.rgba), width, height, yuv, true)
      encoder.addFrameYuv(yuv)
      // The buffer goes back to be filled with another frame.
      scope.postMessage({ type: 'frame-done', rgba: message.rgba }, [message.rgba])
      return
    }
    case 'finish': {
      if (!encoder) throw new Error('El codificador no está listo.')
      encoder.finalize()
      const mp4 = encoder.FS.readFile(encoder.outputFilename).slice().buffer
      encoder.FS.unlink(encoder.outputFilename)
      encoder.delete()
      encoder = null
      scope.postMessage({ type: 'finished', mp4 }, [mp4])
    }
  }
}

// Messages are handled strictly one after another, in order.
let queue = Promise.resolve()
scope.onmessage = (event) => {
  queue = queue.then(() =>
    handle(event.data).catch((error: unknown) => {
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    }),
  )
}
