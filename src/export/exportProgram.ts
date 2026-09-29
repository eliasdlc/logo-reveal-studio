import { LogoStage } from '../engine/stage'
import { programLength, type Program } from '../engine/timeline'
import type { StageLogo, StageSettings } from '../engine/types'
import type { VideoFormat } from './codec'
import { encodeVideo, frameCountFor } from './encode'

export class ExportError extends Error {}

export interface ProgramExport {
  program: Program<StageLogo>
  settings: StageSettings
  format: VideoFormat
  signal?: AbortSignal
  onProgress?: (framesDone: number, totalFrames: number) => void
  onStep?: (step: string) => void
}

export const programFrameCount = (program: Program, fps: number): number => frameCountFor(programLength(program), fps)

/** Renders a program to an MP4 with its own off-screen stage at the export size. */
export async function exportProgramVideo(job: ProgramExport): Promise<Blob> {
  if (job.program.items.length === 0) throw new ExportError('No hay logos listos para exportar.')

  const canvas = new OffscreenCanvas(job.format.width, job.format.height)
  const stage = new LogoStage(canvas, { preserveDrawingBuffer: true })
  try {
    stage.setSize(job.format.width, job.format.height)
    stage.setSettings(job.settings)
    stage.setProgram(job.program)
    return await encodeVideo({
      format: job.format,
      duration: programLength(job.program),
      drawFrame: (t) => stage.renderFrame(t),
      readPixels: (target) => stage.readPixels(target),
      signal: job.signal,
      onProgress: job.onProgress,
      onStep: job.onStep,
    })
  } finally {
    stage.dispose()
  }
}
