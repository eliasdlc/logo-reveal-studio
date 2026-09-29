import { useEffect, useRef } from 'react'
import { processLogo, type ProcessOptions } from '../processing/pipeline'
import { useStudio, type LogoItem } from './store'

/** Delay before re-processing while a slider is being dragged. */
const DEBOUNCE_MS = 150

interface Job {
  key: string
  timer: ReturnType<typeof setTimeout>
}

function optionsFor(logo: LogoItem, outputHeight: number): ProcessOptions {
  const { removeWhite, whiteThreshold, removeEnclosedWhite, scale } = logo.options
  return {
    removeWhite,
    whiteThreshold,
    removeEnclosedWhite,
    // Only SVGs depend on the scale: they're rasterized for their on-screen size.
    scale: logo.source.kind === 'svg' ? scale : 1,
    outputHeight,
  }
}

/**
 * Keeps every logo's processed texture in sync with its options and the export
 * resolution. Each logo is (re)processed only when something that affects it changes.
 */
export function useLogoProcessing(): void {
  const logos = useStudio((s) => s.logos)
  const resolution = useStudio((s) => s.resolution)
  const setProcessed = useStudio((s) => s.setProcessed)
  const done = useRef(new Map<string, string>())
  const pending = useRef(new Map<string, Job>())

  useEffect(() => {
    const alive = new Set(logos.map((logo) => logo.id))
    for (const [id, job] of pending.current) {
      if (!alive.has(id)) {
        clearTimeout(job.timer)
        pending.current.delete(id)
      }
    }
    for (const id of done.current.keys()) if (!alive.has(id)) done.current.delete(id)

    logos.forEach((logo, index) => {
      const options = optionsFor(logo, resolution)
      const key = JSON.stringify(options)
      if (done.current.get(logo.id) === key || pending.current.get(logo.id)?.key === key) return

      const isNew = !done.current.has(logo.id)
      clearTimeout(pending.current.get(logo.id)?.timer)
      // New logos are staggered so a batch upload keeps the UI responsive between them.
      const delay = isNew ? index * 10 : DEBOUNCE_MS
      const timer = setTimeout(() => {
        pending.current.delete(logo.id)
        done.current.set(logo.id, key)
        try {
          setProcessed(logo.id, { processed: processLogo(logo.source, options) })
        } catch (e) {
          setProcessed(logo.id, { error: e instanceof Error ? e.message : 'No se pudo procesar la imagen.' })
        }
      }, delay)
      pending.current.set(logo.id, { key, timer })
    })
  }, [logos, resolution, setProcessed])

  useEffect(
    () => () => {
      for (const job of pending.current.values()) clearTimeout(job.timer)
    },
    [],
  )
}
