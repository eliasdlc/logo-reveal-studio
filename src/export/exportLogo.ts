import { LogoStage } from '../engine/stage'
import { clipLength, type ClipSpec } from '../engine/timeline'
import type { StageLogo, StageSettings } from '../engine/types'
import { chooseCodec, hasWebCodecs, type VideoFormat } from './codec'
import { encodeMp4 } from './encode'

export interface LogoExport {
  logo: StageLogo
  scale: number
  clip: ClipSpec
  settings: StageSettings
  format: VideoFormat
  signal?: AbortSignal
  onProgress?: (framesDone: number, totalFrames: number) => void
}

export class ExportError extends Error {}

/** Renders one logo's clip to an MP4 with its own off-screen stage at the export size. */
export async function exportLogoMp4(job: LogoExport): Promise<Blob> {
  if (!hasWebCodecs()) {
    throw new ExportError('Este navegador no soporta WebCodecs. Usa Chrome o Edge de escritorio actualizados.')
  }
  const codec = await chooseCodec(job.format)
  if (!codec) {
    throw new ExportError(
      `Este navegador no puede codificar H.264 a ${job.format.width}×${job.format.height} ${job.format.fps} fps. ` +
        'Prueba con una resolución o fps más bajos.',
    )
  }

  const canvas = new OffscreenCanvas(job.format.width, job.format.height)
  const stage = new LogoStage(canvas, { preserveDrawingBuffer: true })
  try {
    stage.setSize(job.format.width, job.format.height)
    stage.setSettings(job.settings)
    stage.setLogo(job.logo)
    stage.setLogoScale(job.scale)
    stage.setClip(job.clip)
    return await encodeMp4({
      canvas,
      format: job.format,
      codec,
      duration: clipLength(job.clip),
      drawFrame: (t) => stage.renderFrame(t),
      signal: job.signal,
      onProgress: job.onProgress,
    })
  } finally {
    stage.dispose()
  }
}
