import { useEffect, useRef, useState } from 'react'
import { LogoStage } from '../engine/stage'
import { programLength } from '../engine/timeline'
import { previewProgram } from '../state/program'
import { useStudio } from '../state/store'

/** 16:9 live preview. Draws through the same LogoStage.renderFrame(t) the exporter uses. */
export function Preview() {
  const containerRef = useRef<HTMLDivElement>(null)
  const playing = useStudio((s) => s.playing)
  // Bumped when the GPU context is lost, to start over with a fresh canvas and stage.
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const container = containerRef.current!
    // The canvas is created here (not in JSX) so each stage owns a fresh WebGL context.
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 h-full w-full'
    container.appendChild(canvas)
    const stage = new LogoStage(canvas)
    const stopWatchingContext = stage.onContextLost(() => setGeneration((g) => g + 1))

    const draw = () => {
      const s = useStudio.getState()
      stage.setSettings(s.settings)
      stage.setProgram(previewProgram(s))
      stage.renderFrame(s.time)
    }

    // Render at the canvas' real device-pixel size so the browser never rescales it (blur).
    // devicePixelContentBoxSize is exact when available, but isn't always updated for
    // emulated/zoomed pixel ratios, so it's only trusted when it agrees with CSS size × DPR.
    const resize = new ResizeObserver(([entry]) => {
      const dpr = window.devicePixelRatio
      const cssW = entry.contentRect.width * dpr
      const cssH = entry.contentRect.height * dpr
      const box = entry.devicePixelContentBoxSize?.[0]
      const exact = box && Math.abs(box.inlineSize - cssW) <= 1 && Math.abs(box.blockSize - cssH) <= 1
      stage.setSize(exact ? box.inlineSize : Math.round(cssW), exact ? box.blockSize : Math.round(cssH))
      draw()
    })
    resize.observe(canvas)
    const unsubscribe = useStudio.subscribe(draw)

    // Re-measure when the pixel ratio changes (browser zoom, moving to another monitor).
    let dprQuery: MediaQueryList | null = null
    const watchDpr = () => {
      dprQuery?.removeEventListener('change', onDprChange)
      dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      dprQuery.addEventListener('change', onDprChange)
    }
    const onDprChange = () => {
      resize.unobserve(canvas)
      resize.observe(canvas)
      watchDpr()
    }
    watchDpr()

    return () => {
      stopWatchingContext()
      dprQuery?.removeEventListener('change', onDprChange)
      unsubscribe()
      resize.disconnect()
      stage.dispose()
      canvas.remove()
    }
  }, [generation])

  // Playback clock: only advances `time`; drawing happens through the store subscription.
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const state = useStudio.getState()
      const { time, loop, setTime, setPlaying } = state
      const length = programLength(previewProgram(state))
      if (length <= 0) {
        // Nothing to play yet (no processed logos): idle until there is.
        last = now
        frame = requestAnimationFrame(tick)
        return
      }
      let next = time + (now - last) / 1000
      last = now
      if (next >= length) {
        if (loop) next %= length
        else {
          setTime(length)
          setPlaying(false)
          return
        }
      }
      setTime(next)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-900 shadow-2xl ring-1 ring-white/10"
    />
  )
}
