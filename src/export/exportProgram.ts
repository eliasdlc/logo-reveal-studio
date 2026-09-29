import { LogoStage } from '../engine/stage'
import { programLength, type Program } from '../engine/timeline'
import type { StageLogo, StageSettings } from '../engine/types'
import { chooseCodec, hasWebCodecs, type CodecChoice, type VideoFormat } from './codec'
import { encodeVideo, frameCountFor } from './encode'

export class ExportError extends Error {}

export interface ProgramExport {
  program: Program<StageLogo>
  settings: StageSettings
  format: VideoFormat
  signal?: AbortSignal
  onProgress?: (framesDone: number, totalFrames: number) => void
}

/** Checks up front that this browser can encode the format; throws a readable error if not. */
export async function requireCodec(format: VideoFormat): Promise<CodecChoice> {
  if (!hasWebCodecs()) {
    throw new ExportError('Este navegador no soporta WebCodecs. Usa Chrome o Edge de escritorio actualizados.')
  }
  const codec = await chooseCodec(format)
  if (!codec) {
    throw new ExportError(
      `Este navegador no puede codificar video a ${format.width}×${format.height} ${format.fps} fps ` +
        '(ni H.264 ni VP9). Prueba con una resolución o fps más bajos.',
    )
  }
  return codec
}

export const programFrameCount = (program: Program, fps: number): number => frameCountFor(programLength(program), fps)

/**
 * Renders a program to a video (MP4, or WebM with the VP9 fallback) with its own
 * off-screen stage at the export size.
 */
export async function exportProgramVideo(job: ProgramExport, codec: CodecChoice): Promise<Blob> {
  if (job.program.items.length === 0) throw new ExportError('No hay logos listos para exportar.')

  const canvas = new OffscreenCanvas(job.format.width, job.format.height)
  const stage = new LogoStage(canvas, { preserveDrawingBuffer: true })
  try {
    stage.setSize(job.format.width, job.format.height)
    stage.setSettings(job.settings)
    stage.setProgram(job.program)
    return await encodeVideo({
      canvas,
      format: job.format,
      codec,
      duration: programLength(job.program),
      drawFrame: (t) => stage.renderFrame(t),
      signal: job.signal,
      onProgress: job.onProgress,
    })
  } finally {
    stage.dispose()
  }
}
