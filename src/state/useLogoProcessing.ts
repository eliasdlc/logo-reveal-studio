import { useEffect, useRef } from 'react'
import { processLogo } from '../processing/pipeline'
import { useStudio } from './store'

/** Delay before re-processing while a slider is being dragged. */
const DEBOUNCE_MS = 150

/**
 * Re-runs the processing pipeline whenever something that changes the texture changes.
 * The manual scale only matters for SVGs (they're rasterized for their on-screen size).
 */
export function useLogoProcessing(): void {
  const logo = useStudio((s) => s.logo)
  const resolution = useStudio((s) => s.resolution)
  const setProcessed = useStudio((s) => s.setProcessed)
  const lastId = useRef<string | null>(null)

  const id = logo?.id
  const source = logo?.source
  const { removeWhite, whiteThreshold, removeEnclosedWhite, scale } = logo?.options ?? {}
  const svgScale = source?.kind === 'svg' ? scale : 1

  useEffect(() => {
    if (!id || !source) return
    const isNew = lastId.current !== id
    lastId.current = id
    const timer = setTimeout(
      () => {
        try {
          const processed = processLogo(source, {
            removeWhite: removeWhite!,
            whiteThreshold: whiteThreshold!,
            removeEnclosedWhite: removeEnclosedWhite!,
            scale: svgScale!,
            outputHeight: resolution,
          })
          setProcessed(id, { processed })
        } catch (e) {
          setProcessed(id, { error: e instanceof Error ? e.message : 'No se pudo procesar la imagen.' })
        }
      },
      isNew ? 0 : DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [id, source, removeWhite, whiteThreshold, removeEnclosedWhite, svgScale, resolution, setProcessed])
}
