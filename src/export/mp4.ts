import {
  BlobSource,
  BufferSource,
  BufferTarget,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import { codecString, levelFor, peakBitrate, withLevel, withLevelInPacket, type VideoFormat } from './codec'

/** How the pixels are stored (see yuv.ts), declared in the file so players show exact colors. */
const BT709: VideoColorSpaceInit = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }

export class VideoCheckError extends Error {}

const toBytes = (data: AllowSharedBufferSource): Uint8Array =>
  // (SharedArrayBuffer isn't defined on pages that aren't cross-origin isolated.)
  ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)

/**
 * Rewrites the encoder's MP4 as the final file: exact timestamps (frame i at i / fps),
 * the H.264 level that matches its real size, rate and bitrate, BT.709 color information
 * and the index (moov) at the start so it can play while it downloads. Then checks it.
 */
export async function finishMp4(
  raw: Uint8Array,
  format: VideoFormat,
  frames: number,
  onStep?: (step: string) => void,
): Promise<Blob> {
  onStep?.('Preparando el MP4…')
  const input = new Input({ source: new BufferSource(raw), formats: [MP4] })
  const track = await input.getPrimaryVideoTrack()
  const config = await track?.getDecoderConfig()
  if (!track || track.codec !== 'avc' || !config?.description) throw new VideoCheckError('El codificador no produjo H.264.')

  const packets: EncodedPacket[] = []
  for await (const packet of new EncodedPacketSink(track).packets()) packets.push(packet)
  if (packets.length !== frames) {
    throw new VideoCheckError(`El codificador entregó ${packets.length} de ${frames} frames.`)
  }

  const level = levelFor(format, peakBitrate(packets.map((p) => p.data.byteLength), format.fps))
  const avcC = withLevel(toBytes(config.description), level)
  const lengthSize = (avcC[4] & 0x03) + 1

  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const source = new EncodedVideoPacketSource('avc')
  output.addVideoTrack(source, { frameRate: format.fps })
  await output.start()
  const duration = 1 / format.fps
  for (const [i, packet] of packets.entries()) {
    const data = withLevelInPacket(packet.data, lengthSize, level)
    await source.add(
      new EncodedPacket(data, packet.type, i * duration, duration),
      i === 0
        ? {
            decoderConfig: {
              codec: codecString(avcC),
              codedWidth: format.width,
              codedHeight: format.height,
              description: avcC,
              colorSpace: BT709,
            },
          }
        : undefined,
    )
  }
  await output.finalize()
  const blob = new Blob([target.buffer!], { type: 'video/mp4' })

  onStep?.('Verificando el video…')
  await verifyMp4(blob, format, frames)
  return blob
}

/**
 * Reads the finished file back as a player would and fails if anything is off: container,
 * codec, size, frame count, duration, keyframes and, where the browser can decode H.264,
 * every single frame.
 */
export async function verifyMp4(blob: Blob, format: VideoFormat, frames: number): Promise<void> {
  const fail = (what: string) => {
    throw new VideoCheckError(`El video no pasó la verificación (${what}). Vuelve a exportar.`)
  }
  const input = new Input({ source: new BlobSource(blob), formats: [MP4] })
  const tracks = await input.getTracks().catch(() => [])
  const track = await input.getPrimaryVideoTrack().catch(() => null)
  if (!track || tracks.length !== 1) return fail('estructura del MP4')
  if (track.codec !== 'avc') return fail('códec')
  if ((await track.getCodedWidth()) !== format.width || (await track.getCodedHeight()) !== format.height) {
    return fail('tamaño')
  }
  const config = await track.getDecoderConfig()
  if (!config?.description) return fail('configuración H.264')

  const packets: EncodedPacket[] = []
  for await (const packet of new EncodedPacketSink(track).packets()) packets.push(packet)
  if (packets.length !== frames) return fail(`${packets.length} de ${frames} frames`)
  if (packets[0].type !== 'key') return fail('primer frame')
  const expected = frames / format.fps
  if (Math.abs((await input.computeDuration()) - expected) > 1 / format.fps) return fail('duración')
  const keyGap = packets.reduce(
    (state, p, i) => (p.type === 'key' ? { last: i, max: Math.max(state.max, i - state.last) } : state),
    { last: 0, max: 0 },
  )
  if (Math.max(keyGap.max, packets.length - keyGap.last) > Math.ceil(format.fps) * 2) return fail('keyframes')

  await decodeAll(config, packets, fail)
}

/** Decodes every frame when the browser has an H.264 decoder; any error fails the check. */
async function decodeAll(config: VideoDecoderConfig, packets: EncodedPacket[], fail: (what: string) => never) {
  if (typeof VideoDecoder === 'undefined') return
  const support = await VideoDecoder.isConfigSupported(config).catch(() => null)
  if (!support?.supported) return
  let decoded = 0
  let error: unknown = null
  const decoder = new VideoDecoder({
    output: (frame) => {
      decoded++
      frame.close()
    },
    error: (e) => {
      error = e
    },
  })
  try {
    decoder.configure(config)
    for (const packet of packets) {
      decoder.decode(packet.toEncodedVideoChunk())
      // Keep the queue short so memory stays flat on long or 4K videos.
      while (decoder.decodeQueueSize > 8 && !error) await new Promise((r) => setTimeout(r, 1))
      if (error) break
    }
    if (!error) await decoder.flush()
  } catch (e) {
    error ??= e
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }
  if (error) fail('un frame no se pudo decodificar')
  if (decoded !== packets.length) fail(`se decodificaron ${decoded} de ${packets.length} frames`)
}
