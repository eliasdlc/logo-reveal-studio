import { LogoStage } from '../engine/stage'
import { programLength, type Program } from '../engine/timeline'
import type { StageLogo, StageSettings } from '../engine/types'
import { chooseCodec, hasWebCodecs, type CodecChoice, type VideoFormat } from './codec'
import { encodeMp4, frameCountFor } from './encode'

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
      `Este navegador no puede codificar H.264 a ${format.width}×${format.height} ${format.fps} fps. ` +
        'Prueba con una resolución o fps más bajos.',
    )
  }
  return codec
}

export const programFrameCount = (program: Program, fps: number): number => frameCountFor(programLength(program), fps)

/** Renders a program to an MP4 with its own off-screen stage at the export size. */
export async function exportProgramMp4(job: ProgramExport, codec?: CodecChoice): Promise<Blob> {
  if (job.program.items.length === 0) throw new ExportError('No hay logos listos para exportar.')
  codec ??= await requireCodec(job.format)

  const canvas = new OffscreenCanvas(job.format.width, job.format.height)
  const stage = new LogoStage(canvas, { preserveDrawingBuffer: true })
  try {
    stage.setSize(job.format.width, job.format.height)
    stage.setSettings(job.settings)
    stage.setProgram(job.program)
    return await encodeMp4({
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
